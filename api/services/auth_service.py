from fastapi import HTTPException
from api.repositories.user_repo import UserRepository
from api.models import LoginRequest, SignUpRequest, ProgressRequest

class AuthService:
    @staticmethod
    def login(req: LoginRequest):
        user = UserRepository.find_by_email(req.email)
        if not user or user.get("password") != req.password:
            raise HTTPException(401, "Invalid credentials")
        
        return {
            "status": "success",
            "email": req.email,
            "name": user.get("name"),
            "progress": user.get("progress", {})
        }

    @staticmethod
    def signup(req: SignUpRequest):
        if UserRepository.find_by_email(req.email):
            raise HTTPException(400, "Email already registered")
            
        UserRepository.insert({
            "name": req.name,
            "email": req.email,
            "password": req.password,
            "progress": {}
        })
        return {"status": "success", "email": req.email, "name": req.name}

    @staticmethod
    def update_progress(req: ProgressRequest):
        UserRepository.update_progress(req.email, req.lesson_id, req.score)
        user = UserRepository.find_by_email(req.email)
        return {"status": "success", "progress": user.get("progress", {})}