# api/routers/project_router.py
from fastapi import APIRouter, Request, Depends
from typing import Dict, Optional

# FIX: Updated to ProjectSyncRequest to match models.py
from models import ProjectSyncRequest
from services.project_service import ProjectService
from limiter import limiter
from security import get_current_user_email

router = APIRouter()

@router.get("")
@router.get("/")
@limiter.limit("30/minute")
def get_user_projects(
    request: Request, 
    trusted_email: str = Depends(get_current_user_email)
):
    # Ensure graceful handling if token misses email
    if not trusted_email:
        return {"status": "success", "projects": []}
        
    # Get projects from DB safely using the authenticated JWT email
    projects = ProjectService.get_user_projects(trusted_email)
    
    # Ensure consistent dictionary return so frontend data.projects never breaks
    if isinstance(projects, list):
        return {"status": "success", "projects": projects}
        
    return projects

@router.post("/save")
@limiter.limit("20/minute")
def save_project(
    request: Request, 
    req: ProjectSyncRequest, # FIX: Updated type hint
    trusted_email: str = Depends(get_current_user_email)
):
    # FIX: Use userId to match ProjectSyncRequest and ProjectService
    req.userId = trusted_email
    return ProjectService.save_project(req)

@router.post("/delete")
@limiter.limit("10/minute")
def delete_project(
    request: Request, 
    payload: Dict[str, str], 
    trusted_email: str = Depends(get_current_user_email)
):
    # FIX: Inject userId instead of owner_id
    payload["userId"] = trusted_email
    return ProjectService.delete_project(payload)