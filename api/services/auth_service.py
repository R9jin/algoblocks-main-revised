# api/services/auth_service.py
from fastapi import HTTPException
from google.oauth2 import id_token
from google.auth.transport import requests
import os
import bcrypt
import logging
from datetime import datetime

from repositories.user_repo import UserRepository
from models import LoginRequest, SignUpRequest
from database import db
from security import create_access_token

logger = logging.getLogger(__name__)

# You must set your actual Google Client ID here or in your .env file
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com")

class AuthService:
    
    @staticmethod
    def hash_password(password: str) -> str:
        """Hashes a plaintext password using bcrypt."""
        return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        """Verifies a plaintext password against the stored bcrypt hash."""
        try:
            return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
        except ValueError:
            return False

    @staticmethod
    def signup(request: SignUpRequest):
        """Registers a new user and generates an initial JWT token."""
        try:
            existing_user = UserRepository.find_by_email(request.email)
            if existing_user:
                raise HTTPException(status_code=400, detail="User already exists")

            hashed_pw = AuthService.hash_password(request.password)
            
            # Safely get name and created_at
            name = getattr(request, "name", request.email.split('@')[0])
            created_at = getattr(request, "created_at", datetime.utcnow().isoformat())

            user_data = {
                "email": request.email,
                "password": hashed_pw,
                "created_at": created_at,
                "name": name
            }
            
            # Save to database
            UserRepository.create_user(user_data)
            
            # Generate the secure JWT token
            access_token = create_access_token(data={"sub": request.email, "email": request.email})
            
            return {
                "message": "User created successfully", 
                "access_token": access_token, 
                "token_type": "bearer",
                "user": {
                    "email": request.email, 
                    "name": name
                }
            }
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error during signup: {str(e)}")
            raise HTTPException(status_code=500, detail="Internal server error during sign up")

    @staticmethod
    def login(request: LoginRequest):
        """Authenticates an existing user via email/password and generates a fresh JWT token."""
        try:
            user = UserRepository.find_by_email(request.email)
            
            if not user or not user.get("password"):
                raise HTTPException(status_code=401, detail="Invalid email or password")
                
            if not AuthService.verify_password(request.password, user.get("password")):
                raise HTTPException(status_code=401, detail="Invalid email or password")
                
            # Generate the secure JWT token
            access_token = create_access_token(data={"sub": request.email, "email": request.email})
            
            return {
                "message": "Login successful", 
                "access_token": access_token, 
                "token_type": "bearer",
                "user": {
                    "email": user.get("email"), 
                    "name": user.get("name", request.email.split('@')[0])
                }
            }
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error during login: {str(e)}")
            raise HTTPException(status_code=500, detail="Internal server error during login")

    @staticmethod
    def google_login(token: str):
        """Verifies a Google OAuth token, creates an account if needed, and issues a JWT token."""
        try:
            idinfo = id_token.verify_oauth2_token(token, requests.Request(), GOOGLE_CLIENT_ID)

            if idinfo['iss'] not in ['accounts.google.com', 'https://accounts.google.com']:
                raise ValueError('Wrong issuer.')

            user_email = idinfo['email']
            user_name = idinfo.get('name', user_email.split('@')[0])

            user = UserRepository.find_by_email(user_email)

            if not user:
                user_data = {
                    "email": user_email,
                    "name": user_name,
                    "auth_provider": "google",
                    "password": None 
                }
                UserRepository.create_user(user_data)
                logger.info(f"Created new user via Google Login: {user_email}")

            access_token = create_access_token(data={"sub": user_email, "email": user_email})

            return {
                "message": "Google login successful",
                "access_token": access_token,
                "token_type": "bearer",
                "user": {
                    "email": user_email,
                    "name": user_name
                }
            }

        except ValueError as e:
            logger.warning(f"Invalid Google token: {str(e)}")
            raise HTTPException(status_code=401, detail="Invalid Google token")
        except Exception as e:
            logger.error(f"Error during Google login: {str(e)}")
            raise HTTPException(status_code=500, detail="Internal server error during Google login")