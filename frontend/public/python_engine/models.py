from pydantic import BaseModel
from typing import Optional

class ProjectModel(BaseModel):
    title: str
    description: Optional[str] = "" 
    data: dict
    owner_id: str

class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None 
    data: Optional[dict] = None

class TemplateModel(BaseModel):
    title: str
    description: Optional[str] = ""
    data: dict
    owner_id: str  # Ensures templates are saved specific to the user

class TemplateUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    data: Optional[dict] = None