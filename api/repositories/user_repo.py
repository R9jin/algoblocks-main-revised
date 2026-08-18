from database import get_db_connection
import json

class UserRepository:
    @staticmethod
    def find_by_email(email: str, conn=None):
        # PERFORMANCE: accepts an already-open connection so callers that
        # need several queries in one request (e.g. AdminAnalyticsService)
        # can share a single connection instead of opening a new one per
        # helper call. Falls back to opening/closing its own when called
        # standalone, same as before.
        owns_conn = conn is None
        if owns_conn:
            conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute('SELECT id, name, email, password, status, role, is_admin, is_verified, onboarding_state FROM users WHERE email = %s', (email,))
        user = cursor.fetchone()
        
        if not user:
            cursor.close()
            if owns_conn:
                conn.close()
            return None
            
        user_dict = dict(user)

        # progress is now one row per (email, lesson_id); reconstruct the
        # {lesson_id: score} shape callers already expect so nothing
        # downstream (routers, frontend) has to change.
        cursor.execute('SELECT lesson_id, score FROM progress WHERE email = %s', (email,))
        user_dict["progress"] = {r["lesson_id"]: r["score"] for r in cursor.fetchall()}

        # same idea for assessments: one row per (email, assessment_key),
        # reconstructed into {assessment_key: {...}}.
        cursor.execute('''
            SELECT assessment_key, score, max_score, correct, total, time_elapsed,
                   completed_at, completed, passed, attempts, is_synced,
                   client_timestamp, answers
            FROM assessments WHERE email = %s
        ''', (email,))
        assessments = {}
        for r in cursor.fetchall():
            entry = {
                "score": r["score"],
                "correct": r["correct"],
                "total": r["total"],
                "timeElapsed": r["time_elapsed"],
                "completedAt": r["completed_at"],
                "attempts": r["attempts"],
                "moduleId": r["assessment_key"],
            }
            # only present when set by the fuller sync_assessment write path
            if r["max_score"] is not None:
                entry["maxScore"] = r["max_score"]
            if r["completed"] is not None:
                entry["completed"] = r["completed"]
            if r["passed"] is not None:
                entry["passed"] = r["passed"]
            if r["answers"] is not None:
                entry["answers"] = r["answers"]
            if r["client_timestamp"] is not None:
                entry["timestamp"] = r["client_timestamp"]
            if r["is_synced"] is not None:
                entry["isSynced"] = r["is_synced"]
            assessments[r["assessment_key"]] = entry
        user_dict["assessments"] = assessments

        user_dict["onboarding_state"] = user_dict.get("onboarding_state") or {}
        
        cursor.close()
        if owns_conn:
            conn.close()
        return user_dict

    @staticmethod
    def insert(user_data: dict):
        conn = get_db_connection()
        cursor = conn.cursor()
        
        is_admin = user_data.get("isAdmin", user_data.get("is_admin", False))
        # Defaults to False (email/password signups start unverified); pass
        # is_verified=True explicitly for Google-SSO accounts, since Google
        # has already confirmed ownership of the address.
        is_verified = bool(user_data.get("is_verified", False))
        cursor.execute('''
            INSERT INTO users (name, email, password, status, role, is_admin, is_verified)
            VALUES (%s, %s, %s, %s, %s, %s, %s) RETURNING id
        ''', (
            user_data.get("name"),
            user_data.get("email"),
            user_data.get("password"),
            user_data.get("status", "active"),
            user_data.get("role", "user"),
            is_admin,
            is_verified
        ))
        inserted_id = cursor.fetchone()["id"]

        # No placeholder rows needed anymore: progress/assessments are now
        # one row per (email, lesson_id)/(email, assessment_key). A brand
        # new user simply has zero rows, and find_by_email already treats
        # "no rows" as {} -- same result, no empty-blob row to maintain.

        conn.commit() # <--- CRITICAL FIX: Save the transaction!
        cursor.close()
        conn.close()
        return str(inserted_id)

    @staticmethod
    def update_progress(email: str, lesson_id: str, score: float):
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute('''
            INSERT INTO progress (email, lesson_id, score, updated_at)
            VALUES (%s, %s, %s, now())
            ON CONFLICT (email, lesson_id)
            DO UPDATE SET score = EXCLUDED.score, updated_at = now()
        ''', (email, lesson_id, score))

        conn.commit() # <--- CRITICAL FIX: Save the transaction!
        cursor.close()
        conn.close()

    @staticmethod
    def update_assessment(email: str, assessment_key: str, data: dict):
        # `data` here only carries a subset of columns (score/correct/total/
        # timeElapsed/completedAt/attempts) -- the fuller sync_assessment
        # write path (auth_service.py) may already have set maxScore/
        # completed/passed/answers/etc. on this same row. COALESCE on
        # conflict means we only overwrite the columns we were actually
        # given, instead of nulling out the others.
        conn = get_db_connection()
        cursor = conn.cursor()

        cursor.execute('''
            INSERT INTO assessments (
                email, assessment_key, score, correct, total,
                time_elapsed, completed_at, attempts, updated_at
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, now())
            ON CONFLICT (email, assessment_key) DO UPDATE SET
                score = COALESCE(EXCLUDED.score, assessments.score),
                correct = COALESCE(EXCLUDED.correct, assessments.correct),
                total = COALESCE(EXCLUDED.total, assessments.total),
                time_elapsed = COALESCE(EXCLUDED.time_elapsed, assessments.time_elapsed),
                completed_at = COALESCE(EXCLUDED.completed_at, assessments.completed_at),
                attempts = COALESCE(EXCLUDED.attempts, assessments.attempts),
                updated_at = now()
        ''', (
            email, assessment_key,
            data.get("score"), data.get("correct"), data.get("total"),
            data.get("timeElapsed"), data.get("completedAt"), data.get("attempts"),
        ))

        conn.commit() # <--- CRITICAL FIX: Save the transaction!
        cursor.close()
        conn.close()
        
    @staticmethod
    def find_all_users(conn=None):
        # PERFORMANCE: same shared-connection pattern as find_by_email above.
        owns_conn = conn is None
        if owns_conn:
            conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT id, name, email, status, role, is_admin, is_verified
            FROM users
        ''')
        users = cursor.fetchall()
        
        cursor.close()
        if owns_conn:
            conn.close()
        return [dict(u) for u in users]

    @staticmethod
    def update_user_status(email: str, status: str):
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('UPDATE users SET status = %s WHERE email = %s', (status, email))
        rowcount = cursor.rowcount
        conn.commit() # <--- CRITICAL FIX: Save the transaction!
        cursor.close()
        conn.close()
        return rowcount

    @staticmethod
    def delete_user(email: str):
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('DELETE FROM users WHERE email = %s', (email,))
        rowcount = cursor.rowcount
        conn.commit() # <--- CRITICAL FIX: Save the transaction!
        cursor.close()
        conn.close()
        return rowcount

    @staticmethod
    def set_reset_token(email: str, token_hash: str, expires_at):
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE users SET reset_token_hash = %s, reset_token_expires = %s WHERE email = %s
        ''', (token_hash, expires_at, email))
        conn.commit()
        cursor.close()
        conn.close()

    @staticmethod
    def find_by_reset_token_hash(token_hash: str):
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT id, name, email, reset_token_expires
            FROM users
            WHERE reset_token_hash = %s
        ''', (token_hash,))
        user = cursor.fetchone()
        cursor.close()
        conn.close()
        return dict(user) if user else None

    @staticmethod
    def clear_reset_token(email: str):
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE users SET reset_token_hash = NULL, reset_token_expires = NULL WHERE email = %s
        ''', (email,))
        conn.commit()
        cursor.close()
        conn.close()

    @staticmethod
    def set_verification_token(email: str, token_hash: str, expires_at):
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE users SET verification_token_hash = %s, verification_token_expires = %s WHERE email = %s
        ''', (token_hash, expires_at, email))
        conn.commit()
        cursor.close()
        conn.close()

    @staticmethod
    def find_by_verification_token_hash(token_hash: str):
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            SELECT id, name, email, is_verified, verification_token_expires
            FROM users
            WHERE verification_token_hash = %s
        ''', (token_hash,))
        user = cursor.fetchone()
        cursor.close()
        conn.close()
        return dict(user) if user else None

    @staticmethod
    def mark_verified(email: str):
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE users
            SET is_verified = TRUE, verification_token_hash = NULL, verification_token_expires = NULL
            WHERE email = %s
        ''', (email,))
        rowcount = cursor.rowcount
        conn.commit()
        cursor.close()
        conn.close()
        return rowcount

    @staticmethod
    def update_password(email: str, hashed_password: str):
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('UPDATE users SET password = %s WHERE email = %s', (hashed_password, email))
        rowcount = cursor.rowcount
        conn.commit()
        cursor.close()
        conn.close()
        return rowcount

    @staticmethod
    def get_onboarding_state(email: str):
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT onboarding_state FROM users WHERE email = %s', (email,))
        row = cursor.fetchone()
        cursor.close()
        conn.close()
        return (row["onboarding_state"] if row else None) or {}

    @staticmethod
    def update_onboarding_state(email: str, onboarding_state: dict):
        # Merge (never blind-overwrite) so that a stale write from one device
        # can't clobber progress another device already persisted. Locking
        # the row for the read+write keeps two concurrent requests (e.g. two
        # tabs/devices syncing at the same moment) from racing each other.
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT onboarding_state FROM users WHERE email = %s FOR UPDATE', (email,))
        row = cursor.fetchone()
        if row is None:
            cursor.close()
            conn.close()
            return 0

        existing = row["onboarding_state"] or {}
        merged = UserRepository._merge_onboarding_state(existing, onboarding_state or {})

        cursor.execute('UPDATE users SET onboarding_state = %s WHERE email = %s', (json.dumps(merged), email))
        rowcount = cursor.rowcount
        conn.commit()
        cursor.close()
        conn.close()
        return rowcount

    @staticmethod
    def _merge_onboarding_state(existing: dict, incoming: dict):
        existing = existing if isinstance(existing, dict) else {}
        incoming = incoming if isinstance(incoming, dict) else {}

        existing_pages = existing.get("pages") if isinstance(existing.get("pages"), dict) else {}
        incoming_pages = incoming.get("pages") if isinstance(incoming.get("pages"), dict) else {}

        merged_pages = {}
        for page_id in set(existing_pages.keys()) | set(incoming_pages.keys()):
            e = existing_pages.get(page_id) or {}
            i = incoming_pages.get(page_id) or {}
            merged_pages[page_id] = {
                "seen": bool(e.get("seen")) or bool(i.get("seen")),
                "replayCount": max(int(e.get("replayCount") or 0), int(i.get("replayCount") or 0)),
                "lastSeenAt": e.get("lastSeenAt") or i.get("lastSeenAt") or None,
                "lastOpenedAt": e.get("lastOpenedAt") or i.get("lastOpenedAt") or None,
                "lastCompletedAt": e.get("lastCompletedAt") or i.get("lastCompletedAt") or None,
            }

        return {
            "tourSeen": bool(existing.get("tourSeen")) or bool(incoming.get("tourSeen")),
            "completedAt": existing.get("completedAt") or incoming.get("completedAt") or None,
            "pages": merged_pages,
        }