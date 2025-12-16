from pydantic import BaseModel
from typing import List, Optional
from uuid import UUID
from datetime import datetime

# Pydantic model for Document
class Document(BaseModel):
    id: str
    type: str = "document"
    user_id: str
    file_name: str
    blob_name: str
    text: str
    created_at: datetime

# Pydantic model for Message
class Message(BaseModel):
    id: UUID
    type: str = "message"
    user_id: str
    doc_id: str
    role: str  # "user" or "assistant"
    content: str
    timestamp: datetime

# Pydantic model for the request body of the upload endpoint
class UploadRequest(BaseModel):
    user_id: str

# Pydantic model for the request body of the ask endpoint
class AskRequest(BaseModel):
    user_id: str
    doc_id: str
    question: str

# Pydantic model for the response of the ask endpoint
class AskResponse(BaseModel):
    answer: str

# Pydantic model for the response of the history endpoint
class HistoryResponse(BaseModel):
    messages: List[Message]