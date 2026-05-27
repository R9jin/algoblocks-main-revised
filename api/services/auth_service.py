# api/services/auth_service.py
from fastapi import HTTPException
from google.oauth2 import id_token
from google.auth.transport import requests
import os

# Removed api. prefixes
from repositories.user_repo import UserRepository
from models import LoginRequest, SignUpRequest, ProgressRequest, AssessmentRequest
from database import db

class AuthService:
    @staticmethod
    def login(req: LoginRequest):
        user = UserRepository.find_by_email(req.email)

        if not user or user.get("password") != req.password:
            raise HTTPException(status_code=401, detail="Invalid credentials")

        return {
            "status": "success",
            "email": req.email,
            "name": user.get("name"),
            "progress": user.get("progress", {}),
            "assessments": user.get("assessments", {}) 
        }

    @staticmethod
    def signup(req: SignUpRequest):
        if UserRepository.find_by_email(req.email):
            raise HTTPException(status_code=400, detail="Email already registered")

        UserRepository.insert({
            "name": req.name,
            "email": req.email,
            "password": req.password,
            "progress": {},
            "assessments": {} 
        })

        return {
            "status": "success",
            "email": req.email,
            "name": req.name
        }

    @staticmethod
    def update_progress(req: ProgressRequest):
        UserRepository.update_progress(req.email, req.lesson_id, req.score)
        user = UserRepository.find_by_email(req.email)
        return {
            "status": "success",
            "progress": user.get("progress", {})
        }

    @staticmethod
    def update_assessment(req: AssessmentRequest):
        UserRepository.update_assessment(req.email, req.assessment_key, req.data)
        user = UserRepository.find_by_email(req.email)
        return {
            "status": "success",
            "assessments": user.get("assessments", {})
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

            return {
                "status": "success",
                "email": email,
                "name": user.get("name"),
                "progress": user.get("progress", {}),
                "assessments": user.get("assessments", {}) 
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
            raise HTTPException(status_code=400, detail="Missing userId or activityId")

        db["submissions"].update_one(
            {"userId": user_id, "moduleId": module_id, "activityId": activity_id},
            {"$set": payload},
            upsert=True
        )
        return {"status": "success", "message": "Submission synced"}

    @staticmethod
    def get_submission(email: str, activityId: str, moduleId: str = None):
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
            raise HTTPException(status_code=400, detail="Missing userId or moduleId")

        db["assessments"].update_one(
            {"userId": user_id, "moduleId": module_id},
            {"$set": payload},
            upsert=True
        )
        return {"status": "success", "message": "Assessment synced"}

    @staticmethod
    def get_assessment(email: str, moduleId: str):
        assessment = db["assessments"].find_one({"userId": email, "moduleId": moduleId}, {"_id": 0})
        return {"status": "success", "assessment": assessment}