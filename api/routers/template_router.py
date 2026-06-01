# api/routers/template_router.py
from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from services.template_service import TemplateService

router = APIRouter()

# Define what the incoming React frontend payload looks like
class SaveTemplateRequest(BaseModel):
    templateId: Optional[str] = None
    userId: Optional[str] = ""
    name: Optional[str] = "Untitled Template"
    description: Optional[str] = ""
    category: Optional[str] = "Custom Templates"
    workspace: Optional[Dict[str, Any]] = {}

@router.get("")
@router.get("/")
def get_all_templates():
    return TemplateService.get_all_templates()

# FIX: Add the POST route for saving templates HERE (above the category route)
@router.post("/save")
def save_template(req: SaveTemplateRequest):
    # Pass the validated Pydantic model to your template service
    return TemplateService.save_template(req)

@router.get("/{category}")
def get_templates_by_category(category: str):
    return TemplateService.get_templates_by_category(category)