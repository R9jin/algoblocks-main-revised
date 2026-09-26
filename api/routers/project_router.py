# api/routers/project_router.py
from fastapi import APIRouter, Request, Depends, HTTPException
from typing import Dict, Optional

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
    if not trusted_email:
        return {"status": "success", "projects": []}
        
    projects = ProjectService.get_user_projects(trusted_email)
    
    if isinstance(projects, list):
        return {"status": "success", "projects": projects}
        
    return projects

@router.post("")
@router.post("/")
@router.post("/save")
@limiter.limit("20/minute")
def save_project(
    request: Request, 
    req: ProjectSyncRequest,
    trusted_email: str = Depends(get_current_user_email)
):
    req.userId = trusted_email
    if not req.owner_id:
        req.owner_id = trusted_email
    return ProjectService.save_project(req)

@router.post("/delete")
@limiter.limit("10/minute")
def delete_project_post(
    request: Request, 
    payload: Dict[str, str], 
    trusted_email: str = Depends(get_current_user_email)
):
    payload["userId"] = trusted_email
    if "owner_id" not in payload:
        payload["owner_id"] = trusted_email
    return ProjectService.delete_project(payload)

@router.delete("/{project_id}")
@limiter.limit("10/minute")
def delete_project(
    project_id: str,
    request: Request, 
    trusted_email: str = Depends(get_current_user_email)
):
    if not trusted_email:
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    payload = {
        "projectId": project_id,
        "userId": trusted_email,
        "owner_id": trusted_email
    }
    return ProjectService.delete_project(payload)