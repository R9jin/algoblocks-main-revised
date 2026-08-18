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
from models import UserLogin, UserCreate, ProgressUpdate, AssessmentUpdateRequest
from database import get_db_connection
from security import create_access_token
from services import mail_service

logger = logging.getLogger(__name__)

# How long a password reset link stays valid for.
RESET_TOKEN_TTL_MINUTES = 30

# How long a signup email-verification link stays valid for.
VERIFICATION_TOKEN_TTL_MINUTES = 60 * 24  # 24 hours

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
        stored_password = user.get("password") if user else None

        if not user or not stored_password or not AuthService.verify_password(req.password, stored_password):
            # SECURITY: log failed login attempts (email + reason only --
            # never the submitted password) so repeated failures against one
            # account or a burst across many accounts from one client shows
            # up in server logs/monitoring as brute-force / credential-
            # stuffing activity. Rate limiting (5/minute/IP on this route)
            # is the primary defense; this is the detection/audit trail.
            logger.warning(f"Failed login attempt for email={req.email}: invalid credentials")
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
                detail="This account has been suspended. Contact an administrator."
            )

        # SECURITY: email/password accounts must verify their address before
        # they can sign in. Google-SSO accounts are inserted already-verified
        # (see google_login) and are unaffected by this check.
        if not user.get("is_verified", True):
            logger.warning(f"Rejected login for unverified account: {req.email}")
            raise HTTPException(
                status_code=403,
                detail="Please verify your email before signing in. Check your inbox, or request a new verification link."
            )

        token = create_access_token({"sub": req.email})

        return {
            "status": "success",
            "email": req.email,
            "name": user.get("name"),
            "role": user.get("role", "user"),
            "isAdmin": user.get("isAdmin", False) or user.get("is_admin", False),
            "progress": user.get("progress", {}),
            "assessments": user.get("assessments", {}),
            "onboarding_state": user.get("onboarding_state", {}),
            "token": token
        }

    @staticmethod
    def signup(req: UserCreate, origin: str = None):
        if UserRepository.find_by_email(req.email):
            raise HTTPException(status_code=400, detail="Email already registered")

        hashed_password = AuthService.hash_password(req.password)

        UserRepository.insert({
            "name": req.name,
            "email": req.email,
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

        # SECURITY: email verification. A brand new email/password account
        # cannot sign in (see login()) until it clicks the link in this
        # email, so no access token is issued here -- unlike the previous
        # behavior of auto-logging the user in immediately on signup.
        AuthService._issue_verification_token(req.email, req.name, origin=origin)

        return {
            "status": "success",
            "email": req.email,
            "name": req.name,
            "role": "user",
            "isAdmin": False,
            "requiresVerification": True,
            "message": "Account created. Check your email for a verification link before signing in.",
            "onboarding_state": {
                "tourSeen": False,
                "completedAt": None,
                "pages": {}
            }
        }

    @staticmethod
    def _issue_verification_token(email: str, name: str, origin: str = None) -> bool:
        """Generates a fresh verification token, persists only its hash, and
        emails the raw token as a link. Returns whether the email send
        succeeded (signup/resend both continue regardless, since the token
        is already saved server-side either way)."""
        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=VERIFICATION_TOKEN_TTL_MINUTES)

        UserRepository.set_verification_token(email, token_hash, expires_at)

        sent = mail_service.send_verification_email(
            to_email=email,
            to_name=name or "",
            verification_token=raw_token,
            origin=origin
        )
        if not sent:
            logger.error(f"Verification email failed to send for {email}")
        return sent

    @staticmethod
    def verify_email(token: str):
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        user = UserRepository.find_by_verification_token_hash(token_hash)

        if not user or not user.get("verification_token_expires"):
            raise HTTPException(status_code=400, detail="Invalid or expired verification link.")

        expires_at = user["verification_token_expires"]
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)

        if expires_at < datetime.now(timezone.utc):
            raise HTTPException(status_code=400, detail="Invalid or expired verification link.")

        UserRepository.mark_verified(user["email"])

        # Log the user in immediately after verifying, same UX pattern as
        # reset-password: one less extra step before they can use the app.
        token = create_access_token({"sub": user["email"]})
        full_user = UserRepository.find_by_email(user["email"])

        return {
            "status": "success",
            "message": "Your email has been verified.",
            "email": user["email"],
            "name": full_user.get("name") if full_user else user.get("name"),
            "role": full_user.get("role", "user") if full_user else "user",
            "isAdmin": (full_user.get("isAdmin", False) or full_user.get("is_admin", False)) if full_user else False,
            "progress": full_user.get("progress", {}) if full_user else {},
            "assessments": full_user.get("assessments", {}) if full_user else {},
            "onboarding_state": full_user.get("onboarding_state", {}) if full_user else {},
            "token": token
        }

    @staticmethod
    def resend_verification(email: str, origin: str = None):
        """
        Always returns the same generic response regardless of whether the
        email is registered or already verified, so this endpoint can't be
        used to enumerate accounts (same pattern as forgot_password).
        """
        generic_response = {
            "status": "success",
            "message": "If that account exists and isn't verified yet, a new verification link has been sent."
        }

        user = UserRepository.find_by_email(email)
        if not user or user.get("is_verified", True):
            return generic_response

        AuthService._issue_verification_token(email, user.get("name", ""), origin=origin)
        return generic_response

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
            "attempts": req.attempts
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
            return generic_response

        # Raw token goes in the emailed link; only its hash is ever persisted.
        raw_token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=RESET_TOKEN_TTL_MINUTES)

        UserRepository.set_reset_token(email, token_hash, expires_at)

        sent = mail_service.send_password_reset_email(
            to_email=email,
            to_name=user.get("name", ""),
            reset_token=raw_token,
            origin=origin
        )
        if not sent:
            logger.error(f"Password reset email failed to send for {email}")

        return generic_response

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

        hashed_password = AuthService.hash_password(new_password)
        UserRepository.update_password(user["email"], hashed_password)
        UserRepository.clear_reset_token(user["email"])

        return {"status": "success", "message": "Your password has been reset. You can now sign in."}

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

            email = idinfo.get("email")
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
                    detail="This account has been suspended. Contact an administrator."
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

            backend_token = create_access_token({"sub": email})

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
            "initial_aes", "final_aes", "rog", "functional_passed", "functional_total"
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
        cursor.execute('''
            INSERT INTO assessments (
                email, assessment_key, score, max_score, correct, total,
                time_elapsed, completed_at, completed, passed, attempts,
                is_synced, client_timestamp, answers, updated_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now())
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
                updated_at = now()
        ''', (
            user_id, module_id,
            payload.get("score"), payload.get("maxScore"), payload.get("correct"), payload.get("total"),
            payload.get("timeElapsed"), payload.get("completedAt"), payload.get("completed"), payload.get("passed"),
            payload.get("attempts"), payload.get("isSynced"), payload.get("timestamp"),
            json.dumps(answers) if answers is not None else None,
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
                   completed, passed, attempts, is_synced, client_timestamp, answers
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