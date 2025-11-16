<!-- Purpose: High-level overview, setup, and deployment instructions for Azure PDF Chat. -->

# Azure PDF Chat

A production-ready PDF question answering experience powered by Azure services and Google Gemini Flash.

## Features

- Azure Static Web Apps authentication (Azure AD) with automatic login/logout.
- React + Vite + Tailwind CSS frontend featuring a responsive, glassmorphism UI and dark/light themes.
- FastAPI backend handling PDF uploads, text extraction, and Gemini-powered responses.
- Azure Blob Storage for storing source PDFs.
- Azure Cosmos DB for storing extracted text and chat history.
- Google Gemini Flash (1.5) grounding strictly on uploaded PDF content.

## Prerequisites

- Node.js 18+
- Python 3.10
- Azure subscription with Blob Storage and Cosmos DB (SQL API)
- Google Gemini API key

## Environment Variables

Populate the `.env` files in both `backend/` and `frontend/` directories using the provided `.env.example` templates.

## Local Development

```bash
# Backend
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend
cd ../frontend
npm install
npm run dev
```

Frontend runs on http://localhost:5173 and backend on http://localhost:8000.

## Azure Deployment

1. **Backend (Azure App Service)**
   - Create a Linux Python 3.10 App Service.
   - Upload the backend folder or configure CI/CD.
   - Set App Settings for all environment variables from `backend/.env.example`.
   - Configure startup command: `bash startup.sh`.

2. **Frontend (Azure Static Web Apps)**
   - Deploy the `frontend/` folder with build command `npm run build` and output `dist/`.
   - Ensure the SWA’s backend proxy points to the App Service base URL.
   - Update `VITE_API_BASE_URL` to your App Service URL.

## Usage

1. Sign in through the Azure Static Web Apps-hosted frontend.
2. Upload a PDF document (≤ 25 MB).
3. Ask questions; Gemini Flash responds using only the uploaded document text.
4. Review chat history per document within the History drawer.

Enjoy secure, document-grounded insights with Azure PDF Chat!