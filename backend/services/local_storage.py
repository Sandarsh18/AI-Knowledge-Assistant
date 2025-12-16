"""
Local storage backend for development mode.
Stores PDFs in ./tmp and metadata + messages in a JSON file.
"""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Tuple
from uuid import uuid4

logger = logging.getLogger(__name__)

# Local filesystem paths
BASE_DIR = Path(__file__).resolve().parent.parent
TMP_DIR = BASE_DIR / "tmp"
DB_FILE = BASE_DIR / "local_db.json"

TMP_DIR.mkdir(parents=True, exist_ok=True)
if not DB_FILE.exists():
    DB_FILE.write_text(json.dumps({"documents": [], "messages": []}, indent=2))


def _utc_now() -> str:
    """Return a UTC timestamp in ISO-8601 format without microseconds."""
    return (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def _normalize_timestamp(value) -> str:
    """Coerce persisted timestamps into ISO-8601 strings for the client."""
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


def _load_db() -> dict:
    with DB_FILE.open("r") as f:
        return json.load(f)


def _save_db(db: dict):
    with DB_FILE.open("w") as f:
        json.dump(db, f, indent=2)


async def save_pdf(
    file_bytes: bytes,
    file_name: str,
    doc_id: str,
    user_id: str,
) -> Tuple[str, str, str]:
    """
    Stores the PDF on local disk and returns a fake blob URL.
    """

    user_folder = TMP_DIR / user_id
    user_folder.mkdir(exist_ok=True)

    file_path = user_folder / file_name
    blob_name = f"{user_id}/{file_name}"

    file_path.write_bytes(file_bytes)

    fake_blob_url = f"file://{file_path}"

    return fake_blob_url, file_name, blob_name


async def save_document(
    doc_id: str,
    user_id: str,
    file_name: str,
    blob_name: str,
    blob_url: str,
    document_text: str,
):
    """
    Save metadata + extracted text to local JSON DB.
    """

    db = _load_db()

    created_at = _utc_now()

    db["documents"].append(
        {
            "id": doc_id,
            "user_id": user_id,
            "file_name": file_name,
            "blob_name": blob_name,
            "blob_url": blob_url,
            "document_text": document_text,
            "created_at": created_at,
            "type": "document",
        }
    )

    _save_db(db)


async def get_document_text(user_id: str, doc_id: str) -> str:
    """
    Fetch stored extracted text from JSON DB.
    """

    db = _load_db()

    for doc in db["documents"]:
        if doc["user_id"] == user_id and doc["id"] == doc_id:
            return doc["document_text"]

    raise ValueError("Document not found.")


async def save_message(user_id: str, doc_id: str, role: str, message: str):
    """
    Store chat messages for history.
    """

    db = _load_db()

    entry = {
        "id": str(uuid4()),
        "type": "message",
        "user_id": user_id,
        "doc_id": doc_id,
        "role": role,
        "content": message,
        "timestamp": _utc_now(),
    }

    db["messages"].append(entry)

    _save_db(db)


async def get_history(user_id: str, doc_id: str | None = None):
    """
    Load chat history for a user or a specific document.
    """

    db = _load_db()
    messages = db["messages"]

    updated = False

    if doc_id:
        normalized = []
        for entry in messages:
            if entry.get("user_id") != user_id or entry.get("doc_id") != doc_id:
                continue

            if "id" not in entry or not entry["id"]:
                entry["id"] = str(uuid4())
                updated = True

            content = entry.get("content") or entry.get("message") or ""
            if entry.get("content") != content:
                entry["content"] = content
                updated = True

            timestamp = _normalize_timestamp(entry.get("timestamp"))
            if entry.get("timestamp") != timestamp:
                entry["timestamp"] = timestamp
                updated = True

            entry.setdefault("type", "message")

            normalized.append(
                {
                    "id": entry["id"],
                    "type": entry["type"],
                    "user_id": entry["user_id"],
                    "doc_id": entry["doc_id"],
                    "role": entry["role"],
                    "content": entry["content"],
                    "timestamp": entry["timestamp"],
                }
            )

        normalized.sort(key=lambda item: item["timestamp"])

        if updated:
            _save_db(db)

        return normalized

    documents = []
    for doc in db["documents"]:
        if doc.get("user_id") != user_id:
            continue

        created_at = _normalize_timestamp(doc.get("created_at"))
        if doc.get("created_at") != created_at:
            doc["created_at"] = created_at
            updated = True

        documents.append(
            {
                "id": doc["id"],
                "type": doc.get("type", "document"),
                "user_id": doc["user_id"],
                "file_name": doc.get("file_name", ""),
                "blob_name": doc.get("blob_name"),
                "blob_url": doc.get("blob_url"),
                "created_at": created_at,
            }
        )

    if updated:
        _save_db(db)

    return documents
