# api/routers/template_router.py
from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Dict, Any, Optional
from services.template_service import TemplateService
from models import TemplateSyncRequest 
# BUG-07 Fix: Inject current user dependency
from security import get_current_user_email

router = APIRouter()

@router.get("")
@router.get("/")
def get_all_templates(userId: Optional[str] = Query(None)):
    return TemplateService.get_all_templates()

# BUG-07 Fix: Require valid JWT token to persist templates
@router.post("/save")
def save_template(req: TemplateSyncRequest, current_user: str = Depends(get_current_user_email)):
    try:
        return TemplateService.save_template(req)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{category}")
def get_templates_by_category(category: str):
    return TemplateService.get_templates_by_category(category)