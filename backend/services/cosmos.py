"""
Cosmos DB service for Azure PDF Chat.
Automatically falls back to local storage in development mode.
"""

import os
import logging
from datetime import datetime, timezone
from typing import Optional

from azure.cosmos import CosmosClient, exceptions
from .local_storage import (
    save_document as local_save_document,
    save_pdf as local_save_pdf,
    get_document_text as local_get_document_text,
    save_message as local_save_message,
    get_history as local_get_history,
)

logger = logging.getLogger(__name__)

# Required environment variables
COSMOS_URL = os.getenv("COSMOS_URL")
COSMOS_KEY = os.getenv("COSMOS_KEY")
COSMOS_DB = os.getenv("COSMOS_DB")
COSMOS_CONTAINER = os.getenv("COSMOS_CONTAINER")

# Detect local mode if missing env vars
USE_LOCAL_MODE = not all([COSMOS_URL, COSMOS_KEY, COSMOS_DB, COSMOS_CONTAINER])

# Cosmos client initialization
client = None
database = None
container = None

if not USE_LOCAL_MODE:
    try:
        client = CosmosClient(COSMOS_URL, credential=COSMOS_KEY)
        database = client.get_database_client(COSMOS_DB)
        container = database.get_container_client(COSMOS_CONTAINER)
        logger.info("Cosmos DB connected successfully.")
    except Exception as exc:
        logger.error("Failed to initialize Cosmos DB. Switching to local mode.")
        USE_LOCAL_MODE = True


def _utc_now() -> str:
    """Return a UTC timestamp in ISO-8601 format without microseconds."""
    return (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def _normalize_timestamp(value) -> str:
    if value in (None, ""):
        return _utc_now()

    if isinstance(value, (int, float)):
        return (
            datetime.fromtimestamp(value, tz=timezone.utc)
            .replace(microsecond=0)
            .isoformat()
            .replace("+00:00", "Z")
        )

    candidate = str(value).strip()
    if candidate == "":
        return _utc_now()

    try:
        parsed = datetime.fromisoformat(candidate.replace("Z", "+00:00"))
        return parsed.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    except ValueError:
        try:
            parsed = datetime.fromtimestamp(float(candidate), tz=timezone.utc)
            return parsed.replace(microsecond=0).isoformat().replace("+00:00", "Z")
        except ValueError:
            return _utc_now()


def _get_container():
    """Internal helper to get the Cosmos container."""
    if USE_LOCAL_MODE:
        raise RuntimeError("Cosmos not available in local mode.")
    return container


# --------------------------------------------------------------
# DOCUMENT FUNCTIONS
# --------------------------------------------------------------

async def save_document(
    doc_id: str,
    user_id: str,
    file_name: str,
    blob_name: str,
    blob_url: str,
    document_text: str,
):
    """Store metadata + extracted PDF text."""
    if USE_LOCAL_MODE:
        return await local_save_document(
            doc_id, user_id, file_name, blob_name, blob_url, document_text
        )

    item = {
        "id": doc_id,
        "user_id": user_id,
        "file_name": file_name,
        "blob_name": blob_name,
        "blob_url": blob_url,
        "document_text": document_text,
        "created_at": _utc_now(),
        "type": "document",
    }

    try:
        container.create_item(item)
    except Exception as exc:
        logger.exception("Failed to save document in Cosmos DB.")
        raise


async def get_document_text(user_id: str, doc_id: str) -> str:
    """Retrieve extracted text of the stored PDF."""

    if USE_LOCAL_MODE:
        return await local_get_document_text(user_id, doc_id)

    try:
        query = (
            "SELECT * FROM c WHERE c.id=@id AND c.user_id=@user AND c.type='document'"
        )
        params = [{"name": "@id", "value": doc_id}, {"name": "@user", "value": user_id}]
        results = list(container.query_items(query=query, parameters=params))

        if not results:
            raise ValueError("Document not found.")
        return results[0]["document_text"]

    except Exception as exc:
        logger.exception("Error fetching document text from Cosmos.")
        raise


# --------------------------------------------------------------
# CHAT HISTORY FUNCTIONS
# --------------------------------------------------------------

async def save_message(user_id: str, doc_id: str, role: str, message: str):
    """Store each chat message."""

    if USE_LOCAL_MODE:
        return await local_save_message(user_id, doc_id, role, message)

    item = {
        "id": f"{doc_id}-{role}-{os.urandom(4).hex()}",
        "user_id": user_id,
        "doc_id": doc_id,
        "type": "message",
        "role": role,
        "content": message,
        "message": message,
        "timestamp": _utc_now(),
    }

    try:
        container.create_item(item)
    except Exception:
        logger.exception("Failed to save message in Cosmos DB.")
        raise


async def get_history(user_id: str, doc_id: Optional[str] = None):
    """Load conversation for a user or document."""
    if USE_LOCAL_MODE:
        return await local_get_history(user_id, doc_id)

    try:
        if doc_id:
            query = (
                "SELECT * FROM c "
                "WHERE c.user_id=@user AND c.doc_id=@doc AND c.type='message'"
            )
            params = [
                {"name": "@user", "value": user_id},
                {"name": "@doc", "value": doc_id},
            ]
        else:
            # list documents for user
            query = (
                "SELECT * FROM c "
                "WHERE c.user_id=@user AND c.type='document'"
            )
            params = [{"name": "@user", "value": user_id}]

        results = list(container.query_items(query=query, parameters=params))

        if doc_id:
            shaped = []
            for item in results:
                shaped.append(
                    {
                        "id": item.get("id"),
                        "type": item.get("type", "message"),
                        "user_id": item.get("user_id"),
                        "doc_id": item.get("doc_id"),
                        "role": item.get("role"),
                        "content": item.get("content") or item.get("message") or "",
                        "timestamp": _normalize_timestamp(item.get("timestamp")),
                    }
                )

            shaped.sort(key=lambda entry: entry["timestamp"])
            return shaped

        documents = []
        for item in results:
            documents.append(
                {
                    "id": item.get("id"),
                    "type": item.get("type", "document"),
                    "user_id": item.get("user_id"),
                    "file_name": item.get("file_name"),
                    "blob_name": item.get("blob_name"),
                    "blob_url": item.get("blob_url"),
                    "created_at": _normalize_timestamp(item.get("created_at")),
                }
            )

        return documents

    except Exception:
        logger.exception("Failed to load Cosmos history.")
        raise
