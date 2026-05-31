import logging
import jwt
from datetime import datetime, timedelta
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

logger = logging.getLogger(__name__)

# Make sure this exact secret key matches the one used in your auth_service.py
SECRET_KEY = "algoblocks_secret_key" 
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7 # 7 days

# auto_error=True strictly enforces that the Authorization header MUST be present
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login", auto_error=True)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """
    Creates the JWT token used for authenticating users upon login.
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user_email(token: str = Depends(oauth2_scheme)) -> str:
    """
    Strict and secure authentication dependency.
    Requires a valid, unexpired JWT Bearer token. 
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        # Decode and validate the token signature and expiration
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        
        # Extract the email (subject) from the payload
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