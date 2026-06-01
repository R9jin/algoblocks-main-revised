# api/security.py
import logging
import jwt
from datetime import datetime, timedelta
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

logger = logging.getLogger(__name__)

SECRET_KEY = "8f4e2a1b9c7d6e5f8a4b2c1d9e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f" 
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