# api/routers/admin_router.py
from fastapi import APIRouter, Depends, HTTPException, status
from typing import Dict, Any

from repositories.user_repo import UserRepository
from security import get_current_admin_user
from limiter import limiter
from fastapi import Request

router = APIRouter()

@router.get("/users")
@limiter.limit("30/minute")
def get_all_users(request: Request, admin_email: str = Depends(get_current_admin_user)):
    try:
        users = UserRepository.find_all_users()
        return {"status": "success", "users": users}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.patch("/users/{target_email}/status")
@limiter.limit("20/minute")
def update_user_status(
    request: Request, 
    target_email: str, 
    payload: Dict[str, str], 
    admin_email: str = Depends(get_current_admin_user)
):
    new_status = payload.get("status")
    if new_status not in ["Active", "Suspended"]:
        raise HTTPException(status_code=400, detail="Invalid status provided.")
        
    if target_email == admin_email:
        raise HTTPException(status_code=403, detail="Admins cannot suspend their own accounts.")

    result = UserRepository.update_user_status(target_email, new_status)
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found.")
        
    return {"status": "success", "message": f"User status updated to {new_status}"}

@router.delete("/users/{target_email}")
@limiter.limit("10/minute")
def delete_user(request: Request, target_email: str, admin_email: str = Depends(get_current_admin_user)):
    if target_email == admin_email:
        raise HTTPException(status_code=403, detail="Admins cannot delete their own accounts.")
        
    # Check if user is the last admin before deletion (optional safeguard)
    target_user = UserRepository.find_by_email(target_email)
    if target_user and target_user.get("isAdmin"):
        admin_count = len([u for u in UserRepository.find_all_users() if u.get("isAdmin")])
        if admin_count <= 1:
            raise HTTPException(status_code=403, detail="Cannot delete the last remaining administrator.")

    result = UserRepository.delete_user(target_email)
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found.")
        
    return {"status": "success", "message": "User permanently deleted."}