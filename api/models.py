# api/models.py
from pydantic import BaseModel, EmailStr
from typing import Dict, Any, Optional, List

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class GoogleLoginRequest(BaseModel):
    token: str

class ProjectSyncRequest(BaseModel):
    projectId: Optional[str] = None
    userId: str
    name: str
    description: Optional[str] = ""
    workspace: Dict[str, Any]
    pythonCode: Optional[str] = ""

class TemplateSyncRequest(BaseModel):
    templateId: Optional[str] = None
    userId: str
    name: str
    description: Optional[str] = ""
    category: Optional[str] = "Custom Templates"
    workspace: Dict[str, Any]

class SubmissionSyncRequest(BaseModel):
    userId: str
    moduleId: str
    activityId: str
    type: Optional[str] = "activity"
    status: Optional[str] = "draft"
    score: int
    maxScore: int
    
    # --- THESIS METHODOLOGY METRICS ---
    initial_aes: Optional[int] = None
    final_aes: Optional[int] = None
    rog: Optional[int] = None
    # ----------------------------------
    
    passedTestCases: int
    totalTestCases: int
    passed_tests: Optional[int] = 0
    total_tests: Optional[int] = 0
    testCases: Optional[List[Any]] = []
    target_complexity: Optional[str] = "O(n)"
    actual_complexity: Optional[str] = "O(n^2)"
    target_space_complexity: Optional[str] = "O(1)"
    actual_space_complexity: Optional[str] = "O(1)"
    workspace: Dict[str, Any]
    pythonCode: str
    timestamp: float
    submittedAt: str
    isSynced: bool

class ProgressUpdateRequest(BaseModel):
    email: str
    lesson_id: str
    score: int
    completed: Optional[bool] = False

class AssessmentUpdateRequest(BaseModel):
    email: str
    assessment_key: str
    score: int
    correct: int
    total: int
    timeElapsed: int
    completedAt: str
    attempts: int