# api/services/auth_service.py
from fastapi import HTTPException
from google.oauth2 import id_token
from google.auth.transport import requests
import os
import bcrypt
import json

from repositories.user_repo import UserRepository
from models import UserLogin, UserCreate, ProgressUpdate, AssessmentUpdateRequest
from database import get_db_connection
from security import create_access_token

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
            raise HTTPException(
                status_code=401, 
                detail="Invalid credentials."
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
            "token": token
        }

    @staticmethod
    def signup(req: UserCreate):
        if UserRepository.find_by_email(req.email):
            raise HTTPException(status_code=400, detail="Email already registered")

        hashed_password = AuthService.hash_password(req.password)

        UserRepository.insert({
            "name": req.name,
            "email": req.email,
            "password": hashed_password,
            "role": "user",
            "isAdmin": False,
            "progress": {},
            "assessments": {} 
        })

        token = create_access_token({"sub": req.email})

        return {
            "status": "success",
            "email": req.email,
            "name": req.name,
            "role": "user",
            "isAdmin": False,
            "token": token
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

            if not user:
                UserRepository.insert({
                    "name": name,
                    "email": email,
                    "password": None,
                    "role": "user",
                    "isAdmin": False,
                    "progress": {},
                    "assessments": {} 
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

        allowed_fields = [
            "userId", "moduleId", "activityId", "type", "status", 
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
        
        # Check if submission exists using jsonb operators
        cursor.execute('''
            SELECT id FROM submissions 
            WHERE "userId" = %s AND data->>'moduleId' = %s AND data->>'activityId' = %s
        ''', (user_id, module_id, activity_id))
        
        existing = cursor.fetchone()
        
        if existing:
            cursor.execute('''
                UPDATE submissions SET data = %s WHERE id = %s
            ''', (json.dumps(safe_update_data), existing['id']))
        else:
            cursor.execute('''
                INSERT INTO submissions ("userId", data) VALUES (%s, %s)
            ''', (user_id, json.dumps(safe_update_data)))
            
        cursor.close()
        conn.close()
        return {"status": "success", "message": "Submission synced"}

    @staticmethod
    def get_submission(email: str, activityId: str, moduleId: str = None):
        if not email or not activityId:
             return {"status": "ignored"}
             
        conn = get_db_connection()
        cursor = conn.cursor()
        
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

        allowed_fields = [
            "userId", "moduleId", "assessmentId", "answers", "score", 
            "maxScore", "completed", "timestamp", "passed", "correct", 
            "total", "timeElapsed", "completedAt", "attempts", "isSynced"
        ]
        safe_update_data = {k: payload[k] for k in allowed_fields if k in payload}

        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute('INSERT INTO assessments (email, data) VALUES (%s, %s) ON CONFLICT DO NOTHING', (user_id, '{}'))
        cursor.execute('''
            UPDATE assessments 
            SET data = jsonb_set(data, %s, %s, true)
            WHERE email = %s
        ''', (f'{{{module_id}}}', json.dumps(safe_update_data), user_id))
        
        cursor.close()
        conn.close()
        return {"status": "success", "message": "Assessment synced"}

    @staticmethod
    def get_assessment(email: str, moduleId: str):
        if not email or not moduleId:
            return {"status": "ignored"}
            
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT data->%s as assessment_data FROM assessments WHERE email = %s', (moduleId, email))
        row = cursor.fetchone()
        cursor.close()
        conn.close()
        
        if row and row.get("assessment_data"):
            return {"status": "success", "assessment": row["assessment_data"]}
        return {"status": "success", "assessment": None}
    
    @staticmethod
    def get_all_submissions(email: str):
        if not email:
            return {"status": "ignored"}
            
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute('SELECT data FROM submissions WHERE "userId" = %s', (email,))
        rows = cursor.fetchall()
        cursor.close()
        conn.close()
        
        submissions = [row["data"] for row in rows]
        return {"status": "success", "submissions": submissions}

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