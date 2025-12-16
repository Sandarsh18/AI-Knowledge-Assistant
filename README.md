# Azure PDF Chat

Azure PDF Chat is a full-stack web application that lets authenticated users upload PDF documents, ask natural-language questions, and receive grounded answers sourced directly from the document. The experience combines a responsive React/Vite frontend, a FastAPI backend, and optional Azure resources for production-grade storage and persistence.

## Table of Contents

- [Features](#features)
- [Technologies](#technologies)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Setup Instructions](#setup-instructions)
- [Deployment Instructions](#deployment-instructions)
- [API Endpoints](#api-endpoints)
- [Environment Variables](#environment-variables)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Architecture

| Layer | Responsibility | Key Technologies |
| --- | --- | --- |
| Frontend | Upload PDFs, manage chat sessions, and render AI responses with a multi-theme UI. | React 18, Vite, TypeScript, TailwindCSS |
| Backend API | Ingest documents, extract text, persist chat history, and proxy requests to Gemini. | FastAPI, Python 3.11, PyMuPDF |
| Storage & Data | Store raw PDF blobs and structured chat history. | Azure Blob Storage, Azure Cosmos DB (with JSON/FS fallback for local dev) |
| Intelligence | Generate grounded responses using document context. | Google Gemini Flash (1.5) |

The backend can operate in **Azure mode** (Blob + Cosmos) or **local mode**, where it falls back to JSON files in `backend/tmp/` when Azure credentials are not provided. This makes it easy to prototype locally before wiring up cloud resources.

### Operating Modes

#### Local Mode (Default)

When Azure environment variables are not configured, the application automatically runs in local mode:

- **Storage**: PDFs are saved to `backend/tmp/<user_id>/` directory
- **Database**: Metadata and chat history stored in `backend/tmp/local_db.json`
- **CORS**: Accepts requests from `localhost:5173` and `localhost:3000`
- **Best for**: Development, testing, and demos without Azure dependencies

#### Azure Mode (Production)

When all required Azure environment variables are set:

- **Storage**: PDFs uploaded to Azure Blob Storage with public/private access control
- **Database**: Cosmos DB with partition key `/user_id` for efficient querying
- **CORS**: Restricted to configured `ALLOWED_ORIGIN`
- **Benefits**: Scalability, managed backups, geo-replication, and enterprise-grade security

The mode is detected automatically at startup. Check backend logs for `[LOCAL MODE]` warning or successful Cosmos DB connection messages.

## Project Structure

```
pdfbot/
├── frontend/        # React/Vite client with TailwindCSS styling
│   └── src/
│       ├── components/  # Chat, uploader, history drawer, auth views, etc.
│       ├── lib/         # API + auth utilities
│       └── styles/      # Tailwind entrypoint and custom layers
├── backend/
│   ├── main.py          # FastAPI app entry
│   ├── services/        # PDF parsing, storage adapters, Gemini client
│   └── tmp/             # Local dev storage (JSON + uploaded files)
├── README.md
└── ...
```

## Features

- **User authentication**: Ready for Azure Static Web Apps (SWA) and Entra ID integration (currently using local mock auth for development).
- **PDF file uploads**: Support for documents up to 25 MB with drag-and-drop interface.
- **Intelligent text extraction**: PyMuPDF extracts content while preserving document structure.
- **Persistent chat history**: Conversations are stored per-document in Azure Cosmos DB or local JSON.
- **Grounded AI responses**: Google Gemini Flash generates answers strictly from uploaded document context.
- **Modern, themeable UI**: React + TailwindCSS with light mode and cyberpunk dark mode.
- **Dual-mode operation**: Seamlessly switch between local development (JSON/filesystem) and Azure production mode.
- **Document library**: Browse, select, and resume conversations with previously uploaded PDFs.
- **Real-time chat interface**: Animated message bubbles, typing indicators, and error handling.

### UI/UX Highlights

- **Responsive design**: Optimized for desktop and mobile devices with adaptive layouts.
- **Theme switcher**: Toggle between light and cyberpunk themes with smooth transitions.
- **Interactive uploader**: Drag-and-drop zone with visual feedback and file validation.
- **Document management**: Side drawer displays upload history with timestamps and quick access.
- **Profile customization**: Edit display name and view session statistics.
- **Empty states**: Helpful prompts guide users when no document is selected.
- **Error handling**: User-friendly messages for upload failures, API errors, and quota limits.

## Technologies

- **Frontend**: React, Vite, TypeScript, TailwindCSS
- **Backend**: FastAPI, Python 3.11
- **Storage**: Azure Blob Storage, Azure Cosmos DB
- **LLM Integration**: Google Gemini Flash

## Setup Instructions

### Prerequisites

- Node.js and npm installed for the frontend.
- Python 3.11 and pip installed for the backend.
- Azure account with access to Azure Static Web Apps, Blob Storage, and Cosmos DB.

### Frontend Setup

1. Navigate to the `frontend` directory:
   ```
   cd frontend
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file based on the `.env.example` template and configure the `VITE_API_BASE_URL` to point at your backend (`http://localhost:8000` during local development).

4. Start the development server:
   ```
   npm run dev
   ```

### Backend Setup

1. Navigate to the `backend` directory:
   ```
   cd backend
   ```

2. Create a `.env` file based on the `.env.example` template and configure the necessary environment variables. You can comment Azure-specific settings to run in local JSON mode while prototyping.

3. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

4. Start the FastAPI server:
   ```
   uvicorn backend.main:app --host 0.0.0.0 --port 8000
   ```

### Local Development Workflow

Run the backend and frontend in separate terminals:

```bash
# Terminal 1 – backend
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2 – frontend
cd frontend
npm run dev
```

The frontend defaults to `http://localhost:5173` and proxies API calls to the address configured in `VITE_API_BASE_URL`.

## Deployment Instructions

1. Build the frontend application:
   ```
   npm run build
   ```

2. Deploy the `dist/` folder to Azure Static Web Apps.

3. Configure environment variables for the backend in the Azure Portal or using the Azure CLI.

## API Endpoints

- **GET** `/api/health`: Check the health of the API.
- **POST** `/api/upload`: Upload a PDF file and extract text.
- **POST** `/api/ask`: Ask a question about the uploaded PDF.
- **GET** `/api/history`: Retrieve chat history for a user.
- **GET** `/api/documents`: Fetch the document library for the authenticated user.

## Environment Variables

### Backend (.env.example)

```
ALLOWED_ORIGIN=https://<your-swa>.azurestaticapps.net
AZURE_BLOB_CONNECTION_STRING=DefaultEndpointsProtocol=...
AZURE_BLOB_CONTAINER=pdfuploads
COSMOS_URL=https://<cosmos-account>.documents.azure.com:443/
COSMOS_KEY=<cosmos-key>
COSMOS_DB=pdfchat
COSMOS_CONTAINER=items
GEMINI_API_KEY=<gemini-api-key>
GEMINI_MODEL=gemini-1.5-flash
PORT=8000
```

### Frontend (.env.example)

```
VITE_API_BASE_URL=https://<your-app-service>.azurewebsites.net/api
```

## Testing

- **Frontend**: run `npm run build` to ensure TypeScript and Vite compile successfully. (Add unit tests with your preferred framework when expanding the UI.)
- **Backend**: execute `pytest backend` (tests can use the JSON storage fallback) and `uvicorn backend.main:app --reload` for manual verification.

## Troubleshooting

- **Uploads fail locally**: Ensure the backend is running and `VITE_API_BASE_URL` targets it. In local mode the backend writes to `backend/tmp/uploads/`; verify the process has write permission.
- **Missing Azure credentials**: The backend logs warnings and uses local JSON storage if blob/Cosmos settings are absent. Provide Azure connection strings when moving to production.
- **CORS issues**: Update `ALLOWED_ORIGIN` in the backend `.env` to include your frontend origin during development.
- **Gemini errors**: Confirm the `GEMINI_API_KEY` is valid and the quota is sufficient. Check backend logs for the exact error response.

## Security Considerations

### Authentication & Authorization

- **Current state**: Uses a simplified local authentication for development (stores user info in browser localStorage).
- **Production recommendation**: Integrate with Azure Entra ID (formerly Azure AD) or Azure AD B2C.
- **Implementation path**: Update `frontend/src/lib/auth.ts` to use Azure Static Web Apps authentication or OAuth 2.0 flows.

### Data Protection

- **In transit**: Always use HTTPS in production. Azure Static Web Apps and App Service provide SSL certificates automatically.
- **At rest**: Azure Blob Storage and Cosmos DB support encryption by default.
- **Access control**: Use Managed Identities and Azure RBAC to avoid storing connection strings in code.

### API Security

- **CORS**: Strictly configure `ALLOWED_ORIGIN` to prevent unauthorized cross-origin requests.
- **Rate limiting**: Consider implementing rate limits on upload and ask endpoints to prevent abuse.
- **Input validation**: Backend validates file types (PDF only) and file sizes (25 MB max).
- **Secrets management**: Store API keys and connection strings in Azure Key Vault or App Service Configuration.

### Content Safety

- **Document scanning**: Consider integrating Azure Content Safety or similar services to scan uploaded PDFs for malicious content.
- **Response filtering**: Google Gemini API includes built-in safety filters; monitor for inappropriate outputs.
- **User isolation**: Each user's documents and chat history are isolated by `user_id` partition.

## Performance & Optimization

### Frontend

- **Code splitting**: Vite automatically splits components for optimal loading.
- **Asset optimization**: Images and SVGs are embedded; consider CDN for production.
- **Lazy loading**: Chat messages render efficiently with virtualization for long conversations.

### Backend

- **Async processing**: All I/O operations (file uploads, DB queries, Gemini calls) use async/await.
- **Caching**: Consider Redis for frequently accessed document text to reduce Cosmos DB reads.
- **Connection pooling**: Azure SDK manages Cosmos DB and Blob Storage connections efficiently.

### Azure Configuration

- **App Service**: Use Standard or Premium tier for auto-scaling and staging slots.
- **Cosmos DB**: Start with provisioned throughput (400 RU/s) and scale based on usage.
- **Blob Storage**: Use Hot tier for active documents; implement lifecycle policies to move old files to Cool/Archive tiers.
- **CDN**: Enable Azure CDN for Static Web Apps to reduce latency globally.

## Roadmap

### Planned Features

- [ ] Multi-document chat (query across multiple PDFs simultaneously)
- [ ] Document versioning and update tracking
- [ ] Export conversations to PDF or Markdown
- [ ] Advanced search within document library
- [ ] Shared document collections for team collaboration
- [ ] Support for additional file formats (DOCX, TXT, etc.)
- [ ] Voice input for questions (Web Speech API)
- [ ] Citation extraction with page/paragraph references
- [ ] Admin dashboard for usage analytics
- [ ] Mobile app (React Native or PWA)

### Integration Opportunities

- Azure AI Document Intelligence for enhanced PDF parsing
- Azure OpenAI Service as alternative to Gemini
- Application Insights for monitoring and diagnostics
- Azure Functions for background processing (e.g., document summarization)
- Microsoft Graph API for OneDrive/SharePoint integration

## FAQ

### Q: Can I use this without Azure?

**A:** Yes! The application runs entirely in local mode without any Azure services. You only need a Google Gemini API key.

### Q: What's the maximum PDF size?

**A:** The frontend enforces a 25 MB limit, but this can be adjusted in `frontend/src/components/UploadCard.tsx` and backend settings.

### Q: How do I switch from local to Azure mode?

**A:** Simply add the required Azure environment variables to your `.env` file and restart the backend. The code automatically detects the mode.

### Q: Is Azure Cosmos DB required?

**A:** No, the local JSON storage works fine for development and small-scale usage. Cosmos DB is recommended for production scalability.

### Q: Can I use Azure OpenAI instead of Google Gemini?

**A:** Yes, you'll need to modify `backend/services/gemini.py` to call the Azure OpenAI endpoint instead. The rest of the architecture remains the same.

### Q: How do I deploy to Azure?

**A:** Follow the [Deployment Instructions](#deployment-instructions) section. For detailed steps, see `docs/PROJECT_OVERVIEW.md`.

### Q: What about document privacy?

**A:** Documents are isolated by user ID. In Azure mode, use private Blob containers and Cosmos DB with proper RBAC. Never share connection strings publicly.

### Q: How much does Azure hosting cost?

**A:** Costs vary by region and usage. Typical monthly estimate:
- Static Web Apps: Free tier available
- App Service (Basic B1): ~$13/month
- Blob Storage: ~$0.02/GB + transaction costs
- Cosmos DB (400 RU/s): ~$24/month
- Total: ~$40-50/month for low-moderate usage

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any enhancements or bug fixes.

## License

This project is licensed under the MIT License. See the LICENSE file for more details.