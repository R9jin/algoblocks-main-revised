# api/models.py
from pydantic import BaseModel, EmailStr, Field
from typing import Dict, Any, Optional, List

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    # BUG-11 Fix: Enforce minimum password boundary
    password: str = Field(..., min_length=6)

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user: Dict[str, Any]

class GoogleLoginRequest(BaseModel):
    token: str

class ProgressUpdate(BaseModel):
    email: Optional[str] = None
    lesson_id: str
    score: float
    completed: Optional[bool] = False

class AssessmentUpdateRequest(BaseModel):
    email: Optional[str] = None
    assessment_key: str
    score: float
    correct: int
    total: int
    timeElapsed: int
    completedAt: str
    attempts: int

class ProjectSyncRequest(BaseModel):
    userId: Optional[str] = None
    projectId: str
    title: Optional[str] = "Untitled Project"
    description: Optional[str] = ""
    workspace: Optional[Dict[str, Any]] = {}
    pythonCode: Optional[str] = ""
    timestamp: Optional[int] = None
    isSynced: Optional[bool] = False

class TemplateSyncRequest(BaseModel):
    templateId: str
    title: Optional[str] = "Untitled Template"
    description: Optional[str] = ""
    workspace: Optional[Dict[str, Any]] = {}
    pythonCode: Optional[str] = ""
    userId: Optional[str] = None
    timestamp: Optional[int] = None
    isSynced: Optional[bool] = False

class ActivitySubmission(BaseModel):
    userId: str
    moduleId: str
    activityId: str
    type: str = "activity"
    status: str = "draft"
    score: float = 0
    maxScore: float = 100
    
    passedTestCases: int = 0
    totalTestCases: int = 0
    passed_tests: Optional[int] = 0
    total_tests: Optional[int] = 0
    
    functional_passed: Optional[int] = 0
    functional_total: Optional[int] = 0
    
    initial_aes: Optional[float] = None
    final_aes: Optional[float] = None
    rog: Optional[float] = 0.0

    testCases: Optional[List[Dict[str, Any]]] = []
    target_complexity: Optional[str] = "O(n)"
    actual_complexity: Optional[str] = "O(n^2)"
    target_space_complexity: Optional[str] = "O(1)"
    actual_space_complexity: Optional[str] = "O(1)"
    workspace: Optional[Dict[str, Any]] = {}
    pythonCode: str = ""
    timestamp: Optional[int] = None
    submittedAt: Optional[str] = None
    isSynced: Optional[bool] = False

class AssessmentSubmission(BaseModel):
    userId: str
    assessmentId: str
    score: float
    maxScore: float
    passed: bool
    answers: Dict[str, Any]
    timestamp: Optional[int] = None

class GuestProgressUpdate(BaseModel):
    session_id: str
    progress_data: Dict[str, Any]

class BatchSyncPayload(BaseModel):
    progress: Optional[List[Dict[str, Any]]] = []
    submissions: Optional[List[Dict[str, Any]]] = []
    assessments: Optional[List[Dict[str, Any]]] = []

class SyncResponse(BaseModel):
    status: str
    message: str
    synced_items: int