# api/services/auth_service.py
from fastapi import HTTPException
from google.oauth2 import id_token
from google.auth.transport import requests
import os
import bcrypt

from repositories.user_repo import UserRepository
from models import LoginRequest, SignUpRequest, ProgressRequest, AssessmentRequest
from database import db
from security import create_access_token

class AuthService:
    @staticmethod
    def hash_password(password: str) -> str:
        # Generate a salt and securely hash the password
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
        return hashed.decode('utf-8')

    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        # Gracefully handle validation (prevents old plaintext passwords from crashing the app)
        try:
            return bcrypt.checkpw(
                plain_password.encode('utf-8'), 
                hashed_password.encode('utf-8')
            )
        except ValueError:
            return False

    @staticmethod
    def login(req: LoginRequest):
        user = UserRepository.find_by_email(req.email)

        # Extract stored password (might be None if they only use Google Auth)
        stored_password = user.get("password") if user else None

        # Securely verify the hashed password using the new bcrypt helper
        if not user or not stored_password or not AuthService.verify_password(req.password, stored_password):
            raise HTTPException(
                status_code=401, 
                detail="Invalid credentials."
            )

        # Generate JWT Token
        token = create_access_token({"sub": req.email})

        return {
            "status": "success",
            "email": req.email,
            "name": user.get("name"),
            "progress": user.get("progress", {}),
            "assessments": user.get("assessments", {}),
            "token": token
        }

    @staticmethod
    def signup(req: SignUpRequest):
        if UserRepository.find_by_email(req.email):
            raise HTTPException(status_code=400, detail="Email already registered")

        # Hash the password before saving it to the database
        hashed_password = AuthService.hash_password(req.password)

        UserRepository.insert({
            "name": req.name,
            "email": req.email,
            "password": hashed_password,
            "progress": {},
            "assessments": {} 
        })

        # Generate JWT Token
        token = create_access_token({"sub": req.email})

        return {
            "status": "success",
            "email": req.email,
            "name": req.name,
            "token": token
        }

    @staticmethod
    def update_progress(req: ProgressRequest):
        # FIX: Ignore ghost payloads safely
        if not req.email or not req.lesson_id:
            return {"status": "ignored", "message": "Fired before state loaded"}
            
        # Safely convert incoming score (nulls or strings) into a float
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
    def update_assessment(req: AssessmentRequest):
        actual_key = req.assessment_key or req.key
        if not req.email or not actual_key:
            return {"status": "ignored", "message": "Fired before state loaded"}
            
        save_data = req.data or {}
        if req.score is not None:
            save_data['score'] = req.score
        if req.passed is not None:
            save_data['passed'] = req.passed
            
        UserRepository.update_assessment(req.email, actual_key, save_data)
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
                    "progress": {},
                    "assessments": {} 
                })
                user = UserRepository.find_by_email(email)

            # Generate JWT Token
            backend_token = create_access_token({"sub": email})

            return {
                "status": "success",
                "email": email,
                "name": user.get("name"),
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

        # FIX: Prevent Mass Assignment by explicitly defining allowed fields
        allowed_fields = [
            "userId", "moduleId", "activityId", "type", "status", 
            "score", "maxScore", "passedTestCases", "totalTestCases", 
            "passed_tests", "total_tests", "testCases", 
            "target_complexity", "actual_complexity", 
            "target_space_complexity", "actual_space_complexity", 
            "workspace", "pythonCode", "timestamp", "submittedAt", "isSynced"
        ]
        
        safe_update_data = {k: payload[k] for k in allowed_fields if k in payload}

        db["submissions"].update_one(
            {"userId": user_id, "moduleId": module_id, "activityId": activity_id},
            {"$set": safe_update_data},
            upsert=True
        )
        return {"status": "success", "message": "Submission synced"}

    @staticmethod
    def get_submission(email: str, activityId: str, moduleId: str = None):
        if not email or not activityId:
             return {"status": "ignored"}
             
        query = {"userId": email, "activityId": activityId}
        if moduleId:
            query["moduleId"] = moduleId
            
        submission = db["submissions"].find_one(query, {"_id": 0})
        return {"status": "success", "submission": submission}

    @staticmethod
    def sync_assessment(payload: dict):
        user_id = payload.get("userId")
        module_id = payload.get("moduleId")

        if not user_id or not module_id:
            return {"status": "ignored"}

        # FIX: Prevent Mass Assignment explicitly defining allowed fields
        allowed_fields = ["userId", "moduleId", "answers", "score", "completed", "timestamp", "passed"]
        safe_update_data = {k: payload[k] for k in allowed_fields if k in payload}

        db["assessments"].update_one(
            {"userId": user_id, "moduleId": module_id},
            {"$set": safe_update_data},
            upsert=True
        )
        return {"status": "success", "message": "Assessment synced"}

    @staticmethod
    def get_assessment(email: str, moduleId: str):
        if not email or not moduleId:
            return {"status": "ignored"}
            
        assessment = db["assessments"].find_one({"userId": email, "moduleId": moduleId}, {"_id": 0})
        return {"status": "success", "assessment": assessment}
    
    @staticmethod
    def get_all_submissions(email: str):
        if not email:
            return {"status": "ignored"}
            
        submissions = list(db["submissions"].find({"userId": email}, {"_id": 0}))
        
        return {"status": "success", "submissions": submissions}