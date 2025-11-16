"""Azure Blob Storage helpers for persisting uploaded PDF files (with local fallback)."""
from __future__ import annotations

import mimetypes
import os
import uuid
from typing import Optional

from azure.storage.blob import BlobServiceClient

# -----------------------------------------------------
# Globals
# -----------------------------------------------------
_blob_service_client: Optional[BlobServiceClient] = None
_container_name: Optional[str] = None
_is_local_mode: bool = False
_local_uploads_dir = "uploads"


# -----------------------------------------------------
# Initialization
# -----------------------------------------------------
def init_storage(connection_string: Optional[str], container_name: Optional[str]) -> None:
    """Initialise Azure Blob service or fallback to local file system."""
    global _blob_service_client, _container_name, _is_local_mode

    # Local fallback mode
    if not connection_string or not container_name:
        print("⚙️ Running in LOCAL mode — files will be stored under ./uploads/")
        _is_local_mode = True
        os.makedirs(_local_uploads_dir, exist_ok=True)
        return

    try:
        print("🔗 Connecting to Azure Blob Storage...")
        _blob_service_client = BlobServiceClient.from_connection_string(connection_string)
        _container_name = container_name

        container_client = _blob_service_client.get_container_client(container_name)
        container_client.create_container(public_access="blob")
        print(f"✅ Connected to Azure Blob container: {_container_name}")

    except Exception as e:
        print(f"⚠️ Azure connection failed ({e}). Switching to local mode.")
        _is_local_mode = True
        os.makedirs(_local_uploads_dir, exist_ok=True)


# -----------------------------------------------------
# Upload Function
# -----------------------------------------------------
def upload_pdf_bytes(file_name: str, data: bytes) -> str:
    """Upload PDF bytes to Azure Blob or store locally if Azure unavailable."""
    # --- Local storage fallback ---
    if _is_local_mode:
        extension = os.path.splitext(file_name)[-1] or ".pdf"
        local_name = f"{uuid.uuid4()}{extension}"
        local_path = os.path.join(_local_uploads_dir, local_name)

        with open(local_path, "wb") as f:
            f.write(data)

        print(f"📂 Stored locally → {local_path}")
        return local_path

    # --- Azure Blob upload ---
    if _blob_service_client is None or _container_name is None:
        raise RuntimeError("Storage client is not initialised.")

    extension = os.path.splitext(file_name)[-1] or ".pdf"
    blob_name = f"{uuid.uuid4()}{extension}"
    container_client = _blob_service_client.get_container_client(_container_name)
    blob_client = container_client.get_blob_client(blob_name)

    content_type, _ = mimetypes.guess_type(file_name)
    blob_client.upload_blob(
        data,
        overwrite=True,
        content_type=content_type or "application/pdf",
    )

    print(f"✅ Uploaded to Azure Blob → {blob_client.url}")
    return blob_name


# -----------------------------------------------------
# Get URL
# -----------------------------------------------------
def get_blob_url(blob_name: str) -> str:
    """Return publicly accessible Blob URL or local file reference."""
    # Local mode
    if _is_local_mode:
        abs_path = os.path.abspath(blob_name)
        return f"file://{abs_path}"

    # Azure mode
    if _blob_service_client is None or _container_name is None:
        raise RuntimeError("Storage client is not initialised.")

    container_client = _blob_service_client.get_container_client(_container_name)
    blob_client = container_client.get_blob_client(blob_name)
    return blob_client.url
