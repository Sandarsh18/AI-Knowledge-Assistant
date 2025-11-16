"""Azure Cosmos DB helpers for storing document metadata and chat history (with local fallback)."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import uuid4
import os
import json

from azure.cosmos import CosmosClient, PartitionKey
from azure.cosmos.exceptions import CosmosResourceNotFoundError

# -----------------------------------------------------
# Globals
# -----------------------------------------------------
_client: Optional[CosmosClient] = None
_database = None
_container = None
_is_local_mode: bool = False
_local_db_dir = "local_cosmos_data"
_local_docs_file = os.path.join(_local_db_dir, "documents.json")
_local_messages_file = os.path.join(_local_db_dir, "messages.json")


# -----------------------------------------------------
# Initialize Cosmos DB
# -----------------------------------------------------
def init_cosmos(endpoint: Optional[str], key: Optional[str]) -> None:
    """Initialise Cosmos DB client or local fallback JSON storage."""
    global _client, _database, _container, _is_local_mode

    if not endpoint or not key or not endpoint.startswith("https://"):
        print("⚙️ Running in LOCAL mode — using JSON files for data persistence.")
        _is_local_mode = True
        os.makedirs(_local_db_dir, exist_ok=True)
        # Ensure local files exist
        for file in [_local_docs_file, _local_messages_file]:
            if not os.path.exists(file):
                with open(file, "w", encoding="utf-8") as f:
                    json.dump([], f)
        return

    try:
        print("🔗 Connecting to Azure Cosmos DB...")
        _client = CosmosClient(endpoint, credential=key)
        _database = _client.create_database_if_not_exists(id="pdfchat-db")
        _container = _database.create_container_if_not_exists(
            id="pdfchat-container",
            partition_key=PartitionKey(path="/user_id"),
            offer_throughput=400,
        )
        print("✅ Connected to Cosmos DB: pdfchat-db/pdfchat-container")
    except Exception as e:
        print(f"⚠️ Cosmos DB connection failed ({e}). Switching to local mode.")
        _is_local_mode = True
        os.makedirs(_local_db_dir, exist_ok=True)


# -----------------------------------------------------
# Local Helper Utilities
# -----------------------------------------------------
def _load_json(file_path: str) -> list:
    if not os.path.exists(file_path):
        return []
    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_json(file_path: str, data: list) -> None:
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


# -----------------------------------------------------
# Document Operations
# -----------------------------------------------------
def save_document(user_id: str, file_name: str, blob_name: str, text: str) -> Dict[str, Any]:
    """Persist document metadata and extracted text."""
    document_id = str(uuid4())
    item = {
        "id": document_id,
        "type": "document",
        "user_id": user_id,
        "file_name": file_name,
        "blob_name": blob_name,
        "text": text,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    if _is_local_mode:
        docs = _load_json(_local_docs_file)
        docs.append(item)
        _save_json(_local_docs_file, docs)
        print(f"💾 Document saved locally → {file_name}")
        return item

    if _container is None:
        raise RuntimeError("Cosmos container is not initialised.")
    _container.upsert_item(item)
    print(f"✅ Document saved in Cosmos DB → {file_name}")
    return item


def get_document(user_id: str, document_id: str) -> Optional[Dict[str, Any]]:
    """Fetch a stored document by id."""
    if _is_local_mode:
        docs = _load_json(_local_docs_file)
        for doc in docs:
            if doc["id"] == document_id and doc["user_id"] == user_id:
                return doc
        return None

    if _container is None:
        raise RuntimeError("Cosmos container is not initialised.")
    try:
        return _container.read_item(item=document_id, partition_key=user_id)
    except CosmosResourceNotFoundError:
        return None


# -----------------------------------------------------
# Chat Message Operations
# -----------------------------------------------------
def save_message(user_id: str, doc_id: str, role: str, content: str) -> Dict[str, Any]:
    """Persist a chat message linked to a specific document."""
    message_id = str(uuid4())
    item = {
        "id": message_id,
        "type": "message",
        "user_id": user_id,
        "doc_id": doc_id,
        "role": role,
        "content": content,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    if _is_local_mode:
        msgs = _load_json(_local_messages_file)
        msgs.append(item)
        _save_json(_local_messages_file, msgs)
        print(f"💬 Message stored locally ({role}) → {content[:40]}...")
        return item

    if _container is None:
        raise RuntimeError("Cosmos container is not initialised.")
    _container.upsert_item(item)
    print(f"💬 Message saved in Cosmos DB ({role}) → {content[:40]}...")
    return item


def get_history(user_id: str, doc_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Retrieve chat messages for a user, optionally filtered by document id."""
    if _is_local_mode:
        msgs = _load_json(_local_messages_file)
        filtered = [
            m for m in msgs
            if m["user_id"] == user_id and (not doc_id or m["doc_id"] == doc_id)
        ]
        return sorted(filtered, key=lambda x: x["timestamp"])

    if _container is None:
        raise RuntimeError("Cosmos container is not initialised.")

    if doc_id:
        query = (
            "SELECT * FROM c WHERE c.type = 'message' AND c.user_id = @user_id AND c.doc_id = @doc_id "
            "ORDER BY c.timestamp"
        )
        parameters = [
            {"name": "@user_id", "value": user_id},
            {"name": "@doc_id", "value": doc_id},
        ]
    else:
        query = (
            "SELECT * FROM c WHERE c.type = 'message' AND c.user_id = @user_id "
            "ORDER BY c.timestamp"
        )
        parameters = [{"name": "@user_id", "value": user_id}]

    items = _container.query_items(
        query=query,
        parameters=parameters,
        enable_cross_partition_query=True,
    )
    return list(items)
