# api/services/template_service.py
from repositories.template_repo import TemplateRepository

class TemplateService:
    @staticmethod
    def get_templates_by_category(category: str):
        templates = TemplateRepository.find_by_category(category)
        return {"status": "success", "templates": templates}

    @staticmethod
    def get_all_templates():
        templates = TemplateRepository.find_all()
        return {"status": "success", "templates": templates}

    # ADDED/UPDATED: Method to handle saving/updating a template
    @staticmethod
    def save_template(req):
        # Convert pydantic model to dict, exclude unset so we don't push nulls unnecessarily
        # Support both Pydantic V1 (.dict()) and Pydantic V2 (.model_dump()) depending on FastAPI version
        if hasattr(req, "model_dump"):
            template_data = req.model_dump(exclude_unset=True)
        elif hasattr(req, "dict"):
            template_data = req.dict(exclude_unset=True)
        else:
            template_data = dict(req)
        
        # Ensure owner_id is set so frontend sync catches it
        if template_data.get("userId") and not template_data.get("owner_id"):
            template_data["owner_id"] = template_data["userId"]
            
        template_id = template_data.pop("templateId", None)
        
        if template_id:
            # Update existing
            updated_id = TemplateRepository.update(template_id, template_data)
            return {
                "status": "success", 
                "message": "Template updated successfully", 
                "templateId": updated_id
            }
        else:
            # Insert new
            inserted_id = TemplateRepository.save(template_data)
            return {
                "status": "success", 
                "message": "Template saved successfully", 
                "templateId": inserted_id
            }