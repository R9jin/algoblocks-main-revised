# api/models.py

from pydantic import BaseModel
from typing import Optional

class ProjectModel(BaseModel):
    title: str
    description: Optional[str] = "" 
    data: dict
    owner_id: str
    updatedAt: Optional[int] = None  # ADDED THIS

class ProjectUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None 
    data: Optional[dict] = None
    updatedAt: Optional[int] = None  # ADDED THIS

class TemplateModel(BaseModel):
    title: str
    description: Optional[str] = ""
    data: dict
    owner_id: str 
    updatedAt: Optional[int] = None  # ADDED THIS

class TemplateUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    data: Optional[dict] = None
    updatedAt: Optional[int] = None  # ADDED THIS