# api/routers/template_router.py
"""
Template management endpoints for the AlgoBlocks API.

Mounts under the ``/api/templates`` prefix (see index.py). Template reads
are public to any signed-in user; writes (save/update) are scoped to the
owner of each template.
"""
from fastapi import APIRouter, HTTPException, Query, Depends, Request
from typing import List, Dict, Any, Optional
from services.template_service import TemplateService
from models import TemplateSyncRequest 
from security import get_current_user_email
from limiter import limiter

router = APIRouter()

# Read endpoints are public to any authenticated user (curated templates are
# visible to everyone signed in) so they get a generous limit; the write path
# is capped tighter in line with project_router's save/delete limits to
# prevent scripted mass-creation of templates via a bot or leaked token.

@router.get("")
@router.get("/")
@limiter.limit("60/minute")
def get_all_templates(request: Request, userId: Optional[str] = Query(None)):
    return TemplateService.get_all_templates()

# Added empty-string and trailing-slash routes so syncManager's POST to
# /api/templates also routes here without a redirect.
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