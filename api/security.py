# api/security.py
import os
import logging
import jwt
from datetime import datetime, timedelta
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from database import users_collection

logger = logging.getLogger(__name__)

# BUG-01 Fix: Strictly load secret from environment variables
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError("CRITICAL SECURITY ERROR: JWT_SECRET_KEY environment variable is not set.")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # 7 days

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login", auto_error=True)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    
    # FIX: Ensure it returns a str, not bytes (prevents b"ey..." JSON serialization bugs)
    if isinstance(encoded_jwt, bytes):
        return encoded_jwt.decode("utf-8")
    return encoded_jwt

async def get_current_user_email(token: str = Depends(oauth2_scheme)) -> str:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub") or payload.get("email")
        if email is None:
            logger.warning("Token payload missing 'sub' or 'email'")
            raise credentials_exception
            
        return email
        
    except jwt.ExpiredSignatureError:
        logger.warning("Rejected request: Token has expired")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError as e:
        logger.warning(f"Rejected request: Invalid token - {str(e)}")
        raise credentials_exception

async def get_current_admin_user(email: str = Depends(get_current_user_email)) -> str:
    """
    Dependency that checks if the currently authenticated user has the 'isAdmin' flag set to True.
    """
    user = users_collection.find_one({"email": email})
    
    if not user or not user.get("isAdmin"):
        logger.warning(f"Rejected request: {email} attempted to access an admin-restricted endpoint.")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Administrator privileges required to perform this action."
        )
        
    return email