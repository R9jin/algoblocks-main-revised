from fastapi import APIRouter
from api.models import TemplateModel, TemplateUpdate
from api.services.template_service import TemplateService

router = APIRouter(prefix="/api/templates", tags=["Templates"])

@router.post("")
def save_template(template: TemplateModel):
    return TemplateService.create_template(template)

@router.get("")
def get_templates():
    return TemplateService.get_templates()

@router.delete("/{template_id}")
def delete_template(template_id: str):
    return TemplateService.delete_template(template_id)

@router.put("/{template_id}")
def update_template(template_id: str, payload: TemplateUpdate):
    return TemplateService.update_template(template_id, payload)