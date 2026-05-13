from fastapi import HTTPException
from api.repositories.project_repo import ProjectRepository
from api.models import ProjectModel, ProjectUpdate

class ProjectService:
    @staticmethod
    def create_project(project: ProjectModel):
        if ProjectRepository.insert is None:
            raise HTTPException(500, "Database not connected")
        result = ProjectRepository.insert(project.model_dump())
        return {"status": "success", "id": str(result.inserted_id)}

    @staticmethod
    def get_projects():
        projects = ProjectRepository.get_all()
        for p in projects:
            p["_id"] = str(p["_id"])
        return {"status": "success", "projects": projects}

    @staticmethod
    def delete_project(project_id: str):
        result = ProjectRepository.delete(project_id)
        if result.deleted_count == 0:
            raise HTTPException(404, "Project not found")
        return {"status": "success"}

    @staticmethod
    def update_project(project_id: str, payload: ProjectUpdate):
        update_data = {k: v for k, v in payload.model_dump().items() if v is not None}
        result = ProjectRepository.update(project_id, update_data)
        if result.matched_count == 0:
            raise HTTPException(404, "Project not found")
        return {"status": "success"}