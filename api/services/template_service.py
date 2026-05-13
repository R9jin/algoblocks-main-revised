# api/services/template_service.py
from fastapi import HTTPException
from functools import lru_cache
from api.repositories.template_repo import TemplateRepository
from api.models import TemplateModel, TemplateUpdate

# ==========================================
# 🚀 CACHE LAYER
# ==========================================
# maxsize=1 because we only need to store one thing: the complete list of templates.
@lru_cache(maxsize=1)
def _cached_get_all_templates():
    print("--> 💽 CACHE MISS: Fetching templates from MongoDB...")
    templates = TemplateRepository.get_all()
    for t in templates:
        t["_id"] = str(t["_id"])
    return {"status": "success", "templates": templates}

# ==========================================
# BUSINESS LOGIC LAYER
# ==========================================
class TemplateService:
    @staticmethod
    def get_templates():
        # 🚀 CACHE HIT: This instantly returns the list from RAM without touching the database!
        return _cached_get_all_templates()

    @staticmethod
    def create_template(template: TemplateModel):
        if TemplateRepository.insert is None:
            raise HTTPException(500, "Database not connected")
        result = TemplateRepository.insert(template.model_dump())
        
        # 🧹 CACHE INVALIDATION: Data changed, dump the old memory!
        _cached_get_all_templates.cache_clear()
        
        return {"status": "success", "id": str(result.inserted_id)}

    @staticmethod
    def delete_template(template_id: str):
        result = TemplateRepository.delete(template_id)
        if result.deleted_count == 0:
            raise HTTPException(404, "Template not found")
            
        # 🧹 CACHE INVALIDATION
        _cached_get_all_templates.cache_clear()
        
        return {"status": "success"}

    @staticmethod
    def update_template(template_id: str, payload: TemplateUpdate):
        update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
        result = TemplateRepository.update(template_id, update_data)
        if result.matched_count == 0:
            raise HTTPException(404, "Template not found")
            
        # 🧹 CACHE INVALIDATION
        _cached_get_all_templates.cache_clear()
        
        return {"status": "success"}