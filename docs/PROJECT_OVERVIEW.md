# Azure PDF Chat – Project Overview

This document summarizes the architecture of Azure PDF Chat, explains how the current local-only workflow operates, and describes how to connect the application to Azure resources for a production deployment.

## 1. Solution Summary

Azure PDF Chat is a document-grounded Q&A experience. Authenticated users upload PDFs, the backend extracts text, and questions are answered by Google Gemini Flash using only the stored document context. The project is designed to run locally without Azure dependencies, but the backend contains first-class adapters for Azure Blob Storage and Azure Cosmos DB.

```
Browser (React) ⇄ FastAPI backend ⇄ Storage (Blob / local FS)
                               ⇄ Chat history DB (Cosmos / JSON)
                               ⇄ Google Gemini Flash API
```

## 2. Codebase Walkthrough

| Area | Folder / File | Purpose |
| --- | --- | --- |
| Frontend | `frontend/src/` | React + Vite UI with TailwindCSS styling. Handles uploads, chat, history, and profile editing. |
| Backend entrypoint | `backend/main.py` | FastAPI routes for upload, ask, history, and document list. Detects whether Azure services are configured. |
| Azure-aware services | `backend/services/storage.py`, `backend/services/cosmos.py` | Abstract storage layer for PDFs and metadata; automatically fall back to local JSON/FS when Azure env vars are missing. |
| Local development storage | `backend/services/local_storage.py`, `backend/tmp/` | Persists files and chat history on disk when Azure resources are not present. |
| LLM integration | `backend/services/gemini.py` | Wraps Google Gemini Flash (1.5) calls with error handling. |

### Request Flow

1. **Upload** (`POST /api/upload`):
   - Frontend sends `FormData` containing the PDF and `user_id`.
   - Backend stores the file (Blob Storage in Azure mode, local disk otherwise), extracts text via PyMuPDF, and saves metadata in Cosmos/local JSON.

2. **Ask** (`POST /api/ask`):
   - Backend fetches document text, stores the user prompt, calls Gemini, stores assistant reply, and returns the answer text to the UI.

3. **History & Library** (`GET /api/history`, `GET /api/documents`):
   - Provide per-document conversations and document lists for the React drawer.

## 3. Operating Modes

The backend inspects Azure-specific environment variables at startup:

- If **any** required variable is missing, the app logs a `[LOCAL MODE]` warning and uses the JSON + filesystem adapters in `backend/services/local_storage.py`.
- When **all** variables are present, Azure Blob Storage and Azure Cosmos DB drivers are used instead.

This dual-mode design means you can prototype locally without Azure, then switch to the managed services simply by supplying credentials (no code changes necessary).

## 4. Connecting Azure Resources

### 4.1 Blob Storage (PDF files)

1. Create a Storage Account in the desired region.
2. Create a Blob container (e.g., `pdfuploads`).
3. Capture the connection string from **Access keys**.
4. Configure backend environment variables:
   ```env
   AZURE_BLOB_CONNECTION_STRING=DefaultEndpointsProtocol=...
   AZURE_BLOB_CONTAINER=pdfuploads
   ```
5. Optional: enable lifecycle management policies to expire stale uploads.

### 4.2 Cosmos DB (metadata + chat history)

1. Provision an Azure Cosmos DB account (Core (SQL) API).
2. Create a database (e.g., `pdfchat`) and a container (e.g., `items`) with `/user_id` as the partition key.
3. Obtain the **URI** and **Primary Key** from Keys blade.
4. Add environment variables:
   ```env
   COSMOS_URL=https://<account>.documents.azure.com:443/
   COSMOS_KEY=<primary-key>
   COSMOS_DB=pdfchat
   COSMOS_CONTAINER=items
   ```
5. The backend automatically writes `document` and `message` items with ISO timestamps. No indexes beyond the default are required for initial usage.

### 4.3 CORS / Origins

Set the origin that should access the API:
```env
ALLOWED_ORIGIN=https://<your-frontend-host>
```
In local development this can remain unset; the backend will accept `http://localhost:5173` and `http://localhost:3000`.

### 4.4 Authentication (optional)

The current sample uses a mock/local auth helper. For production, integrate with Azure Entra ID (via Static Web Apps authentication or Azure AD B2C). Update `frontend/src/lib/auth.ts` and backend request validation to enforce tokens.

### 4.5 Recommended Deployment Targets

| Component | Azure Service | Notes |
| --- | --- | --- |
| Frontend (`frontend/dist`) | Azure Static Web Apps or Azure Static Apps + Entra auth | Provides built-in CI/CD and auth provider integration. |
| Backend (`backend`) | Azure App Service (Linux) or Azure Container Apps | Easiest to run FastAPI with managed SSL and scaling. |
| Storage | Azure Blob Storage | Already described above. |
| Data | Azure Cosmos DB (SQL API) | Partition by `user_id` as implemented. |

## 5. Environment Configuration Summary

Backend `.env` example (Azure mode):

```env
ALLOWED_ORIGIN=https://your-frontend.azurestaticapps.net
AZURE_BLOB_CONNECTION_STRING=DefaultEndpointsProtocol=...
AZURE_BLOB_CONTAINER=pdfuploads
COSMOS_URL=https://your-cosmos.documents.azure.com:443/
COSMOS_KEY=<primary-key>
COSMOS_DB=pdfchat
COSMOS_CONTAINER=items
GEMINI_API_KEY=<gemini-api-key>
GEMINI_MODEL=gemini-1.5-flash
PORT=8000
```

Frontend `.env` example:

```env
VITE_API_BASE_URL=https://your-backend.azurewebsites.net/api
```

After setting these values, restart the backend to switch from local mode to Azure mode.

## 6. Local-to-Azure Migration Checklist

1. Run locally and collect baseline behaviour (already functioning with JSON storage).
2. Create Blob Storage + Cosmos DB and populate environment variables.
3. Run backend locally to confirm Azure connectivity (logs should report successful Cosmos connection; no `[LOCAL MODE]` warning).
4. Deploy backend to Azure App Service or Container Apps.
5. Build and deploy frontend to Azure Static Web Apps (configure `VITE_API_BASE_URL`).
6. Update DNS/custom domains as needed and verify CORS.

## 7. Operational Considerations

- **Secrets management**: Store connection strings and API keys in Azure Key Vault or App Service configuration.
- **Logging**: FastAPI uses standard logging; pipe to Azure Monitor/Application Insights for production.
- **Scaling**: App Service plan sizing + Cosmos throughput (RU/s) should match expected document ingestion and chat load. Gemini usage is billed separately by Google.
- **Data privacy**: PDFs persist in Blob storage until explicitly deleted. Implement retention policies or document deletion endpoints if required.

## 8. Next Steps

- Add authentication tied to Azure Entra ID or another identity provider.
- Implement document deletion and quota enforcement.
- Extend observability (metrics, tracing) for the FastAPI service.
- Harden front-end auth flows before exposing publicly.

With the steps above, you can move from a local prototype to an Azure-hosted deployment while reusing the existing service abstractions in this repository.
