# PDF Storage Layer Architecture

This document explains the storage layer implementation for PDF file uploads in Azure PDF Chat, covering both Azure Blob Storage and local filesystem fallback mechanisms.

---

## 1. Storage Handler: `upload_to_blob()`

**Location**: `backend/services/storage.py`

**Function Signature**:
```python
async def upload_to_blob(file: UploadFile, doc_id: str, user_id: str) -> Tuple[str, str, str]
```

**Returns**: `(blob_url, stored_file_name, blob_name)`

**Purpose**: Primary interface for storing uploaded PDF files. Automatically routes to Azure Blob Storage or local filesystem based on environment configuration.

**Caller**: `backend/main.py::upload_pdf()` endpoint receives the file from frontend and invokes this function.

---

## 2. Azure Blob Storage (Production Mode)

### Initialization

**Lazy-loaded client** via `_get_container_client()`:

```python
def _get_container_client():
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
        pass  # Container already exists

    return _container_client
```

**Design**: Creates container on first access if it doesn't exist. Subsequent calls reuse the cached client.

### Upload Process

**Blob naming convention**:
```python
blob_name = f"{user_id}/{doc_id}/{safe_file_name}"
# Example: "user123@email.com/uuid-abc-123/report.pdf"
```

**Storage flow**:
1. Sanitize filename using `_sanitize_filename()` (strips path components, keeps only basename)
2. Read file bytes from FastAPI `UploadFile` object
3. Generate blob path: `{user_id}/{doc_id}/{filename}`
4. Upload to Azure Blob with:
   - `overwrite=True` (allows re-uploads with same name)
   - `content_type` set to `"application/pdf"` or original file MIME type
5. Return public/private blob URL from Azure

**Thread handling**: Upload is wrapped in `asyncio.to_thread()` since Azure SDK uses synchronous I/O.

### Data Stored

| Field | Description | Example |
|-------|-------------|---------|
| `blob_url` | Full Azure URL to the uploaded file | `https://storageaccount.blob.core.windows.net/pdfuploads/user/doc/file.pdf` |
| `stored_file_name` | Original filename (sanitized) | `quarterly_report.pdf` |
| `blob_name` | Hierarchical path within container | `user@example.com/uuid-abc/quarterly_report.pdf` |

**Metadata**: Azure Blob Storage supports custom metadata, but this implementation currently stores only:
- Content-Type header (`application/pdf`)
- Standard blob properties (size, MD5, timestamps)

---

## 3. Local Filesystem Fallback (Development Mode)

**Location**: `backend/services/local_storage.py::save_pdf()`

### Directory Structure

```
backend/
└── tmp/
    ├── local_db.json          # Metadata storage
    └── <user_id>/             # Per-user folders
        ├── document1.pdf
        └── document2.pdf
```

**Path construction**:
```python
user_folder = TMP_DIR / user_id
user_folder.mkdir(exist_ok=True)
file_path = user_folder / file_name
```

**Example**: User `user111@gmail.com` uploads `report.pdf` → saved to:
```
backend/tmp/user111@gmail.com/report.pdf
```

### Storage Flow

1. Create user-specific folder if it doesn't exist
2. Write raw file bytes to disk using `Path.write_bytes()`
3. Generate fake blob URL: `file://{absolute_path}`
4. Return same tuple format as Azure mode for API consistency

### Data Stored

| Field | Description | Example |
|-------|-------------|---------|
| `blob_url` | Fake file:// URL (not accessible by browser) | `file:///absolute/path/to/backend/tmp/user/report.pdf` |
| `stored_file_name` | Original filename | `report.pdf` |
| `blob_name` | Relative path (user/filename) | `user@example.com/report.pdf` |

**Note**: The fake blob URL is stored in JSON metadata but **cannot be used by the frontend** (file:// URLs are blocked by browsers). This is intentional—local mode is for backend development only.

### Metadata Persistence

Separate from file storage, document records are saved to `backend/tmp/local_db.json`:

```json
{
  "documents": [
    {
      "id": "doc-uuid",
      "user_id": "user@example.com",
      "file_name": "report.pdf",
      "blob_name": "user@example.com/report.pdf",
      "blob_url": "file:///path/to/backend/tmp/user@example.com/report.pdf",
      "document_text": "Extracted text from PyMuPDF...",
      "created_at": "2025-12-16T08:30:00Z",
      "type": "document"
    }
  ]
}
```

---

## 4. Storage Abstraction Contract

Both implementations return the same 3-tuple:

```python
(blob_url: str, stored_file_name: str, blob_name: str)
```

**Caller usage** (`backend/main.py`):
```python
blob_url, stored_file_name, blob_name = await upload_to_blob(file, doc_id, user_id)
await save_document(doc_id, user_id, stored_file_name, blob_name, blob_url, document_text)

return UploadResponse(doc_id=doc_id, file_name=stored_file_name, blob_url=blob_url)
```

**Why this design?**:
- `blob_url`: Returned to frontend for reference (though not directly usable in local mode)
- `stored_file_name`: Displayed in UI document library
- `blob_name`: Used for Azure Blob operations (delete, download, etc.) or local path lookup

---

## 5. Filename Sanitization

**Function**: `_sanitize_filename(filename: str, fallback: str) -> str`

**Purpose**: Prevent directory traversal attacks and handle missing filenames.

**Logic**:
```python
name = Path(filename).name if filename else fallback
return name or fallback
```

**Example transformations**:
| Input | Output |
|-------|--------|
| `"report.pdf"` | `"report.pdf"` |
| `"../../etc/passwd"` | `"passwd"` |
| `"/tmp/malicious.pdf"` | `"malicious.pdf"` |
| `""` (empty) | `"{doc_id}.pdf"` (fallback) |
| `None` | `"{doc_id}.pdf"` (fallback) |

---

## 6. File Size & Type Validation

**Frontend validation** (`frontend/src/components/UploadCard.tsx`):
```typescript
const MAX_FILE_SIZE_MB = 25;
const ACCEPTED_TYPES = ["application/pdf"];
```

**Backend validation** (`backend/main.py`):
```python
if file.content_type not in {"application/pdf", "application/x-pdf"}:
    raise HTTPException(status_code=400, detail="Only PDF uploads are supported.")
```

**Note**: No explicit size limit in backend code (FastAPI handles large uploads gracefully). Frontend enforces 25 MB before upload begins.

---

## 7. Limitations & Considerations

### Current Limitations

1. **No blob deletion endpoint**: Uploaded PDFs persist indefinitely in both modes. No cleanup mechanism exists.

2. **Local mode blob URLs unusable**: The `file://` URLs stored in local mode cannot be accessed by browsers due to security restrictions. The URL is stored for consistency but not functional.

3. **No blob metadata**: Azure Blob supports custom metadata (tags, key-value pairs), but this implementation only sets Content-Type.

4. **Single-file upload**: No batch upload support. Each file requires a separate API call.

5. **No virus scanning**: Files are stored as-is without malware detection. Consider integrating Azure Defender for Storage or third-party scanning.

6. **No deduplication**: Uploading the same file twice creates two blob entries with different `doc_id` values.

7. **Local mode disk usage**: No automatic cleanup of `backend/tmp/` directory. Manual deletion required.

### Security Considerations

- **Public vs Private containers**: The code doesn't specify blob access level. Azure defaults to private (authentication required). Configure container permissions via Azure Portal.

- **CORS**: Azure Blob Storage has its own CORS settings separate from the FastAPI backend. If frontend needs direct blob access, configure Blob CORS rules.

- **SAS tokens**: For secure direct downloads, generate Shared Access Signatures (SAS) with expiration. Not currently implemented.

- **User isolation**: Blob naming includes `user_id` prefix, providing logical separation. Enforce authorization at backend layer before returning blob URLs.

### Potential Improvements (No TODOs in code)

Based on architecture analysis:

1. **Add delete endpoint**: 
   ```python
   @app.delete("/api/documents/{doc_id}")
   async def delete_document(doc_id: str, user_id: str)
   ```

2. **Implement blob streaming**: For large files, stream directly from Azure Blob to client instead of loading into backend memory.

3. **Add blob versioning**: Use Azure Blob versioning feature to track document updates.

4. **Lifecycle policies**: Configure Azure Blob lifecycle management to auto-archive or delete old files.

5. **Local mode improvements**:
   - Replace fake `file://` URLs with backend-served download endpoint
   - Implement cleanup cron job for stale files

6. **Metadata enrichment**: Store additional blob metadata:
   - Original upload timestamp
   - File size
   - MD5 checksum
   - User tags/labels

---

## 8. Configuration Reference

### Azure Mode Environment Variables

```env
AZURE_BLOB_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...
AZURE_BLOB_CONTAINER=pdfuploads
```

**Connection string location**: Azure Portal → Storage Account → Access keys

**Container permissions**:
- Private (default): Requires authentication for access
- Blob: Anonymous read access to blobs only
- Container: Anonymous read access to container and blobs

### Local Mode (No Configuration Needed)

- Files stored in: `backend/tmp/<user_id>/`
- Metadata in: `backend/tmp/local_db.json`
- Automatically created on first upload

---

## 9. Error Handling

### Azure Upload Failures

```python
try:
    blob_url, stored_file_name, blob_name = await upload_to_blob(file, doc_id, user_id)
except Exception as exc:
    logger.exception("Failed to process PDF upload.")
    raise HTTPException(status_code=500, detail="Failed to process upload.")
```

**Common errors**:
- Invalid connection string → Logged as exception, returns 500
- Container doesn't exist → Auto-created by `_get_container_client()`
- Network timeout → Returns 500, client should retry
- Storage quota exceeded → Propagates as Azure SDK exception

### Local Mode Failures

**Common errors**:
- Disk full → `write_bytes()` raises `OSError`, returns 500
- Permission denied → `mkdir()` or file write fails, returns 500
- Invalid path → Caught by `Path` validation, uses fallback filename

**No data loss**: If blob upload succeeds but database save fails, the file remains in storage (orphaned). Consider implementing rollback or cleanup jobs.

---

## 10. Integration Flow

```
Frontend Upload
      |
      v
POST /api/upload (FormData: file, user_id)
      |
      v
main.py::upload_pdf()
      |
      +---> storage.py::upload_to_blob()
      |           |
      |           +---> [Azure Mode] → BlobServiceClient.upload_blob()
      |           |
      |           +---> [Local Mode] → local_storage.save_pdf()
      |
      +---> pdf.py::extract_text_from_pdf()
      |
      +---> cosmos.py::save_document()
      |           |
      |           +---> [Azure Mode] → Cosmos container.create_item()
      |           |
      |           +---> [Local Mode] → Append to local_db.json
      |
      v
Return UploadResponse(doc_id, file_name, blob_url)
```

---

## Summary

The storage layer uses a **strategy pattern** to abstract file storage behind a common interface (`upload_to_blob`). Azure Blob Storage provides scalable, durable, production-grade storage, while the local filesystem fallback enables development without cloud dependencies. Both implementations maintain API compatibility, allowing the same business logic to work in both modes. The architecture is secure (filename sanitization, type validation) but could benefit from explicit deletion endpoints and blob lifecycle management for production deployments.
