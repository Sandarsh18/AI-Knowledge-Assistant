"""
Storage service providing Azure Blob and local disk implementations.
"""

import asyncio
import logging
import os
from pathlib import Path
from typing import Tuple

from fastapi import UploadFile

# Required env vars for Azure mode
REQUIRED_AZURE_ENV_VARS = [
    "AZURE_BLOB_CONNECTION_STRING",
    "AZURE_BLOB_CONTAINER",
    "COSMOS_URL",
    "COSMOS_KEY",
    "COSMOS_DB",
    "COSMOS_CONTAINER",
    "ALLOWED_ORIGIN",
]

# Determine whether to run in LOCAL MODE
USE_LOCAL_MODE = any(not os.getenv(name) for name in REQUIRED_AZURE_ENV_VARS)
logger = logging.getLogger(__name__)

if USE_LOCAL_MODE:
    from . import local_storage
else:
    from azure.core.exceptions import ResourceExistsError
    from azure.storage.blob import BlobServiceClient, ContentSettings

    AZURE_CONNECTION_STRING = os.getenv("AZURE_BLOB_CONNECTION_STRING", "")
    AZURE_CONTAINER = os.getenv("AZURE_BLOB_CONTAINER", "")

    _blob_service_client: BlobServiceClient | None = None
    _container_client = None

    def _get_container_client():
        """Lazy-load blob container client."""
        global _blob_service_client, _container_client
        if _container_client:
            return _container_client

        _blob_service_client = BlobServiceClient.from_connection_string(
            AZURE_CONNECTION_STRING
        )
        _container_client = _blob_service_client.get_container_client(AZURE_CONTAINER)

        try:
            _container_client.create_container()
        except ResourceExistsError:
            pass

        return _container_client


def _sanitize_filename(filename: str, fallback: str) -> str:
    """
    Strip any unsafe parts from filename.
    """
    name = Path(filename).name if filename else fallback
    return name or fallback


async def upload_to_blob(file: UploadFile, doc_id: str, user_id: str) -> Tuple[str, str, str]:
    """
    Uploads PDF to Azure blob OR local filesystem depending on mode.

    Returns:
        blob_url, stored_file_name, blob_name
    """

    safe_file_name = _sanitize_filename(file.filename or "", f"{doc_id}.pdf")

    # Read bytes
    file_bytes = await file.read()
    file.file.seek(0)

    # LOCAL MODE
    if USE_LOCAL_MODE:
        return await local_storage.save_pdf(
            file_bytes, safe_file_name, doc_id, user_id
        )

    # CLOUD MODE - Azure Blob Storage
    blob_name = f"{user_id}/{doc_id}/{safe_file_name}"

    def _upload() -> str:
        container_client = _get_container_client()
        blob_client = container_client.get_blob_client(blob_name)

        blob_client.upload_blob(
            file_bytes,
            overwrite=True,
            content_settings=ContentSettings(
                content_type=file.content_type or "application/pdf"
            ),
        )
        return blob_client.url

    blob_url = await asyncio.to_thread(_upload)
    return blob_url, safe_file_name, blob_name
