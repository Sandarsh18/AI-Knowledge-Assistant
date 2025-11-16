"""FastAPI entrypoint exposing PDF upload, question answering, and chat history endpoints."""
from __future__ import annotations

import os
import uuid
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.status import (
    HTTP_200_OK,
    HTTP_201_CREATED,
    HTTP_400_BAD_REQUEST,
    HTTP_404_NOT_FOUND,
    HTTP_500_INTERNAL_SERVER_ERROR,
)

from models import AskRequest, AskResponse, HistoryResponse, UploadResponse
from services import cosmos, gemini, pdf, storage

# -----------------------------------------------------
# Load environment variables
# -----------------------------------------------------
load_dotenv()

app = FastAPI(title="Azure PDF Chat", version="1.0.0")

# -----------------------------------------------------
# Configure CORS dynamically from .env
# -----------------------------------------------------
allowed_origins = os.getenv("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
print(f"🌐 Allowed origins: {allowed_origins}")

# -----------------------------------------------------
# Helper: Get required environment variable
# -----------------------------------------------------
def _get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


# -----------------------------------------------------
# Startup event — initialize Azure services
# -----------------------------------------------------
@app.on_event("startup")
def on_startup():
    try:
        storage.init_storage(
            os.getenv("AZURE_STORAGE_CONNECTION_STRING"),
            os.getenv("AZURE_STORAGE_CONTAINER_NAME"),
        )

        cosmos_endpoint = os.getenv("COSMOS_ENDPOINT")
        cosmos_key = os.getenv("COSMOS_KEY")

        # Initialize Cosmos DB if credentials exist
        if cosmos_endpoint and cosmos_key and cosmos_endpoint.startswith("https://"):
            cosmos.init_cosmos(cosmos_endpoint, cosmos_key)
            print("✅ Connected to Azure Cosmos DB.")
        else:
            print("⚠️ Skipping CosmosDB initialization (no valid connection info).")

        print("✅ FastAPI app initialized successfully on Azure.")

    except Exception as e:
        print(f"❌ Startup failed: {e}")


# -----------------------------------------------------
# Health Check Endpoint
# -----------------------------------------------------
@app.get("/health", status_code=HTTP_200_OK)
async def healthcheck() -> JSONResponse:
    """Return OK for uptime probes."""
    return JSONResponse({"ok": True})


# -----------------------------------------------------
# Upload PDF Endpoint
# -----------------------------------------------------
@app.post("/upload", response_model=UploadResponse, status_code=HTTP_201_CREATED)
async def upload_pdf(file: UploadFile = File(...), user_id: str = Form(...)) -> UploadResponse:
    """Accept a PDF upload, store it in blob storage, and index it in Cosmos DB."""
    if file.content_type != "application/pdf":
        raise HTTPException(
            status_code=HTTP_400_BAD_REQUEST,
            detail="Only PDF uploads are supported.",
        )

    pdf_bytes = await file.read()
    if not pdf_bytes:
        raise HTTPException(
            status_code=HTTP_400_BAD_REQUEST,
            detail="The uploaded file is empty."
        )

    try:
        # Upload to Azure Blob or local fallback
        blob_name = storage.upload_pdf_bytes(file.filename, pdf_bytes)
        extracted_text = pdf.extract_text_from_pdf(pdf_bytes)

        document = None
        # Save metadata in Cosmos DB if connected
        if hasattr(cosmos, "save_document") and getattr(cosmos, "_client", None) is not None:
            document = cosmos.save_document(
                user_id=user_id,
                file_name=file.filename,
                blob_name=blob_name,
                text=extracted_text,
            )
            print("💾 Document saved to CosmosDB.")
        else:
            print("⚙️ Skipping CosmosDB save — running in local/test mode.")

    except Exception as exc:
        raise HTTPException(
            status_code=HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process uploaded PDF: {exc}",
        ) from exc

    # Fallback response if CosmosDB is off
    if not document:
        return UploadResponse(
            doc_id=str(uuid.uuid4()),
            file_name=file.filename,
            blob_url=storage.get_blob_url(blob_name),
            created_at="local-mode",
        )

    # Normal response if CosmosDB is active
    return UploadResponse(
        doc_id=document["id"],
        file_name=document["file_name"],
        blob_url=storage.get_blob_url(blob_name),
        created_at=document["created_at"],
    )


# -----------------------------------------------------
# Ask Question Endpoint
# -----------------------------------------------------
@app.post("/ask", response_model=AskResponse, status_code=HTTP_200_OK)
async def ask_question(payload: AskRequest) -> AskResponse:
    """Send a question to Gemini API with document context and log chat."""
    document = cosmos.get_document(user_id=payload.user_id, document_id=payload.doc_id)
    if document is None:
        raise HTTPException(status_code=HTTP_404_NOT_FOUND, detail="Document not found.")

    cosmos.save_message(
        user_id=payload.user_id,
        doc_id=payload.doc_id,
        role="user",
        content=payload.question,
    )

    try:
        answer = gemini.ask_with_context(
            question=payload.question,
            context=document.get("text", ""),
        )
    except Exception as exc:
        print(f"❌ Gemini request failed: {exc}")
        raise HTTPException(
            status_code=HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Gemini request failed: {exc}",
        ) from exc

    cosmos.save_message(
        user_id=payload.user_id,
        doc_id=payload.doc_id,
        role="assistant",
        content=answer,
    )

    return AskResponse(answer=answer)


# -----------------------------------------------------
# Get Chat History Endpoint
# -----------------------------------------------------
@app.get("/history", response_model=HistoryResponse, status_code=HTTP_200_OK)
async def get_history(user_id: str, doc_id: Optional[str] = None) -> HistoryResponse:
    """Return chat history for a given user, optionally filtered by document."""
    messages = cosmos.get_history(user_id=user_id, doc_id=doc_id)
    return HistoryResponse(items=[message for message in messages])
