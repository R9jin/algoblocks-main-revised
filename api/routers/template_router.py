# api/routers/template_router.py
from fastapi import APIRouter, HTTPException, Query, Depends, Request
from typing import List, Dict, Any, Optional
from services.template_service import TemplateService
from models import TemplateSyncRequest 
# BUG-07 Fix: Inject current user dependency
from security import get_current_user_email
from limiter import limiter

router = APIRouter()

# SECURITY: this router previously had no rate limiting at all. The reads
# below are public (curated templates are visible to anyone signed in) so
# they get a generous read-oriented limit; the write path is capped tighter
# in line with project_router's save/delete limits, to stop a bot or leaked
# token from scripted mass-creation of templates.

@router.get("")
@router.get("/")
@limiter.limit("60/minute")
def get_all_templates(request: Request, userId: Optional[str] = Query(None)):
    return TemplateService.get_all_templates()

# Added "" and "/" so syncManager's POST to /api/templates works
@router.post("")
@router.post("/")
@router.post("/save")
@limiter.limit("20/minute")
def save_template(request: Request, req: TemplateSyncRequest, current_user: str = Depends(get_current_user_email)):
    try:
        req.userId = current_user
        if not req.owner_id:
            req.owner_id = current_user
        return TemplateService.save_template(req)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{category}")
@limiter.limit("60/minute")
def get_templates_by_category(request: Request, category: str):
    return TemplateService.get_templates_by_category(category)