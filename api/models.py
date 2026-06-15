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
    user: Dict[str, Any]

class ProgressUpdate(BaseModel):
    email: str
    lesson_id: str
    score: float
    completed: Optional[bool] = False

class ActivitySubmission(BaseModel):
    userId: str
    moduleId: str
    activityId: str
    type: str = "activity"
    status: str = "draft"
    score: float = 0
    maxScore: float = 100
    
    # Original naming conventions preserved
    passedTestCases: int = 0
    totalTestCases: int = 0
    
    # Safe catches for the new App.jsx duplicates to prevent 422 Unprocessable Entity
    passed_tests: Optional[int] = 0
    total_tests: Optional[int] = 0
    
    # New continuous metrics safely integrated
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