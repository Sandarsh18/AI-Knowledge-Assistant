"""Main FastAPI application for Azure PDF Chat."""

import logging
import os
from typing import Optional
from uuid import uuid4

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
load_dotenv()

# ------------------ SERVICE IMPORTS ------------------ #
from .services.cosmos import (
    get_document_text,
    get_history,
    save_document,
    save_message,
    USE_LOCAL_MODE,
)
from .services.gemini import get_gemini_response
from .services.pdf import extract_text_from_pdf
from .services.storage import upload_to_blob

# ------------------ LOGGER SETUP ------------------ #
logger = logging.getLogger("azure_pdf_chat.backend")
if not logging.getLogger().handlers:
    logging.basicConfig(level=logging.INFO)

# ------------------ ENV CHECK ------------------ #
REQUIRED_AZURE_ENV_VARS = [
    "AZURE_BLOB_CONNECTION_STRING",
    "AZURE_BLOB_CONTAINER",
    "COSMOS_URL",
    "COSMOS_KEY",
    "COSMOS_DB",
    "COSMOS_CONTAINER",
    "ALLOWED_ORIGIN",
]

_missing_env = [name for name in REQUIRED_AZURE_ENV_VARS if not os.getenv(name)]
RUN_LOCAL = len(_missing_env) > 0

if RUN_LOCAL:
    logger.warning(
        "[LOCAL MODE] Azure resources missing: %s. Using local storage + JSON DB.",
        ", ".join(_missing_env),
    )
    allowed_origins = ["http://localhost:5173", "http://localhost:3000"]
else:
    allowed_origin_value = os.getenv("ALLOWED_ORIGIN")
    if not allowed_origin_value:
        raise RuntimeError("ALLOWED_ORIGIN must be defined when running in Azure mode.")
    allowed_origins = [allowed_origin_value]

# ------------------ FASTAPI APP ------------------ #

app = FastAPI(title="Azure PDF Chat API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# ------------------ MODELS ------------------ #

class UploadResponse(BaseModel):
    doc_id: str
    file_name: str
    blob_url: str


class AskRequest(BaseModel):
    user_id: str
    doc_id: str
    question: str


class AskResponse(BaseModel):
    answer: str


# ------------------ HEALTH CHECK ------------------ #

@app.get("/api/health")
async def health_check() -> dict[str, bool]:
    return {"ok": True}


# ------------------ UPLOAD PDF ------------------ #

@app.post("/api/upload", response_model=UploadResponse)
async def upload_pdf(user_id: str = Form(...), file: UploadFile = File(...)) -> UploadResponse:
    if not user_id.strip():
        raise HTTPException(status_code=400, detail="user_id is required.")

    if file.content_type not in {"application/pdf", "application/x-pdf"}:
        raise HTTPException(status_code=400, detail="Only PDF uploads are supported.")

    doc_id = str(uuid4())

    try:
        blob_url, stored_file_name, blob_name = await upload_to_blob(file, doc_id, user_id)
        document_text = await extract_text_from_pdf(file)
        await save_document(doc_id, user_id, stored_file_name, blob_name, blob_url, document_text)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to process PDF upload.")
        raise HTTPException(status_code=500, detail="Failed to process upload.") from exc

    return UploadResponse(doc_id=doc_id, file_name=stored_file_name, blob_url=blob_url)


# ------------------ ASK QUESTION ------------------ #

@app.post("/api/ask", response_model=AskResponse)
async def ask_question(request: AskRequest) -> AskResponse:
    question = request.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question cannot be empty.")

    try:
        document_text = await get_document_text(request.user_id, request.doc_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Unable to load document text.")
        raise HTTPException(status_code=500, detail="Failed to load document.") from exc

    await save_message(request.user_id, request.doc_id, "user", question)

    try:
        answer = await get_gemini_response(document_text, question)
    except RuntimeError as exc:
        # User-friendly error message from gemini.py
        logger.error(f"Gemini API error: {exc}")
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Gemini generation failed.")
        raise HTTPException(status_code=502, detail="AI service temporarily unavailable. Please try again.") from exc

    await save_message(request.user_id, request.doc_id, "assistant", answer)

    return AskResponse(answer=answer)


# ------------------ CHAT HISTORY ------------------ #

@app.get("/api/history")
async def get_chat_history(user_id: str, doc_id: Optional[str] = None) -> list[dict]:
    try:
        return await get_history(user_id, doc_id)
    except Exception as exc:
        logger.exception("Unable to fetch history.")
        raise HTTPException(status_code=500, detail="Failed to fetch history.") from exc


# ------------------ DOCUMENT LIST ------------------ #

@app.get("/api/documents")
async def list_documents(user_id: str):
    """Return list of uploaded documents for the given user."""
    if USE_LOCAL_MODE:
        from .services.local_storage import get_history as local_get_history

        documents = await local_get_history(user_id)
        return [
            {
                "id": doc["id"],
                "file_name": doc.get("file_name", ""),
                "blob_url": doc.get("blob_url"),
                "created_at": doc.get("created_at"),
            }
            for doc in documents
        ]

    # Azure Cosmos mode
    from .services.cosmos import _get_container
    container = _get_container()

    query = """
        SELECT c.id, c.file_name, c.blob_url, c.created_at
        FROM c 
        WHERE c.type='document' AND c.user_id=@user
    """

    params = [{"name": "@user", "value": user_id}]
    docs = list(container.query_items(query=query, parameters=params, enable_cross_partition_query=False))

    return docs
