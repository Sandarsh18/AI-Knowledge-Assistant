# Database Layer Architecture

This document explains how chat history and document metadata are stored in Azure PDF Chat, covering both Azure Cosmos DB and local JSON storage implementations.

---

## 1. Database Module: `backend/services/cosmos.py`

**Primary Purpose**: Abstraction layer for database operations with automatic fallback between Azure Cosmos DB (production) and local JSON storage (development).

**Module Structure**:
```python
# Mode detection
USE_LOCAL_MODE = not all([COSMOS_URL, COSMOS_KEY, COSMOS_DB, COSMOS_CONTAINER])

# Functions delegate based on mode
async def save_document(...):
    if USE_LOCAL_MODE:
        return await local_save_document(...)
    # Azure Cosmos DB logic
```

**Key Functions**:
| Function | Purpose | Returns |
|----------|---------|---------|
| `save_document()` | Store document metadata + extracted text | None |
| `get_document_text()` | Retrieve extracted text by doc_id | str |
| `save_message()` | Store individual chat messages | None |
| `get_history()` | Fetch chat history or document list | list[dict] |

---

## 2. Azure Cosmos DB Implementation

### Container Structure

**Database**: Configured via `COSMOS_DB` environment variable  
**Container**: Configured via `COSMOS_CONTAINER` environment variable  
**Partition Key**: **NOT EXPLICITLY DEFINED** in code (defaults to Cosmos DB container settings)

**Implication**: The code does not programmatically specify a partition key when creating items. This means:
- Partition key must be pre-configured at the Cosmos DB container level (via Azure Portal/CLI)
- Common practice: Use `user_id` as partition key for multi-tenant isolation
- All queries filtering by `user_id` benefit from partition-level scoping

### Item Schemas

#### Document Item
```json
{
  "id": "doc-uuid",
  "user_id": "user@example.com",
  "file_name": "report.pdf",
  "blob_name": "user@example.com/doc-uuid/report.pdf",
  "blob_url": "https://storageaccount.blob.core.windows.net/...",
  "document_text": "Extracted text from PyMuPDF...",
  "created_at": "2025-12-16T08:30:00Z",
  "type": "document"
}
```

**Field Details**:
- `id`: Unique document identifier (UUID v4)
- `user_id`: Partition-level isolation (email address)
- `file_name`: Original uploaded filename
- `blob_name`: Hierarchical blob storage path
- `blob_url`: Full Azure Blob Storage URL
- `document_text`: Full extracted PDF text (stored in-database, not separate blob)
- `created_at`: ISO-8601 UTC timestamp
- `type`: Discriminator field (`"document"` vs `"message"`)

#### Message Item
```json
{
  "id": "doc-uuid-user-abc123",
  "user_id": "user@example.com",
  "doc_id": "doc-uuid",
  "type": "message",
  "role": "user",
  "content": "What is the summary of this document?",
  "message": "What is the summary of this document?",
  "timestamp": "2025-12-16T08:35:00Z"
}
```

**Field Details**:
- `id`: Composite identifier (`{doc_id}-{role}-{random_hex}`)
- `user_id`: Owner of the conversation
- `doc_id`: Links message to specific document
- `type`: Discriminator (`"message"`)
- `role`: `"user"` or `"assistant"`
- `content`: Primary message text
- `message`: Duplicate of `content` (for backward compatibility)
- `timestamp`: ISO-8601 UTC timestamp

### Query Patterns

**1. Fetch Document Text**:
```python
query = "SELECT * FROM c WHERE c.id=@id AND c.user_id=@user AND c.type='document'"
params = [
    {"name": "@id", "value": doc_id},
    {"name": "@user", "value": user_id}
]
```

**2. Fetch Chat History for Document**:
```python
query = "SELECT * FROM c WHERE c.user_id=@user AND c.doc_id=@doc AND c.type='message'"
params = [
    {"name": "@user", "value": user_id},
    {"name": "@doc", "value": doc_id}
]
```

**3. List User's Documents**:
```python
query = "SELECT * FROM c WHERE c.user_id=@user AND c.type='document'"
params = [{"name": "@user", "value": user_id}]
```

**Cosmos DB Operations**:
- `container.create_item(item)`: Insert document/message
- `container.query_items(query, parameters)`: Parameterized SQL queries
- **No pagination implemented**: All results loaded into memory with `list()`
- **No explicit indexing**: Relies on Cosmos DB default indexing policy

---

## 3. Local JSON Storage Implementation

**Location**: `backend/services/local_storage.py`

### File Structure

```
backend/
├── local_db.json          # All metadata storage
└── tmp/
    └── <user_id>/         # PDF files per user
```

**Database File** (`local_db.json`):
```json
{
  "documents": [
    { "id": "...", "type": "document", ... }
  ],
  "messages": [
    { "id": "...", "type": "message", ... }
  ]
}
```

**Design Pattern**: In-memory JSON with file I/O on every operation (no caching).

### Data Persistence Functions

**`_load_db()`**:
```python
def _load_db() -> dict:
    with DB_FILE.open("r") as f:
        return json.load(f)
```

**`_save_db(db: dict)`**:
```python
def _save_db(db: dict):
    with DB_FILE.open("w") as f:
        json.dump(db, f, indent=2)
```

**Behavior**:
- Every read/write operation opens and closes the file
- No file locking mechanism (risk of race conditions in concurrent scenarios)
- Human-readable JSON format (useful for debugging)

### Item Schemas (Local Mode)

**Document Entry**:
```json
{
  "id": "84c39236-c01d-4e1b-8146-ee59c321bad4",
  "user_id": "local-user",
  "file_name": "report.pdf",
  "blob_name": "local-user/report.pdf",
  "blob_url": "file:///absolute/path/to/backend/tmp/local-user/report.pdf",
  "document_text": "Extracted text...",
  "created_at": "2025-12-16T08:30:00Z",
  "type": "document"
}
```

**Message Entry**:
```json
{
  "id": "3f9d0c12-1234-5678-abcd-ef1234567890",
  "type": "message",
  "user_id": "local-user",
  "doc_id": "84c39236-c01d-4e1b-8146-ee59c321bad4",
  "role": "user",
  "content": "What is the summary?",
  "timestamp": "2025-12-16T08:35:00Z"
}
```

**Schema Normalization**:
- `get_history()` applies timestamp normalization (`_normalize_timestamp()`)
- Ensures backward compatibility for messages with old timestamp formats (Unix epoch, ISO variants)
- Adds missing `id` fields using `uuid4()` if not present

### Query Operations (Local Mode)

**1. Save Document**:
```python
db["documents"].append({
    "id": doc_id,
    "user_id": user_id,
    # ... other fields
})
_save_db(db)
```

**2. Get Document Text**:
```python
for doc in db["documents"]:
    if doc["user_id"] == user_id and doc["id"] == doc_id:
        return doc["document_text"]
raise ValueError("Document not found.")
```

**3. Save Message**:
```python
entry = {
    "id": str(uuid4()),
    "type": "message",
    # ... other fields
}
db["messages"].append(entry)
_save_db(db)
```

**4. Get History (Messages)**:
```python
normalized = []
for entry in messages:
    if entry.get("user_id") != user_id or entry.get("doc_id") != doc_id:
        continue
    # Normalize timestamp, ensure 'id' exists
    normalized.append(sanitized_entry)

normalized.sort(key=lambda item: item["timestamp"])
return normalized
```

**5. Get History (Documents List)**:
```python
documents = []
for doc in db["documents"]:
    if doc.get("user_id") != user_id:
        continue
    documents.append({
        "id": doc["id"],
        "file_name": doc.get("file_name", ""),
        # ... other fields
    })
return documents
```

---

## 4. Schema Comparison

| Field | Azure Cosmos DB | Local JSON Storage |
|-------|-----------------|---------------------|
| **Document ID** | UUID v4 string | UUID v4 string |
| **User ID** | Email address | Arbitrary string (e.g., `"local-user"`) |
| **Partition Key** | Implicit (container-level) | N/A (single-file JSON) |
| **Blob URL** | Full Azure URL | Fake `file://` URL |
| **Document Text Storage** | In-database (Cosmos item) | In-database (JSON array) |
| **Message ID** | Composite (`{doc_id}-{role}-{hex}`) | UUID v4 string |
| **Timestamp Format** | ISO-8601 UTC string | ISO-8601 UTC string (normalized) |
| **Type Discriminator** | `"document"` or `"message"` | `"document"` or `"message"` |

**Key Difference**: Azure Cosmos DB supports horizontal scaling via partition keys, while local JSON is limited to single-file, single-process access.

---

## 5. Pagination & Indexing

### Pagination

**Implementation Status**: **NOT IMPLEMENTED**

**Current Behavior**:
- All query results loaded into memory using `list(container.query_items(...))`
- No `OFFSET/LIMIT` clauses in SQL queries
- Entire chat history for a document retrieved at once

**Impact**:
- For documents with thousands of messages, memory consumption increases
- No incremental loading in the UI (frontend receives full history array)

**Potential Improvements**:
```python
# Example pagination implementation
def get_history_paginated(user_id, doc_id, page=1, page_size=50):
    offset = (page - 1) * page_size
    query = f"""
    SELECT * FROM c 
    WHERE c.user_id=@user AND c.doc_id=@doc AND c.type='message'
    ORDER BY c.timestamp
    OFFSET {offset} ROWS FETCH NEXT {page_size} ROWS ONLY
    """
    # Note: Cosmos DB SQL does not support OFFSET/LIMIT syntax natively
    # Would require client-side pagination using continuation tokens
```

**Cosmos DB Pagination**:
- Use `max_item_count` parameter in `query_items()` for batch size
- Track `continuation_token` from response for next page
- Requires API endpoint changes to expose pagination parameters

### Indexing

**Azure Cosmos DB**:
- **Automatic Indexing**: Cosmos DB indexes all properties by default
- **Custom Index Policy**: Not configured in code (uses container defaults)
- **Recommended Indexes**:
  - `user_id` (used in all queries, should match partition key)
  - `doc_id` (frequently filtered in message queries)
  - `type` (discriminator for documents vs messages)
  - `timestamp` (for chronological sorting)

**Example Custom Index Policy** (Azure Portal/CLI):
```json
{
  "indexingMode": "consistent",
  "includedPaths": [
    { "path": "/user_id/?" },
    { "path": "/doc_id/?" },
    { "path": "/type/?" },
    { "path": "/timestamp/?" }
  ],
  "excludedPaths": [
    { "path": "/document_text/*" }
  ]
}
```

**Reason to Exclude `document_text`**:
- Large text fields (multi-page PDFs) consume index storage
- Rarely queried directly (only retrieved by `id`)
- Excluding reduces RU (Request Unit) costs

**Local JSON Storage**:
- **No Indexing**: Linear search through arrays
- **Performance**: O(n) for all queries
- **Scale Limit**: Suitable for <1000 documents/messages

---

## 6. Timestamp Handling

**Normalization Function** (`_normalize_timestamp()`):

Handles legacy data formats:
1. **None/Empty**: Returns current UTC time
2. **Unix Timestamp (int/float)**: Converts to ISO-8601
3. **ISO-8601 String**: Parses and normalizes to `YYYY-MM-DDTHH:MM:SSZ`
4. **Invalid Format**: Returns current UTC time

**Example Transformations**:
| Input | Output |
|-------|--------|
| `1702728000` | `"2023-12-16T12:00:00Z"` |
| `"2023-12-16T12:00:00+05:30"` | `"2023-12-16T06:30:00Z"` (UTC) |
| `"invalid"` | Current UTC time |
| `None` | Current UTC time |

**Purpose**: Ensures consistent timestamp format across Azure and local modes, even if old data has inconsistent formats.

---

## 7. Data Consistency & Transactions

### Azure Cosmos DB

**Transaction Support**: **NOT USED**

**Current Behavior**:
- `save_document()` and `save_message()` are independent operations
- No atomic transaction wrapping both calls
- Potential race condition: Document saved, message save fails → orphaned document

**Example Scenario**:
```python
# In main.py::upload_pdf()
await save_document(...)  # Succeeds
await save_message(...)   # Fails (network error)
# Result: Document exists, but initial "uploaded" message missing
```

**Cosmos DB Transaction Options** (not implemented):
- **Stored Procedures**: Atomic multi-item operations
- **Transactional Batch**: Group up to 100 operations in single partition

### Local JSON Storage

**Concurrency Control**: **NONE**

**Risk**: Multiple processes/threads writing simultaneously can corrupt `local_db.json`

**Example Race Condition**:
```
Process A: _load_db() → reads {"documents": [A]}
Process B: _load_db() → reads {"documents": [A]}
Process A: appends document B → _save_db({"documents": [A, B]})
Process B: appends document C → _save_db({"documents": [A, C]})
Result: Document B is lost (overwritten by Process B)
```

**Mitigation** (not implemented):
- File locking (`fcntl.flock()` on Linux)
- SQLite database instead of raw JSON
- Single-threaded FastAPI (development only)

---

## 8. Configuration Reference

### Azure Cosmos DB Environment Variables

```env
COSMOS_URL=https://accountname.documents.azure.com:443/
COSMOS_KEY=PrimaryOrSecondaryKey==
COSMOS_DB=pdfdatabase
COSMOS_CONTAINER=chatdata
```

**Location**: Azure Portal → Cosmos DB Account → Keys

**Permissions Required**:
- Read/Write access to the specified container
- Query permission for SQL API

### Local JSON Storage (No Configuration)

**Automatic Initialization**:
```python
if not DB_FILE.exists():
    DB_FILE.write_text(json.dumps({"documents": [], "messages": []}, indent=2))
```

**File Locations**:
- Database: `backend/local_db.json`
- PDFs: `backend/tmp/<user_id>/`

---

## 9. Error Handling

### Azure Cosmos DB Errors

**Common Exceptions**:
1. **CosmosHttpResponseError (404)**: Document not found
2. **CosmosHttpResponseError (429)**: Throttling (RU limit exceeded)
3. **ServiceRequestError**: Network issues

**Current Handling**:
```python
try:
    container.create_item(item)
except Exception as exc:
    logger.exception("Failed to save document in Cosmos DB.")
    raise  # Propagates to FastAPI error handler (returns 500)
```

**Improvement Suggestions**:
- Implement exponential backoff for 429 errors
- Return specific HTTP status codes (404 for missing documents)
- Add retry logic for transient network failures

### Local JSON Errors

**Common Issues**:
1. **Disk Full**: `write_text()` fails
2. **Permission Denied**: User lacks write access to `backend/tmp/`
3. **JSON Corruption**: Manual file edits break structure

**Current Handling**:
```python
# No explicit try/except around file I/O
# Relies on FastAPI default exception handler
```

**Risk**: Corrupted JSON results in server crash (entire API down)

---

## 10. Performance Characteristics

### Azure Cosmos DB

**Request Units (RU) Cost**:
| Operation | Estimated RU | Notes |
|-----------|--------------|-------|
| `create_item()` (document) | 10-50 RU | Depends on document_text size |
| `create_item()` (message) | 5-10 RU | Small item size |
| `query_items()` (filtered) | 5-20 RU | Per query execution |
| `query_items()` (full scan) | 50+ RU | If no partition key specified |

**Optimization**:
- Always include `user_id` in queries to leverage partition key
- Avoid storing massive text in `document_text` (consider separate blob storage)
- Use Cosmos DB metrics to monitor RU consumption

### Local JSON Storage

**Performance Profile**:
| Operation | Complexity | Notes |
|-----------|------------|-------|
| `save_document()` | O(1) + O(n) write | Appends to array, writes entire JSON |
| `save_message()` | O(1) + O(n) write | Same as above |
| `get_history()` | O(n) + O(m log m) | Linear scan + sorting |
| `get_document_text()` | O(n) | Linear search through documents |

**Scale Limits**:
- **100 documents**: ~10ms query time
- **1,000 documents**: ~100ms query time
- **10,000+ documents**: Performance degrades significantly

---

## 11. Migration Considerations

### From Local to Cosmos DB

**Data Export**:
```python
import json
from azure.cosmos import CosmosClient

# Load local data
with open("backend/local_db.json") as f:
    data = json.load(f)

# Initialize Cosmos client
client = CosmosClient(COSMOS_URL, COSMOS_KEY)
container = client.get_database_client(COSMOS_DB).get_container_client(COSMOS_CONTAINER)

# Migrate documents
for doc in data["documents"]:
    container.create_item(doc)

# Migrate messages
for msg in data["messages"]:
    container.create_item(msg)
```

**Challenges**:
- Blob URLs in local mode are `file://` (invalid in Azure)
- Need to re-upload PDFs to Azure Blob Storage
- Update `blob_url` and `blob_name` in migrated documents

### From Cosmos DB to Local

**Data Download**:
```python
# Export all items
documents = list(container.query_items("SELECT * FROM c WHERE c.type='document'", enable_cross_partition_query=True))
messages = list(container.query_items("SELECT * FROM c WHERE c.type='message'", enable_cross_partition_query=True))

# Save to JSON
with open("exported_db.json", "w") as f:
    json.dump({"documents": documents, "messages": messages}, f, indent=2)
```

**Limitation**: Cannot download blob files from Azure (would require separate script using `BlobServiceClient`)

---

## Summary

The database layer uses a **dual-mode architecture** with automatic detection:
- **Azure Cosmos DB**: Production-grade NoSQL with partition-level isolation, parameterized queries, and scalability
- **Local JSON Storage**: Development fallback with human-readable format and no external dependencies

**Key Architectural Decisions**:
1. **No Pagination**: All data loaded into memory (suitable for small-to-medium datasets)
2. **No Custom Indexing**: Relies on Cosmos DB defaults
3. **No Transactions**: Independent save operations (potential for orphaned data)
4. **Schema Consistency**: `type` discriminator enables document/message coexistence in single container
5. **Timestamp Normalization**: Ensures backward compatibility with legacy data formats

**Recommended Improvements**:
- Implement pagination for chat history (using continuation tokens)
- Add transactional batch operations for document + message saves
- Configure custom Cosmos DB index policy to exclude `document_text`
- Implement file locking or migrate to SQLite for local mode
- Add retry logic for Cosmos DB throttling (429 errors)
