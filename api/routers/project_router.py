from fastapi import APIRouter
from api.models import ProjectModel, ProjectUpdate
from api.services.project_service import ProjectService

router = APIRouter(prefix="/api/projects", tags=["Projects"])

@router.post("")
def save_project(project: ProjectModel):
    return ProjectService.create_project(project)

@router.get("")
def get_projects():
    return ProjectService.get_projects()

@router.delete("/{project_id}")
def delete_project(project_id: str):
    return ProjectService.delete_project(project_id)

@router.put("/{project_id}")
def update_project(project_id: str, payload: ProjectUpdate):
    return ProjectService.update_project(project_id, payload)