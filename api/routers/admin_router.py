# api/routers/admin_router.py
from fastapi import APIRouter, Depends, HTTPException, Body, Request
from typing import List, Dict, Any
import logging

from security import get_current_admin_user
from repositories.user_repo import UserRepository
from limiter import limiter

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/users")
@limiter.limit("20/minute")
def get_all_users(request: Request, admin_email: str = Depends(get_current_admin_user)):
    try:
        users = UserRepository.find_all_users()
        
        for user in users:
            if "password" in user:
                del user["password"]
            # AdminUserManagement.jsx checks `user.isAdmin`, not the raw
            # Postgres column name `is_admin`.
            user["isAdmin"] = user.get("is_admin", False)
                
        return {"status": "success", "users": users}
    except Exception as e:
        logger.error(f"Error fetching users via PostgreSQL: {str(e)}")
        raise HTTPException(status_code=500, detail="Error fetching users")

@router.patch("/users/{email}/status")
@limiter.limit("20/minute")
def update_user_status(
    email: str,
    request: Request,
    payload: Dict[str, Any] = Body(...), 
    admin_email: str = Depends(get_current_admin_user)
):
    status = payload.get("status")
    
    if not email or not status:
        raise HTTPException(status_code=400, detail="Missing email or status")
        
    if email == admin_email:
        raise HTTPException(status_code=400, detail="Cannot change your own status")
        
    try:
        rowcount = UserRepository.update_user_status(email, status)
        if rowcount == 0:
            raise HTTPException(status_code=404, detail="User not found")
        return {"status": "success", "message": f"User status updated to {status}"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating user status in PostgreSQL: {str(e)}")
        raise HTTPException(status_code=500, detail="Error updating user status")

@router.delete("/users/{email}")
@limiter.limit("10/minute")
def delete_user(
    email: str,
    request: Request,
    admin_email: str = Depends(get_current_admin_user)
):
    if not email:
        raise HTTPException(status_code=400, detail="Missing email")
        
    if email == admin_email:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
        
    try:
        # User deletion automatically cascades to progress and assessments due to ON DELETE CASCADE
        rowcount = UserRepository.delete_user(email)
        if rowcount == 0:
            raise HTTPException(status_code=404, detail="User not found")
        return {"status": "success", "message": "User deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting user from PostgreSQL: {str(e)}")
        raise HTTPException(status_code=500, detail="Error deleting user")