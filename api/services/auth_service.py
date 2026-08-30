# api/services/auth_service.py
from fastapi import HTTPException
from google.oauth2 import id_token
from google.auth.transport import requests
import os
import bcrypt
import json
import hashlib
import secrets
import logging
from datetime import datetime, timedelta, timezone

from repositories.user_repo import UserRepository
from models import UserLogin, ProgressUpdate, AssessmentUpdateRequest
from database import get_db_connection
from security import create_access_token
from services import mail_service
from services.mail_service import SUPPORT_EMAIL

logger = logging.getLogger(__name__)

# How long a password reset link stays valid for.
RESET_TOKEN_TTL_MINUTES = 30

# How long an email-verification link stays valid for.
VERIFICATION_TOKEN_TTL_HOURS = 24

# SECURITY: per-account brute-force lockout thresholds. Independent of the
# per-IP rate limit on the /login route -- this one follows the account
# regardless of how many different IPs an attacker spreads the attempts
# across (credential stuffing, botnets, etc.).
#
# Tuned to be a safety net against sustained automated attacks, not a trap
# for someone who fat-fingers their own password a few times: 10 wrong
# attempts (not 5) before anything happens, only a 5-minute cooldown (not
# 15), and the counter resets itself if 20 minutes pass without another
# failure -- so a handful of typos spread across a session never adds up to
# a lock, only a real burst of rapid-fire attempts does.
LOGIN_LOCKOUT_THRESHOLD = 10
LOGIN_LOCKOUT_MINUTES = 5
LOGIN_ATTEMPT_DECAY_MINUTES = 20

class AuthService:
    @staticmethod
    def hash_password(password: str) -> str:
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
        return hashed.decode('utf-8')

    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        try:
            if isinstance(hashed_password, str):
                hashed_password = hashed_password.encode('utf-8')
            if isinstance(plain_password, str):
                plain_password = plain_password.encode('utf-8')
                
            return bcrypt.checkpw(plain_password, hashed_password)
        except (ValueError, TypeError):
            return False

    @staticmethod
    def login(req: UserLogin):
        user = UserRepository.find_by_email(req.email)

        # SECURITY: check the lockout BEFORE verifying the password. If we
        # checked after, a locked account with a correctly-guessed password
        # would still log in (defeating the lockout entirely), and checking
        # order would leak "was that the right password?" through timing/
        # response differences.
        if user and user.get("locked_until"):
            locked_until = user["locked_until"]
            if locked_until.tzinfo is None:
                locked_until = locked_until.replace(tzinfo=timezone.utc)
            if locked_until > datetime.now(timezone.utc):
                remaining_minutes = max(1, int((locked_until - datetime.now(timezone.utc)).total_seconds() // 60) + 1)
                logger.warning(f"Rejected login for locked account: {req.email} ({remaining_minutes}m remaining)")
                raise HTTPException(
                    status_code=429,
                    detail=(
                        f"For your account's security, sign-in is paused for about "
                        f"{remaining_minutes} more minute(s) after several incorrect attempts. "
                        f"Please try again shortly, or contact an administrator at "
                        f"{SUPPORT_EMAIL} if you need help sooner."
                    )
                )

        stored_password = user.get("password") if user else None

        if not user or not stored_password or not AuthService.verify_password(req.password, stored_password):
            # SECURITY: log failed login attempts (email + reason only --
            # never the submitted password) so repeated failures against one
            # account or a burst across many accounts from one client shows
            # up in server logs/monitoring as brute-force / credential-
            # stuffing activity. Rate limiting (5/minute/IP on this route)
            # is the primary defense; this is the detection/audit trail.
            logger.warning(f"Failed login attempt for email={req.email}: invalid credentials")

            # Only track/lock attempts against accounts that actually exist
            # -- there's nothing to lock otherwise, and it keeps this from
            # writing rows for typo'd/nonexistent emails.
            if user:
                new_count = UserRepository.increment_failed_login(user["email"], LOGIN_ATTEMPT_DECAY_MINUTES)
                if new_count is not None and new_count >= LOGIN_LOCKOUT_THRESHOLD:
                    UserRepository.lock_account(user["email"], LOGIN_LOCKOUT_MINUTES)
                    logger.warning(
                        f"Account locked after {new_count} failed attempts: {user['email']} "
                        f"({LOGIN_LOCKOUT_MINUTES}m lockout)"
                    )

            raise HTTPException(
                status_code=401, 
                detail="Invalid credentials."
            )

        # SECURITY FIX: an admin's "suspend/deactivate user" action previously
        # had no effect at login -- a suspended account could still sign in
        # normally. Block anything other than an "active" status.
        if user.get("status", "active") != "active":
            logger.warning(f"Rejected login for suspended account: {req.email}")
            raise HTTPException(
                status_code=403,
                detail=f"This account has been suspended. Contact an administrator at {SUPPORT_EMAIL} for help."
            )

        # SECURITY: accounts must be verified before they can sign in.
        # Email/password signups (signup_with_email) start unverified and
        # only flip to verified once the person clicks the link emailed to
        # them (see verify_email below). Google-SSO sign-in (google_login)
        # inserts the row already verified, since Google has confirmed the
        # address as part of its own OAuth flow. An admin can also flip a
        # stuck account to verified by hand from Admin > User Management.
        if not user.get("is_verified", True):
            logger.warning(f"Rejected login for unverified account: {req.email}")
            raise HTTPException(
                status_code=403,
                detail=f"This account hasn't been verified yet. Contact an administrator at {SUPPORT_EMAIL} for help."
            )

        # Correct password + account in good standing: clear any lockout
        # state so it doesn't outlive its purpose.
        UserRepository.reset_login_attempts(user["email"])

        # BUG FIX: sign the token with the email exactly as stored in the
        # DB, not whatever casing the person typed at the login form. Every
        # other authenticated route trusts this "sub" claim and compares it
        # case-sensitively against the DB, so a token minted with the typed
        # (possibly differently-cased) email could itself cause the same
        # "looks logged in but nothing matches" symptom one layer down.
        canonical_email = user.get("email", req.email)
        # SECURITY: embed the account's current token_version as "tv" so
        # this token can be revoked later (password reset, logout-all)
        # without needing a growing blocklist table -- see security.py's
        # get_current_user_email, which rejects any token whose "tv" no
        # longer matches the account's live token_version.
        token = create_access_token({"sub": canonical_email, "tv": user.get("token_version", 0)})

        return {
            "status": "success",
            "email": canonical_email,
            "name": user.get("name"),
            "role": user.get("role", "user"),
            "isAdmin": user.get("isAdmin", False) or user.get("is_admin", False),
            "progress": user.get("progress", {}),
            "assessments": user.get("assessments", {}),
            "onboarding_state": user.get("onboarding_state", {}),
            "token": token
        }

    @staticmethod
    def signup_with_email(email: str, username: str, password: str, origin: str = None):
        """
        Classic email/password signup. The account is created unverified
        and a verification link is emailed to the address the person typed
        in; they must click it (see verify_email below) before they can log
        in (see the is_verified gate in login() above).
        """
        if UserRepository.find_by_email(email):
            raise HTTPException(status_code=400, detail="Email already registered")

        hashed_password = AuthService.hash_password(password)

        UserRepository.insert({
            "name": username,
            "email": email,
            "password": hashed_password,
            "role": "user",
            "isAdmin": False,
            "is_verified": False,
            "progress": {},
            "assessments": {},
            "onboarding_state": {
                "tourSeen": False,
                "completedAt": None,
                "pages": {}
            }
        })

        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        expires_at = datetime.now(timezone.utc) + timedelta(hours=VERIFICATION_TOKEN_TTL_HOURS)
        UserRepository.set_verification_token(email, token_hash, expires_at)

        sent = mail_service.send_verification_email(email, username, raw_token, origin=origin)
        if not sent:
            logger.error(f"Failed to send verification email to {email}")

        # emailSent tells the frontend whether to show the normal "check
        # your inbox" instructions or the "we couldn't send it, contact an
        # admin" fallback -- the account exists and is unverified either
        # way, so the person is never silently stuck with no path forward.
        return {
            "status": "success",
            "message": "Account created! Check your email for a link to verify your account before signing in.",
            "emailSent": sent
        }

    @staticmethod
    def resend_verification_email(email: str, origin: str = None):
        """
        Re-sends the signup verification link. Mirrors forgot_password's
        enumeration-safe pattern: always returns the same generic response
        so this endpoint can't be used to probe which emails have accounts,
        are already verified, or are suspended.
        """
        generic_response = {
            "status": "success",
            "message": "If that account needs verifying, we've sent a new verification link."
        }

        user = UserRepository.find_by_email(email)
        if not user:
            logger.info(f"Verification resend requested for an email with no account: {email}")
            return generic_response

        if user.get("status", "active") != "active":
            logger.warning(f"Ignored verification resend for suspended account: {email}")
            return generic_response

        if user.get("is_verified", True):
            # Already verified -- nothing to resend. Don't reveal that via
            # the response; the person can just go sign in.
            logger.info(f"Verification resend requested for an already-verified account: {email}")
            return generic_response

        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        expires_at = datetime.now(timezone.utc) + timedelta(hours=VERIFICATION_TOKEN_TTL_HOURS)
        UserRepository.set_verification_token(email, token_hash, expires_at)

        sent = mail_service.send_verification_email(email, user.get("name", ""), raw_token, origin=origin)
        if not sent:
            logger.error(f"Failed to resend verification email to {email}")

        return generic_response

    @staticmethod
    def verify_email(token: str):
        """
        Verifies a signup email-verification token, activates the account,
        and logs the person straight in (same pattern as reset_password).
        """
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        user = UserRepository.find_by_verification_token_hash(token_hash)

        if not user or not user.get("verification_token_expires"):
            raise HTTPException(status_code=400, detail="This verification link is invalid or has expired.")

        expires_at = user["verification_token_expires"]
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)

        if expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="This verification link is invalid or has expired.")

        if user.get("status", "active") != "active":
            raise HTTPException(status_code=403, detail=f"This account has been suspended. Contact an administrator at {SUPPORT_EMAIL} for help.")

        UserRepository.mark_verified(user["email"])

        full_user = UserRepository.find_by_email(user["email"])
        token_value = create_access_token({"sub": user["email"]})

        return {
            "status": "success",
            "email": user["email"],
            "name": full_user.get("name") if full_user else user.get("name"),
            "role": full_user.get("role", "user") if full_user else "user",
            "isAdmin": (full_user.get("isAdmin", False) or full_user.get("is_admin", False)) if full_user else False,
            "progress": full_user.get("progress", {}) if full_user else {},
            "assessments": full_user.get("assessments", {}) if full_user else {},
            "onboarding_state": full_user.get("onboarding_state", {}) if full_user else {},
            "token": token_value
        }

    @staticmethod
    def update_progress(req: ProgressUpdate):
        if not req.email or not req.lesson_id:
            return {"status": "ignored", "message": "Fired before state loaded"}
            
        if "guest" in req.email.lower():
            return {"status": "ignored", "message": "Guest persistence disabled"}

        try:
            score_val = float(req.score) if req.score is not None else 0.0
        except:
            score_val = 0.0

        UserRepository.update_progress(req.email, req.lesson_id, score_val)
        user = UserRepository.find_by_email(req.email)
        return {
            "status": "success",
            "progress": user.get("progress", {}) if user else {}
        }

    @staticmethod
    def update_assessment(req: AssessmentUpdateRequest):
        if not req.email or not req.assessment_key:
            return {"status": "ignored", "message": "Fired before state loaded"}
            
        if "guest" in req.email.lower():
            return {"status": "ignored", "message": "Guest persistence disabled"}

        save_data = {
            "score": req.score,
            "correct": req.correct,
            "total": req.total,
            "timeElapsed": req.timeElapsed,
            "completedAt": req.completedAt,
            "attempts": req.attempts,
            "answers": req.answers,
            "questionIds": req.questionIds,
        }
            
        UserRepository.update_assessment(req.email, req.assessment_key, save_data)
        user = UserRepository.find_by_email(req.email)
        return {
            "status": "success",
            "assessments": user.get("assessments", {}) if user else {}
        }

    @staticmethod
    def get_progress(email: str):
        user = UserRepository.find_by_email(email)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return {
            "status": "success",
            "progress": user.get("progress", {})
        }

    @staticmethod
    def get_assessments(email: str):
        user = UserRepository.find_by_email(email)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return {
            "status": "success",
            "assessments": user.get("assessments", {})
        }

    @staticmethod
    def forgot_password(email: str, origin: str = None):
        """
        Always returns the same generic response whether or not the email is
        registered, so this endpoint can't be used to enumerate accounts.
        """
        generic_response = {
            "status": "success",
            "message": "If an account with that email exists, a password reset link has been sent."
        }

        user = UserRepository.find_by_email(email)
        if not user:
            logger.info(f"Password reset requested for an email with no account: {email}")
            return generic_response

        # BUG FIX: a suspended account could still request (and complete) a
        # password reset, letting a suspended user regain account access by
        # just resetting their own password. Silently skip issuing a token
        # for non-active accounts, but still return the generic response --
        # otherwise a suspended user's email would get a different response
        # than a normal one, leaking suspension status through this endpoint.
        if user.get("status", "active") != "active":
            logger.warning(f"Ignored password reset request for suspended account: {email}")
            return generic_response

        # BUG FIX: an account that never verified its email could still
        # request (and complete) a password reset -- letting someone reset
        # the password on an account before ever proving they own the inbox,
        # and letting an unverified account bypass the "must verify before
        # sign-in" gate in login() entirely (reset password -> the reset
        # itself doesn't set is_verified, but nothing stopped them from
        # trying). Silently skip issuing a token here, same generic-response
        # pattern as the suspended-account case above, so this endpoint still
        # can't be used to enumerate accounts or their verification status.
        if not user.get("is_verified", True):
            logger.warning(f"Ignored password reset request for unverified account: {email}")
            return generic_response

        # Generate a real reset token immediately and email it straight to
        # the user via Gmail SMTP -- no admin approval step in between.
        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=RESET_TOKEN_TTL_MINUTES)

        UserRepository.set_reset_token(email, token_hash, expires_at)

        sent = mail_service.send_password_reset_email(email, user.get("name"), raw_token, origin=origin)
        if not sent:
            logger.error(f"Failed to send password reset email to {email}")

        return generic_response

    @staticmethod
    def list_pending_password_resets():
        return UserRepository.find_pending_reset_requests()

    @staticmethod
    def approve_password_reset(email: str, origin: str = None):
        """Legacy admin override, kept for accounts stuck from the old
        manual-approval workaround. Issues a reset token directly and
        returns the link so an admin can hand it to the user by hand
        (chat, phone, in person) -- this is an intentional out-of-band
        delivery path (see AdminUserManagement.jsx's confirm dialog), not
        an oversight, so the raw link is returned here on purpose. Not part
        of the normal flow anymore -- forgot_password() above emails the
        token itself now."""
        user = UserRepository.find_by_email(email)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=RESET_TOKEN_TTL_MINUTES)

        rowcount = UserRepository.approve_password_reset(email, token_hash, expires_at)
        if rowcount == 0:
            raise HTTPException(status_code=404, detail="User not found")

        reset_link = f"{mail_service._resolve_frontend_url(origin)}/reset-password?token={raw_token}"
        return {"status": "success", "reset_link": reset_link, "expires_at": expires_at.isoformat()}

    @staticmethod
    def deny_password_reset(email: str):
        rowcount = UserRepository.deny_password_reset(email)
        if rowcount == 0:
            raise HTTPException(status_code=404, detail="User not found")
        return {"status": "success"}

    @staticmethod
    def verify_reset_token(token: str):
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        user = UserRepository.find_by_reset_token_hash(token_hash)

        if not user or not user.get("reset_token_expires"):
            return {"valid": False}

        expires_at = user["reset_token_expires"]
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)

        if expires_at < datetime.now(timezone.utc):
            return {"valid": False}

        return {"valid": True}

    @staticmethod
    def reset_password(token: str, new_password: str):
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        user = UserRepository.find_by_reset_token_hash(token_hash)

        if not user or not user.get("reset_token_expires"):
            raise HTTPException(status_code=400, detail="Invalid or expired reset link.")

        expires_at = user["reset_token_expires"]
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)

        if expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="Invalid or expired reset link.")

        # BUG FIX: defense in depth -- if an account gets suspended *after* a
        # reset token was already issued (but before it's used), don't let
        # that stale token still complete the reset.
        if user.get("status", "active") != "active":
            raise HTTPException(status_code=400, detail="Invalid or expired reset link.")

        # BUG FIX: same defense-in-depth as the suspended-account check above
        # -- if a reset token was issued for an account that was (or became)
        # unverified before this fix, don't let it complete the reset either.
        if not user.get("is_verified", True):
            raise HTTPException(status_code=400, detail="Invalid or expired reset link.")

        hashed_password = AuthService.hash_password(new_password)
        UserRepository.update_password(user["email"], hashed_password)
        UserRepository.clear_reset_token(user["email"])
        # SECURITY: invalidate every token issued before this reset. Without
        # this, a token stolen/leaked before the person noticed and reset
        # their password would keep working for up to 7 days regardless --
        # resetting the password wouldn't actually lock the attacker out.
        UserRepository.bump_token_version(user["email"])
        # Also clear any lockout -- a successful reset proves ownership of
        # the account just as much as a correct password would.
        UserRepository.reset_login_attempts(user["email"])

        return {"status": "success", "message": "Your password has been reset. You can now sign in."}

    @staticmethod
    def logout_all_sessions(email: str):
        """Invalidates every outstanding token for this account, including
        the one used to call this endpoint -- the caller will need to log
        in again afterward. Exposed as POST /api/logout-all."""
        UserRepository.bump_token_version(email)
        return {"status": "success", "message": "You've been logged out of all sessions."}

    @staticmethod
    def google_login(token: str):
        try:
            client_id = os.getenv("GOOGLE_CLIENT_ID")

            if not client_id:
                raise HTTPException(
                    status_code=500,
                    detail="Missing GOOGLE_CLIENT_ID in environment"
                )

            idinfo = id_token.verify_oauth2_token(
                token,
                requests.Request(),
                client_id
            )

            # BUG FIX: normalize casing here too, same reasoning as the
            # email/password path -- keeps Google-SSO accounts consistent
            # with everything else instead of reintroducing the mismatch.
            email = (idinfo.get("email") or "").strip().lower()
            name = idinfo.get("name", "")

            if not email:
                raise HTTPException(
                    status_code=400,
                    detail="Google account has no email"
                )

            user = UserRepository.find_by_email(email)

            # SECURITY FIX: same suspension check as password login -- a
            # suspended account shouldn't be able to bypass it via Google SSO.
            if user and user.get("status", "active") != "active":
                raise HTTPException(
                    status_code=403,
                    detail=f"This account has been suspended. Contact an administrator at {SUPPORT_EMAIL} for help."
                )

            if not user:
                UserRepository.insert({
                    "name": name,
                    "email": email,
                    "password": None,
                    "role": "user",
                    "isAdmin": False,
                    # Google has already verified this email address as part
                    # of its own OAuth flow, so there's no separate
                    # verification step for SSO accounts.
                    "is_verified": True,
                    "progress": {},
                    "assessments": {},
                    "onboarding_state": {
                        "tourSeen": False,
                        "completedAt": None,
                        "pages": {}
                    }
                })
                user = UserRepository.find_by_email(email)

            backend_token = create_access_token({"sub": email, "tv": user.get("token_version", 0)})

            return {
                "status": "success",
                "email": email,
                "name": user.get("name"),
                "role": user.get("role", "user"),
                "isAdmin": user.get("isAdmin", False) or user.get("is_admin", False),
                "progress": user.get("progress", {}),
                "assessments": user.get("assessments", {}),
                "onboarding_state": user.get("onboarding_state", {}),
                "token": backend_token
            }

        except ValueError:
            raise HTTPException(
                status_code=401,
                detail="Invalid Google OAuth token"
            )

    @staticmethod
    def sync_submission(payload: dict):
        user_id = payload.get("userId")
        module_id = payload.get("moduleId")
        activity_id = payload.get("activityId")

        if not user_id or not activity_id:
            return {"status": "ignored"}

        if "guest" in str(user_id).lower():
            return {"status": "ignored", "message": "Guest persistence disabled"}

        # FIXED: Explicitly added "id" to allow syncing composite primary key back to frontend
        allowed_fields = [
            "id", "userId", "moduleId", "activityId", "type", "status", 
            "score", "maxScore", "passedTestCases", "totalTestCases", 
            "passed_tests", "total_tests", "testCases", 
            "target_complexity", "actual_complexity", 
            "target_space_complexity", "actual_space_complexity", 
            "workspace", "pythonCode", "timestamp", "submittedAt", "isSynced",
            "initial_aes", "final_aes", "rog", "functional_passed", "functional_total",
            "latest_aes", "baseline_actual_complexity", "baseline_actual_space_complexity",
            "latest_actual_complexity", "latest_actual_space_complexity",
            "complexity_passed", "complexity_total", "hidden_passed", "hidden_total",
            "code_unchanged"
        ]
        
        safe_update_data = {k: payload[k] for k in allowed_fields if k in payload}

        conn = get_db_connection()
        cursor = conn.cursor()
        
        # FIXED: Resilient Schema Check handles both "userId" OR "email" column variations securely without crashing API 
        try:
            cursor.execute('''
                SELECT id FROM submissions 
                WHERE "userId" = %s AND data->>'moduleId' = %s AND data->>'activityId' = %s
            ''', (user_id, module_id, activity_id))
            col_name = '"userId"'
        except Exception:
            conn.rollback()
            cursor.execute('''
                SELECT id FROM submissions 
                WHERE email = %s AND data->>'moduleId' = %s AND data->>'activityId' = %s
            ''', (user_id, module_id, activity_id))
            col_name = 'email'
        
        existing = cursor.fetchone()
        
        if existing:
            cursor.execute('''
                UPDATE submissions SET data = %s WHERE id = %s
            ''', (json.dumps(safe_update_data), existing['id']))
        else:
            cursor.execute(f'''
                INSERT INTO submissions ({col_name}, data) VALUES (%s, %s)
            ''', (user_id, json.dumps(safe_update_data)))
            
        conn.commit()  # <--- CRITICAL FIX: Save the transaction!
        cursor.close()
        conn.close()
        return {"status": "success", "message": "Submission synced"}

    @staticmethod
    def get_submission(email: str, activityId: str, moduleId: str = None):
        if not email or not activityId:
             return {"status": "ignored"}
             
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # FIXED: Resilient Schema Support
        try:
            if moduleId:
                cursor.execute('''
                    SELECT data FROM submissions 
                    WHERE "userId" = %s AND data->>'activityId' = %s AND data->>'moduleId' = %s
                ''', (email, activityId, moduleId))
            else:
                cursor.execute('''
                    SELECT data FROM submissions 
                    WHERE "userId" = %s AND data->>'activityId' = %s
                ''', (email, activityId))
        except Exception:
            conn.rollback()
            if moduleId:
                cursor.execute('''
                    SELECT data FROM submissions 
                    WHERE email = %s AND data->>'activityId' = %s AND data->>'moduleId' = %s
                ''', (email, activityId, moduleId))
            else:
                cursor.execute('''
                    SELECT data FROM submissions 
                    WHERE email = %s AND data->>'activityId' = %s
                ''', (email, activityId))
            
        row = cursor.fetchone()
        cursor.close()
        conn.close()
        
        if row:
            return {"status": "success", "submission": row["data"]}
        return {"status": "success", "submission": None}

    @staticmethod
    def sync_assessment(payload: dict):
        user_id = payload.get("userId")
        module_id = payload.get("moduleId")

        if not module_id and payload.get("assessmentId"):
            module_id = payload.get("assessmentId")
            payload["moduleId"] = module_id

        if not user_id or not module_id:
            return {"status": "ignored"}

        if "guest" in str(user_id).lower():
            return {"status": "ignored", "message": "Guest persistence disabled"}

        conn = get_db_connection()
        cursor = conn.cursor()

        # Upsert into the normalized `assessments` table (one row per
        # email+assessment_key). COALESCE on conflict means this only
        # overwrites the columns present in this payload -- it won't null
        # out fields the simpler update_assessment() write path set on the
        # same row, and vice versa. `answers` is the one column that
        # legitimately stays JSONB (a variable question-id -> answer map).
        answers = payload.get("answers")
        question_ids = payload.get("questionIds")
        cursor.execute('''
            INSERT INTO assessments (
                email, assessment_key, score, max_score, correct, total,
                time_elapsed, completed_at, completed, passed, attempts,
                is_synced, client_timestamp, answers, question_ids, updated_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now())
            ON CONFLICT (email, assessment_key) DO UPDATE SET
                score = COALESCE(EXCLUDED.score, assessments.score),
                max_score = COALESCE(EXCLUDED.max_score, assessments.max_score),
                correct = COALESCE(EXCLUDED.correct, assessments.correct),
                total = COALESCE(EXCLUDED.total, assessments.total),
                time_elapsed = COALESCE(EXCLUDED.time_elapsed, assessments.time_elapsed),
                completed_at = COALESCE(EXCLUDED.completed_at, assessments.completed_at),
                completed = COALESCE(EXCLUDED.completed, assessments.completed),
                passed = COALESCE(EXCLUDED.passed, assessments.passed),
                attempts = COALESCE(EXCLUDED.attempts, assessments.attempts),
                is_synced = COALESCE(EXCLUDED.is_synced, assessments.is_synced),
                client_timestamp = COALESCE(EXCLUDED.client_timestamp, assessments.client_timestamp),
                answers = COALESCE(EXCLUDED.answers, assessments.answers),
                question_ids = COALESCE(EXCLUDED.question_ids, assessments.question_ids),
                updated_at = now()
        ''', (
            user_id, module_id,
            payload.get("score"), payload.get("maxScore"), payload.get("correct"), payload.get("total"),
            payload.get("timeElapsed"), payload.get("completedAt"), payload.get("completed"), payload.get("passed"),
            payload.get("attempts"), payload.get("isSynced"), payload.get("timestamp"),
            json.dumps(answers) if answers is not None else None,
            json.dumps(question_ids) if question_ids is not None else None,
        ))

        conn.commit() # <--- CRITICAL FIX: Save the transaction!
        cursor.close()
        conn.close()
        return {"status": "success", "message": "Assessment synced"}

    @staticmethod
    def get_assessment(email: str, moduleId: str):
        if not email or not moduleId:
            return {"status": "ignored"}
            
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT score, max_score, correct, total, time_elapsed, completed_at,
                   completed, passed, attempts, is_synced, client_timestamp, answers, question_ids
            FROM assessments WHERE email = %s AND assessment_key = %s
        ''', (email, moduleId))
        row = cursor.fetchone()
        cursor.close()
        conn.close()

        if not row:
            return {"status": "success", "assessment": None}

        assessment = {
            "score": row["score"],
            "correct": row["correct"],
            "total": row["total"],
            "timeElapsed": row["time_elapsed"],
            "completedAt": row["completed_at"],
            "attempts": row["attempts"],
            "moduleId": moduleId,
        }
        if row["max_score"] is not None:
            assessment["maxScore"] = row["max_score"]
        if row["completed"] is not None:
            assessment["completed"] = row["completed"]
        if row["passed"] is not None:
            assessment["passed"] = row["passed"]
        if row["answers"] is not None:
            assessment["answers"] = row["answers"]
        if row["question_ids"] is not None:
            assessment["questionIds"] = row["question_ids"]
        if row["client_timestamp"] is not None:
            assessment["timestamp"] = row["client_timestamp"]
        if row["is_synced"] is not None:
            assessment["isSynced"] = row["is_synced"]

        return {"status": "success", "assessment": assessment}
    
    @staticmethod
    def get_all_submissions(email: str):
        if not email:
            return {"status": "ignored"}
            
        conn = get_db_connection()
        cursor = conn.cursor()
        
        try:
            cursor.execute('SELECT data FROM submissions WHERE "userId" = %s', (email,))
        except Exception:
            conn.rollback()
            cursor.execute('SELECT data FROM submissions WHERE email = %s', (email,))
            
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        
        submissions = [row["data"] for row in rows]
        return {"status": "success", "submissions": submissions}

    @staticmethod
    def update_onboarding(email: str, onboarding_state: dict):
        if not email:
            return {"status": "ignored"}

        sanitized_state = onboarding_state if isinstance(onboarding_state, dict) else {}
        UserRepository.update_onboarding_state(email, sanitized_state)
        user = UserRepository.find_by_email(email)
        return {
            "status": "success",
            "onboarding_state": user.get("onboarding_state", {}) if user else sanitized_state,
        }

    @staticmethod
    def get_onboarding(email: str):
        if not email:
            return {"status": "ignored", "onboarding_state": {}}

        return {
            "status": "success",
            "onboarding_state": UserRepository.get_onboarding_state(email),
        }

    @staticmethod
    def batch_sync(payload: dict, trusted_email: str):
        if "guest" in trusted_email.lower():
            return {"status": "success", "message": "Ignored: Guest account", "synced_items": 0}

        synced_count = 0

        for sub in payload.get("submissions", []):
            if sub.get("userId") == trusted_email:
                sub["isSynced"] = True
                AuthService.sync_submission(sub)
                synced_count += 1
                
        for prog in payload.get("progress", []):
            if prog.get("email") == trusted_email:
                UserRepository.update_progress(trusted_email, prog.get("lesson_id"), float(prog.get("score", 0)))
                synced_count += 1
                
        for ass in payload.get("assessments", []):
            if ass.get("userId") == trusted_email:
                ass["isSynced"] = True
                AuthService.sync_assessment(ass)
                synced_count += 1
                
        return {"status": "success", "message": "Batch sync completed", "synced_items": synced_count}