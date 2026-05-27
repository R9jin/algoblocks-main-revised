# api/routers/project_router.py
from fastapi import APIRouter, Request, Query
from typing import Dict, Optional

from models import SaveProjectRequest
from services.project_service import ProjectService
from limiter import limiter

router = APIRouter()

@router.get("")
@router.get("/")
@limiter.limit("30/minute")
def get_user_projects(
    request: Request, 
    userId: Optional[str] = Query(None), 
    user_id: Optional[str] = Query(None),
    email: Optional[str] = Query(None)
):
    # Try all possible ways the frontend might send the ID
    uid = userId or user_id or email
    
    if not uid:
        uid = request.query_params.get("userId") or request.query_params.get("email")

    # FIX: If the frontend fired too early and there is still no UID,
    # return an empty list instead of crashing with a 400 Bad Request.
    if not uid:
        return {"status": "success", "projects": []}
        
    return ProjectService.get_user_projects(uid)

@router.post("/save")
@limiter.limit("20/minute")
def save_project(request: Request, req: SaveProjectRequest):
    return ProjectService.save_project(req)

@router.post("/delete")
@limiter.limit("10/minute")
def delete_project(request: Request, payload: Dict[str, str]):
    return ProjectService.delete_project(payload)