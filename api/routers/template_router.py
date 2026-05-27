# api/routers/template_router.py
from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any
from services.template_service import TemplateService

router = APIRouter()

@router.get("/{category}")
def get_templates_by_category(category: str):
    return TemplateService.get_templates_by_category(category)

@router.get("/")
def get_all_templates():
    return TemplateService.get_all_templates()