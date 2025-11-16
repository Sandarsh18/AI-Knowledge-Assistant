"""Pydantic schemas for request and response payloads."""
from __future__ import annotations

from typing import List, Literal
from datetime import datetime, timezone
from uuid import uuid4

from pydantic import BaseModel, Field


# -----------------------------------------------------
# Utility functions
# -----------------------------------------------------
def utc_now_iso() -> str:
    """Return a UTC timestamp in ISO 8601 format."""
    return datetime.now(timezone.utc).isoformat()


def generate_id() -> str:
    """Generate a unique identifier string."""
    return str(uuid4())


# -----------------------------------------------------
# Document Schemas
# -----------------------------------------------------
class DocumentCreate(BaseModel):
    """Schema for creating a new document record."""
    user_id: str = Field(..., description="Unique identifier of the user uploading the PDF.")
    file_name: str = Field(..., description="Original filename of the uploaded PDF.")
    blob_name: str = Field(..., description="Azure Blob name or local filename reference.")
    text: str = Field(..., description="Extracted text content from the uploaded PDF.")


class DocumentResponse(BaseModel):
    """Response model for stored document metadata."""
    id: str = Field(default_factory=generate_id)
    type: Literal["document"] = "document"
    user_id: str
    file_name: str
    blob_name: str
    text: str
    created_at: str = Field(default_factory=utc_now_iso)


# -----------------------------------------------------
# Chat Message Schemas
# -----------------------------------------------------
class MessageCreate(BaseModel):
    """Schema for creating a new chat message."""
    user_id: str
    doc_id: str
    role: Literal["user", "assistant"]
    content: str


class MessageResponse(BaseModel):
    """Schema for returning chat messages."""
    id: str = Field(default_factory=generate_id)
    type: Literal["message"] = "message"
    user_id: str
    doc_id: str
    role: Literal["user", "assistant"]
    content: str
    timestamp: str = Field(default_factory=utc_now_iso)


# -----------------------------------------------------
# Chat History Schemas
# -----------------------------------------------------
class HistoryItem(BaseModel):
    """Represents a single chat exchange (user ↔ assistant)."""
    id: str
    type: Literal["message"]
    user_id: str
    doc_id: str
    role: Literal["user", "assistant"]
    content: str
    timestamp: str


class HistoryResponse(BaseModel):
    """Response containing the chat history."""
    items: List[HistoryItem]


# -----------------------------------------------------
# Upload Schemas
# -----------------------------------------------------
class UploadResponse(BaseModel):
    """Response after successfully uploading and storing a PDF."""
    doc_id: str = Field(..., description="Identifier of the stored document.")
    file_name: str = Field(..., description="Original filename of the uploaded PDF.")
    blob_url: str = Field(..., description="Publicly accessible blob URL or local path.")
    created_at: str = Field(default_factory=utc_now_iso, description="UTC timestamp of when the document was stored.")


# -----------------------------------------------------
# Gemini Ask Schemas
# -----------------------------------------------------
class AskRequest(BaseModel):
    """Request schema for asking a question about a specific PDF."""
    user_id: str = Field(..., description="Identifier of the authenticated user.")
    doc_id: str = Field(..., description="Document ID to scope the question.")
    question: str = Field(..., description="User's question related to the uploaded PDF.")


class AskResponse(BaseModel):
    """Response schema containing Gemini’s generated answer."""
    answer: str = Field(..., description="Answer text generated from the Gemini Flash API.")
