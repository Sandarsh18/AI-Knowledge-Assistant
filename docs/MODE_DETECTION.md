# Azure PDF Chat – Mode Detection & Dual-Storage Architecture

This document explains how the FastAPI backend automatically detects and switches between **LOCAL MODE** (development) and **AZURE MODE** (production) without code changes.

---

## 1. Mode Detection Mechanism

### Entry Point: `backend/main.py`

The application checks for required Azure environment variables at startup:

```python
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
```

**Logic**: If **ANY** required variable is missing, the app runs in LOCAL MODE.

### Mode Announcement

```python
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
```

**Output**: The backend logs a warning showing which variables are missing, or confirms Azure mode if all are present.

---

## 2. Environment Variables Checked

| Variable | Purpose | Required For |
|----------|---------|--------------|
| `AZURE_BLOB_CONNECTION_STRING` | Connection string for Azure Blob Storage | Storing PDF files |
| `AZURE_BLOB_CONTAINER` | Blob container name (e.g., "pdfuploads") | Blob Storage |
| `COSMOS_URL` | Cosmos DB endpoint URL | Database operations |
| `COSMOS_KEY` | Cosmos DB primary/secondary key | Database authentication |
| `COSMOS_DB` | Database name (e.g., "pdfchat") | Database selection |
| `COSMOS_CONTAINER` | Container name (e.g., "items") | Collection selection |
| `ALLOWED_ORIGIN` | Frontend origin for CORS | Security/CORS in Azure mode |

**Note**: All 7 variables must be present to enable Azure mode. Missing even one triggers local fallback.

---

## 3. Internal Behavior When Azure Variables Are Missing

### Storage Layer (`backend/services/storage.py`)

```python
USE_LOCAL_MODE = any(not os.getenv(name) for name in REQUIRED_AZURE_ENV_VARS)

if USE_LOCAL_MODE:
    from . import local_storage
else:
    from azure.storage.blob import BlobServiceClient, ContentSettings
    # ... initialize Azure clients
```

**Behavior**:
- **LOCAL MODE**: Imports `local_storage` module; no Azure SDK imports occur
- **AZURE MODE**: Imports Azure Blob SDK and initializes `BlobServiceClient`

### Database Layer (`backend/services/cosmos.py`)

```python
COSMOS_URL = os.getenv("COSMOS_URL")
COSMOS_KEY = os.getenv("COSMOS_KEY")
COSMOS_DB = os.getenv("COSMOS_DB")
COSMOS_CONTAINER = os.getenv("COSMOS_CONTAINER")

USE_LOCAL_MODE = not all([COSMOS_URL, COSMOS_KEY, COSMOS_DB, COSMOS_CONTAINER])

if not USE_LOCAL_MODE:
    try:
        client = CosmosClient(COSMOS_URL, credential=COSMOS_KEY)
        database = client.get_database_client(COSMOS_DB)
        container = database.get_container_client(COSMOS_CONTAINER)
        logger.info("Cosmos DB connected successfully.")
    except Exception as exc:
        logger.error("Failed to initialize Cosmos DB. Switching to local mode.")
        USE_LOCAL_MODE = True
```

**Behavior**:
- **LOCAL MODE**: Skips Cosmos client initialization; all operations delegate to `local_storage`
- **AZURE MODE**: Attempts Cosmos connection; if connection fails, automatically falls back to local mode

### Runtime Delegation

Every database/storage operation checks the mode flag:

```python
async def save_document(doc_id, user_id, file_name, blob_name, blob_url, document_text):
    if USE_LOCAL_MODE:
        return await local_save_document(...)  # Local JSON
    
    # Cosmos DB code here
    item = {"id": doc_id, "user_id": user_id, ...}
    container.create_item(item)
```

**Pattern**: All functions (`save_document`, `get_document_text`, `save_message`, `get_history`) follow the same conditional branching.

---

## 4. Storage & Database Implementations

### LOCAL MODE

**File**: `backend/services/local_storage.py`

| Operation | Implementation |
|-----------|----------------|
| **PDF Storage** | Files saved to `backend/tmp/<user_id>/<filename>` |
| **Metadata** | JSON object in `backend/tmp/local_db.json` |
| **Chat History** | Same JSON file under `messages` array |
| **Document Text** | Stored in JSON under `document_text` field |

**Structure**:
```json
{
  "documents": [
    {
      "id": "doc-uuid",
      "user_id": "user123",
      "file_name": "report.pdf",
      "blob_url": "file:///path/to/report.pdf",
      "document_text": "Extracted text...",
      "created_at": "2025-12-16T10:30:00Z"
    }
  ],
  "messages": [
    {
      "id": "msg-uuid",
      "user_id": "user123",
      "doc_id": "doc-uuid",
      "role": "user",
      "content": "What is this about?",
      "timestamp": "2025-12-16T10:31:00Z"
    }
  ]
}
```

**Functions**:
- `save_pdf()` → writes bytes to disk, returns fake blob URL
- `save_document()` → appends to `documents` array
- `get_document_text()` → searches JSON for matching doc ID
- `save_message()` → appends to `messages` array
- `get_history()` → filters messages by user/doc ID

### AZURE MODE

**Files**: `backend/services/storage.py`, `backend/services/cosmos.py`

| Operation | Implementation |
|-----------|----------------|
| **PDF Storage** | Azure Blob Storage with path `{user_id}/{doc_id}/{filename}` |
| **Metadata** | Cosmos DB items with `type="document"` |
| **Chat History** | Cosmos DB items with `type="message"` |
| **Document Text** | Stored in Cosmos document item under `document_text` field |

**Cosmos DB Schema**:

Document item:
```json
{
  "id": "doc-uuid",
  "user_id": "user123",
  "type": "document",
  "file_name": "report.pdf",
  "blob_name": "user123/doc-uuid/report.pdf",
  "blob_url": "https://storage.blob.core.windows.net/...",
  "document_text": "Extracted text...",
  "created_at": "2025-12-16T10:30:00Z"
}
```

Message item:
```json
{
  "id": "msg-uuid",
  "user_id": "user123",
  "doc_id": "doc-uuid",
  "type": "message",
  "role": "assistant",
  "content": "This document discusses...",
  "timestamp": "2025-12-16T10:31:00Z"
}
```

**Functions**:
- `upload_to_blob()` → uses `BlobServiceClient` to upload with overwrite
- `save_document()` → creates Cosmos item with `type="document"`
- `get_document_text()` → queries Cosmos: `WHERE c.id=@id AND c.type='document'`
- `save_message()` → creates Cosmos item with `type="message"`
- `get_history()` → queries Cosmos with user/doc filters

---

## 5. Implementation Map

### File Structure

```
backend/
├── main.py                    # Mode detection entry point
├── services/
│   ├── storage.py            # Blob storage abstraction
│   ├── cosmos.py             # Cosmos DB abstraction
│   ├── local_storage.py      # Local JSON/FS implementation
│   ├── gemini.py             # LLM integration (mode-independent)
│   └── pdf.py                # PDF text extraction (mode-independent)
└── tmp/                      # LOCAL MODE storage directory
    ├── local_db.json         # Metadata + chat history
    └── <user_id>/            # Per-user PDF folders
```

### Key Functions & Responsibilities

| Function | File | Purpose | Mode Switching Logic |
|----------|------|---------|---------------------|
| `upload_to_blob()` | `storage.py` | Save PDF file | Checks `USE_LOCAL_MODE` → delegates to `local_storage.save_pdf()` or Azure Blob |
| `save_document()` | `cosmos.py` | Store document metadata | Checks `USE_LOCAL_MODE` → delegates to `local_save_document()` or Cosmos |
| `get_document_text()` | `cosmos.py` | Retrieve extracted text | Checks `USE_LOCAL_MODE` → reads JSON or queries Cosmos |
| `save_message()` | `cosmos.py` | Store chat message | Checks `USE_LOCAL_MODE` → writes to JSON or Cosmos |
| `get_history()` | `cosmos.py` | Fetch conversation | Checks `USE_LOCAL_MODE` → filters JSON array or queries Cosmos |
| `_get_container_client()` | `storage.py` | Lazy-load Blob client | Only called in Azure mode; creates container if missing |
| `_get_container()` | `cosmos.py` | Get Cosmos container | Raises error if called in local mode |

### Mode Detection Variables

| Variable | File | Scope | Logic |
|----------|------|-------|-------|
| `RUN_LOCAL` | `main.py` | Application-level | `True` if any Azure env var is missing |
| `USE_LOCAL_MODE` | `storage.py` | Storage layer | Same as `RUN_LOCAL` |
| `USE_LOCAL_MODE` | `cosmos.py` | Database layer | `False` only if all 4 Cosmos vars present |

**Note**: `cosmos.py` has additional fallback logic—if Cosmos connection fails despite variables being set, it flips `USE_LOCAL_MODE = True` at runtime.

---

## 6. Decision Flow Diagram

```
Application Startup
       |
       v
Check REQUIRED_AZURE_ENV_VARS
       |
       +---> ANY missing? ──> RUN_LOCAL = True
       |                           |
       |                           v
       |                      Import local_storage
       |                           |
       |                           v
       |                   Log: [LOCAL MODE] warning
       |                           |
       |                           v
       |                Set CORS: localhost origins
       |
       +---> ALL present? ──> RUN_LOCAL = False
                                   |
                                   v
                           Import Azure SDKs
                                   |
                                   v
                           Initialize Cosmos client
                                   |
                                   +---> Success? ──> USE_LOCAL_MODE = False
                                   |                        |
                                   |                        v
                                   |                   Azure mode active
                                   |
                                   +---> Failed? ──> USE_LOCAL_MODE = True
                                                           |
                                                           v
                                                   Fallback to local mode
```

---

## 7. Switching Modes at Runtime

**To enable Azure mode**:
1. Stop the backend process
2. Add all 7 environment variables to `.env`
3. Restart backend with `uvicorn backend.main:app --reload`
4. Check logs for `Cosmos DB connected successfully.` (no warnings)

**To return to local mode**:
1. Remove or comment out Azure variables in `.env`
2. Restart backend
3. Check logs for `[LOCAL MODE] Azure resources missing: ...`

**Migration path**:
- Local data in `backend/tmp/` is **not** automatically migrated to Azure
- You can implement a one-time migration script to:
  1. Read `local_db.json`
  2. Upload PDFs from `tmp/<user_id>/` to Blob Storage
  3. Insert documents/messages into Cosmos DB

---

## 8. Key Takeaways

1. **Zero-code switching**: Mode detection is automatic based on environment variables
2. **Fail-safe design**: Missing Azure credentials never cause crashes—app falls back gracefully
3. **Consistent API**: Functions like `save_document()` work identically in both modes from caller perspective
4. **Lazy initialization**: Azure clients are only created when needed (Blob on first upload, Cosmos at startup)
5. **Development-friendly**: Developers can prototype without Azure subscriptions or credentials
6. **Production-ready**: Same codebase scales to Azure with managed services when configured

This architecture allows the application to serve both local development workflows and production Azure deployments without branching logic in business code.
