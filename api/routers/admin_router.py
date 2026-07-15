# api/routers/admin_router.py
from fastapi import APIRouter, Depends, HTTPException, Body, Request
from typing import List, Dict, Any
import logging

from security import get_current_admin_user
from repositories.user_repo import UserRepository
from services.admin_analytics_service import AdminAnalyticsService
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


@router.get("/users/{email}/metrics")
@limiter.limit("30/minute")
def get_user_metrics(
    email: str,
    request: Request,
    admin_email: str = Depends(get_current_admin_user)
):
    """
    Per-user breakdown of the same metrics a learner sees on their own
    Profile page: Task Success Rate (TSR), Algorithmic Efficiency Score
    (AES), Refactoring Optimization Gain (ROG), pre-test/post-test
    milestone scores, and recorded progress entries.
    """
    try:
        result = AdminAnalyticsService.get_user_metrics(email)
        if result is None:
            raise HTTPException(status_code=404, detail="User not found")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error computing user metrics: {str(e)}")
        raise HTTPException(status_code=500, detail="Error computing user metrics")


@router.get("/analytics/overview")
@limiter.limit("20/minute")
def get_analytics_overview(
    request: Request,
    admin_email: str = Depends(get_current_admin_user)
):
    """
    Cohort-wide dashboard combining:
      - System-generated measures: average TSR, AES, ROG across all
        recorded activity submissions.
      - Assessment-based measures: Mean/SD of pre-test and post-test
        scores, Paired Samples t-Test, Cohen's d effect size, and Hake's
        Normalized Learning Gain (g) -- exactly as defined in the study's
        Statistical Treatment of Data section.
    """
    try:
        return AdminAnalyticsService.get_cohort_overview()
    except Exception as e:
        logger.error(f"Error computing analytics overview: {str(e)}")
        raise HTTPException(status_code=500, detail="Error computing analytics overview")