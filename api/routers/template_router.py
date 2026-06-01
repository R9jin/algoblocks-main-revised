# api/routers/template_router.py
from fastapi import APIRouter, HTTPException, Query
from typing import List, Dict, Any, Optional
from services.template_service import TemplateService
from models import SaveTemplateRequest 

router = APIRouter()

# FIX: Added "" to prevent 307 redirects on /api/templates
@router.get("")
@router.get("/")
def get_all_templates(userId: Optional[str] = Query(None)):
    return TemplateService.get_all_templates()

# ADDED/UPDATED: The save endpoint
@router.post("/save")
def save_template(req: SaveTemplateRequest):
    try:
        return TemplateService.save_template(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{category}")
def get_templates_by_category(category: str):
    return TemplateService.get_templates_by_category(category)