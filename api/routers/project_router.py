# api/services/project_service.py
from repositories.project_repo import ProjectRepository
from models import SaveProjectRequest
from fastapi import HTTPException
from datetime import datetime

class ProjectService:
    @staticmethod
    def get_user_projects(user_id: str):
        if not user_id:
            raise HTTPException(status_code=400, detail="Missing userId")
        projects = ProjectRepository.find_by_user(user_id)
        return {"status": "success", "projects": projects}

    @staticmethod
    def save_project(req: SaveProjectRequest):
        update_data = {
            "name": req.name,
            "workspace": req.workspace,
            "pythonCode": req.pythonCode,
            "updatedAt": datetime.utcnow().isoformat()
        }

        if req.projectId:
            result = ProjectRepository.update(req.projectId, req.userId, update_data)
            if result.matched_count == 0:
                raise HTTPException(status_code=404, detail="Project not found or unauthorized")
            return {"status": "success", "projectId": req.projectId}
        else:
            update_data["userId"] = req.userId
            update_data["createdAt"] = update_data["updatedAt"]
            project_id = ProjectRepository.insert(update_data)
            return {"status": "success", "projectId": project_id}

    @staticmethod
    def delete_project(payload: dict):
        project_id = payload.get("projectId")
        user_id = payload.get("userId")

        if not project_id or not user_id:
            raise HTTPException(status_code=400, detail="Missing projectId or userId")

        result = ProjectRepository.delete(project_id, user_id)
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Project not found or unauthorized")

        return {"status": "success"}