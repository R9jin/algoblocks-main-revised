# api/routers/project_router.py
from fastapi import APIRouter, Request, Query
from typing import Dict, Any

from models import SaveProjectRequest
from services.project_service import ProjectService
from limiter import limiter

router = APIRouter()

@router.get("/")
@limiter.limit("30/minute")
# FIX: Added Query(...) to correctly parse the userId from the frontend request
def get_user_projects(request: Request, userId: str = Query(...)):
    return ProjectService.get_user_projects(userId)

@router.post("/save")
@limiter.limit("20/minute")
def save_project(request: Request, req: SaveProjectRequest):
    return ProjectService.save_project(req)

@router.post("/delete")
@limiter.limit("10/minute")
def delete_project(request: Request, payload: Dict[str, str]):
    return ProjectService.delete_project(payload)