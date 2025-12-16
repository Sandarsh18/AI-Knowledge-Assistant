# Azure Deployment Guide

Complete guide for deploying Azure PDF Chat to Azure using Azure Portal and GitHub integration.

---

## Overview

This project consists of two components:
- **Backend**: FastAPI (Python 3.11) → Deploy to **Azure App Service**
- **Frontend**: React + Vite (TypeScript) → Deploy to **Azure Static Web Apps**

**Architecture**:
```
[Azure Static Web Apps]  →  [Azure App Service]  →  [Azure Cosmos DB]
      (Frontend)                  (FastAPI)           [Azure Blob Storage]
                                                       [Google Gemini API]
```

---

## Prerequisites

Before you begin:
- ✅ Azure subscription with Owner or Contributor role
- ✅ GitHub account with repository access
- ✅ Google Gemini API key ([Get one here](https://makersuite.google.com/app/apikey))
- ✅ Project pushed to GitHub repository
- ✅ Azure CLI installed (optional, for verification)

---

## Part 1: Azure Resources Setup

### Step 1.1: Create Resource Group

1. Navigate to [Azure Portal](https://portal.azure.com)
2. Search for **"Resource groups"** in the top search bar
3. Click **"+ Create"**
4. Fill in:
   - **Subscription**: Select your subscription
   - **Resource group**: `pdfchat-rg`
   - **Region**: `East US` (or closest to your users)
5. Click **"Review + create"** → **"Create"**

---

### Step 1.2: Create Azure Blob Storage

1. Search for **"Storage accounts"** in Azure Portal
2. Click **"+ Create"**
3. **Basics tab**:
   - **Resource group**: `pdfchat-rg`
   - **Storage account name**: `pdfchatstorage` (must be globally unique, lowercase, no hyphens)
   - **Region**: Same as resource group
   - **Performance**: Standard
   - **Redundancy**: Locally-redundant storage (LRS)
4. **Advanced tab**:
   - Enable **"Require secure transfer for REST API operations"**
   - **Blob public access**: Disabled
5. Click **"Review + create"** → **"Create"**
6. After deployment, go to the storage account
7. Navigate to **"Containers"** (left sidebar)
8. Click **"+ Container"**
   - **Name**: `pdf-uploads`
   - **Public access level**: Private
   - Click **"Create"**
9. Navigate to **"Access keys"** (left sidebar under "Security + networking")
10. Copy **"Connection string"** for `key1` → Save for later as `AZURE_BLOB_CONNECTION_STRING`

---

### Step 1.3: Create Azure Cosmos DB

1. Search for **"Azure Cosmos DB"** in Azure Portal
2. Click **"+ Create"**
3. Select **"Azure Cosmos DB for NoSQL"** → **"Create"**
4. **Basics tab**:
   - **Resource group**: `pdfchat-rg`
   - **Account name**: `pdfchat-cosmos` (must be globally unique)
   - **Location**: Same as resource group
   - **Capacity mode**: Serverless (cost-effective for low/variable traffic)
5. **Global Distribution tab**:
   - Leave **"Geo-Redundancy"** disabled (for cost savings)
6. **Networking tab**:
   - **Connectivity method**: Public endpoint (all networks)
   - ⚠️ Later restrict to App Service IP in production
7. Click **"Review + create"** → **"Create"** (takes ~5 minutes)
8. After deployment, go to Cosmos DB account
9. Navigate to **"Keys"** (left sidebar under "Settings")
10. Copy:
    - **URI** → Save as `COSMOS_URL`
    - **PRIMARY KEY** → Save as `COSMOS_KEY`
11. Navigate to **"Data Explorer"** (left sidebar)
12. Click **"New Container"**:
    - **Database id**: `pdf_chat_db` (Create new)
    - **Container id**: `conversations`
    - **Partition key**: `/user_id`
    - Click **"OK"**

---

### Step 1.4: Create Azure Key Vault (Recommended)

1. Search for **"Key vaults"** in Azure Portal
2. Click **"+ Create"**
3. **Basics tab**:
   - **Resource group**: `pdfchat-rg`
   - **Key vault name**: `pdfchat-vault` (must be globally unique)
   - **Region**: Same as resource group
   - **Pricing tier**: Standard
4. **Access configuration tab**:
   - **Permission model**: Vault access policy
5. Click **"Review + create"** → **"Create"**
6. After deployment, navigate to **"Secrets"** (left sidebar)
7. Click **"+ Generate/Import"** and add these secrets:
   
   | Secret Name | Value (from previous steps) |
   |-------------|----------------------------|
   | `gemini-api-key` | Your Google Gemini API key |
   | `cosmos-key` | Cosmos DB PRIMARY KEY |
   | `azure-blob-connection-string` | Blob Storage connection string |

8. Click **"Create"** for each secret

---

## Part 2: Backend Deployment (Azure App Service)

### Step 2.1: Create App Service Plan

1. Search for **"App Service plans"** in Azure Portal
2. Click **"+ Create"**
3. **Basics tab**:
   - **Resource group**: `pdfchat-rg`
   - **Name**: `pdfchat-plan`
   - **Operating System**: Linux
   - **Region**: Same as resource group
   - **Pricing plan**: 
     - **Development**: B1 (Basic) - ~$13/month
     - **Production**: P1V2 (Premium) - ~$73/month
4. Click **"Review + create"** → **"Create"**

---

### Step 2.2: Create App Service (FastAPI Backend)

1. Search for **"App Services"** in Azure Portal
2. Click **"+ Create"** → **"Web App"**
3. **Basics tab**:
   - **Resource group**: `pdfchat-rg`
   - **Name**: `pdfchat-api` (must be globally unique, becomes `pdfchat-api.azurewebsites.net`)
   - **Publish**: Code
   - **Runtime stack**: Python 3.11
   - **Operating System**: Linux
   - **Region**: Same as resource group
   - **App Service Plan**: Select `pdfchat-plan`
4. **Deployment tab**:
   - **Continuous deployment**: Enable
   - **GitHub account**: Sign in and authorize
   - **Organization**: Your GitHub username
   - **Repository**: Select your `pdfbot` repository
   - **Branch**: `main` (or `master`)
   - ⚠️ **Note**: This creates `.github/workflows/main_pdfchat-api.yml` in your repo
5. **Networking tab**:
   - Leave defaults (public access enabled)
6. Click **"Review + create"** → **"Create"**

---

### Step 2.3: Configure App Service Settings

#### Enable Managed Identity

1. Go to your App Service (`pdfchat-api`)
2. Navigate to **"Identity"** (left sidebar under "Settings")
3. **System assigned tab**:
   - **Status**: On
   - Click **"Save"** → **"Yes"**
4. Copy the **Object (principal) ID** → Save for Key Vault access

#### Grant Key Vault Access

1. Go back to **Key Vault** (`pdfchat-vault`)
2. Navigate to **"Access policies"** (left sidebar)
3. Click **"+ Create"**
4. **Permissions tab**:
   - **Secret permissions**: Select **Get** and **List**
   - Click **"Next"**
5. **Principal tab**:
   - Search for `pdfchat-api` (your App Service name)
   - Select it → Click **"Next"**
6. Click **"Next"** → **"Create"**

#### Configure Environment Variables

1. Go to App Service (`pdfchat-api`)
2. Navigate to **"Configuration"** (left sidebar under "Settings")
3. Click **"+ New application setting"** and add each:

   | Name | Value | Notes |
   |------|-------|-------|
   | `GEMINI_API_KEY` | `@Microsoft.KeyVault(VaultName=pdfchat-vault;SecretName=gemini-api-key)` | References Key Vault |
   | `COSMOS_URL` | `https://pdfchat-cosmos.documents.azure.com:443/` | From Cosmos DB Keys |
   | `COSMOS_KEY` | `@Microsoft.KeyVault(VaultName=pdfchat-vault;SecretName=cosmos-key)` | References Key Vault |
   | `AZURE_BLOB_CONNECTION_STRING` | `@Microsoft.KeyVault(VaultName=pdfchat-vault;SecretName=azure-blob-connection-string)` | References Key Vault |
   | `COSMOS_DATABASE_NAME` | `pdf_chat_db` | Database name created earlier |
   | `COSMOS_CONTAINER_NAME` | `conversations` | Container name created earlier |
   | `AZURE_STORAGE_CONTAINER_NAME` | `pdf-uploads` | Container name created earlier |
   | `RUN_LOCAL` | `False` | Enables Azure mode |
   | `ALLOWED_ORIGIN` | `https://<your-static-web-app>.azurestaticapps.net` | ⚠️ Update after Step 3 |
   | `SCM_DO_BUILD_DURING_DEPLOYMENT` | `true` | Enables pip install during deployment |
   | `WEBSITE_HTTPLOGGING_RETENTION_DAYS` | `7` | Keep logs for 7 days |

4. Click **"Save"** → **"Continue"**
5. Wait for App Service to restart (~1 minute)

#### Configure Startup Command

1. Still in **"Configuration"** → **"General settings"** tab
2. **Startup Command**: 
   ```bash
   cd backend && python -m uvicorn main:app --host 0.0.0.0 --port 8000
   ```
3. Click **"Save"**

---

### Step 2.4: Deploy Backend Code

#### Option A: Automatic Deployment (Recommended)

1. GitHub Actions workflow was created automatically in Step 2.2
2. Push changes to `main` branch:
   ```bash
   git add .
   git commit -m "Configure Azure deployment"
   git push origin main
   ```
3. Go to your GitHub repository → **"Actions"** tab
4. Watch the deployment workflow run
5. Once complete, verify at `https://pdfchat-api.azurewebsites.net/docs`

#### Option B: Manual Deployment

1. In App Service, navigate to **"Deployment Center"** (left sidebar)
2. **Settings tab**:
   - **Source**: GitHub
   - Authenticate and select your repository
   - **Branch**: `main`
3. Click **"Save"**
4. Go to **"Logs"** tab to watch deployment

#### Verify Backend Deployment

1. Navigate to `https://pdfchat-api.azurewebsites.net/docs`
2. You should see FastAPI Swagger UI
3. Test the `/api/health` endpoint (if you create one):
   ```bash
   curl https://pdfchat-api.azurewebsites.net/docs
   ```

---

### Step 2.5: Configure CORS (After Frontend Deployment)

⚠️ **Do this AFTER Step 3.4** when you have your Static Web Apps URL

1. Go to App Service (`pdfchat-api`)
2. Navigate to **"CORS"** (left sidebar under "API")
3. **Allowed Origins**:
   - Add: `https://<your-static-web-app>.azurestaticapps.net`
   - Do NOT add `*` (security risk)
4. **Access-Control-Allow-Credentials**: Check this box
5. Click **"Save"**

Alternatively, update the `ALLOWED_ORIGIN` environment variable in Configuration.

---

## Part 3: Frontend Deployment (Azure Static Web Apps)

### Step 3.1: Create Static Web App

1. Search for **"Static Web Apps"** in Azure Portal
2. Click **"+ Create"**
3. **Basics tab**:
   - **Resource group**: `pdfchat-rg`
   - **Name**: `pdfchat-frontend`
   - **Plan type**: 
     - **Free** (0.5 GB bandwidth, no custom domains)
     - **Standard** ($9/month, 100 GB bandwidth, custom domains)
   - **Region**: Auto (uses global CDN)
4. **Deployment details**:
   - **Source**: GitHub
   - **GitHub account**: Sign in and authorize
   - **Organization**: Your GitHub username
   - **Repository**: Select your `pdfbot` repository
   - **Branch**: `main`
5. **Build Details**:
   - **Build Presets**: Custom
   - **App location**: `/frontend` (relative to repo root)
   - **Api location**: Leave empty (we're using separate App Service)
   - **Output location**: `dist` (Vite build output)
6. Click **"Review + create"** → **"Create"** (takes ~2 minutes)

---

### Step 3.2: Configure Static Web App Settings

1. After deployment, go to Static Web App (`pdfchat-frontend`)
2. Copy the **URL** (e.g., `https://happy-cliff-0a1b2c3d4.azurestaticapps.net`)
3. Navigate to **"Configuration"** (left sidebar)
4. Click **"+ Add"** under "Application settings":

   | Name | Value | Notes |
   |------|-------|-------|
   | `VITE_API_BASE_URL` | `https://pdfchat-api.azurewebsites.net` | Your App Service URL |

5. Click **"Save"**

---

### Step 3.3: Configure Build Settings

1. In Static Web App, navigate to **"Configuration"** → **"Build"** tab
2. Verify build configuration matches your `staticwebapp.config.json`:
   ```json
   {
     "navigationFallback": {
       "rewrite": "/index.html",
       "exclude": ["/images/*.{png,jpg,gif}", "/css/*"]
     },
     "routes": [
       {
         "route": "/*",
         "allowedRoles": ["anonymous"]
       }
     ],
     "responseOverrides": {
       "404": {
         "rewrite": "/index.html",
         "statusCode": 200
       }
     }
   }
   ```
3. Create `frontend/staticwebapp.config.json` if it doesn't exist

---

### Step 3.4: Enable Azure AD Authentication (Production)

⚠️ **Required for production** - Secures API endpoints

1. Navigate to **"Authentication"** (left sidebar under "Settings")
2. Click **"+ Add provider"** → **"Microsoft"**
3. **Registration tab**:
   - **Name**: Azure Active Directory
   - **Client ID**: 
     - Go to [Azure Active Directory](https://portal.azure.com/#blade/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade) → **"App registrations"** → **"+ New registration"**
     - **Name**: `pdfchat-auth`
     - **Supported account types**: Accounts in this organizational directory only
     - **Redirect URI**: `https://<your-static-web-app>.azurestaticapps.net/.auth/login/aad/callback`
     - Click **"Register"**
     - Copy **Application (client) ID**
   - **Client secret**:
     - In App registration, go to **"Certificates & secrets"** → **"+ New client secret"**
     - **Description**: `pdfchat-secret`
     - **Expires**: 24 months
     - Copy the **Value** (not Secret ID)
4. Back in Static Web App **"Authentication"**:
   - Paste **Client ID** and **Client secret**
   - **Tenant type**: Single tenant
   - **Tenant ID**: Copy from AAD app registration Overview page
5. Click **"Add"**

Update `frontend/staticwebapp.config.json`:
```json
{
  "routes": [
    {
      "route": "/api/*",
      "allowedRoles": ["authenticated"]
    },
    {
      "route": "/.auth/*",
      "allowedRoles": ["anonymous"]
    }
  ],
  "auth": {
    "identityProviders": {
      "azureActiveDirectory": {
        "registration": {
          "openIdIssuer": "https://login.microsoftonline.com/<tenant-id>/v2.0",
          "clientIdSettingName": "AAD_CLIENT_ID",
          "clientSecretSettingName": "AAD_CLIENT_SECRET"
        }
      }
    }
  },
  "responseOverrides": {
    "401": {
      "redirect": "/.auth/login/aad",
      "statusCode": 302
    }
  }
}
```

Add to Static Web App **Configuration** → **Application settings**:
- `AAD_CLIENT_ID`: Your Azure AD app client ID
- `AAD_CLIENT_SECRET`: Your Azure AD app client secret

---

### Step 3.5: Deploy Frontend Code

#### Automatic Deployment

1. Static Web Apps creates `.github/workflows/azure-static-web-apps-<id>.yml`
2. Create `frontend/.env.production`:
   ```env
   VITE_API_BASE_URL=https://pdfchat-api.azurewebsites.net
   ```
3. Update `frontend/vite.config.ts` to use environment variables:
   ```typescript
   import { defineConfig } from 'vite'
   import react from '@vitejs/plugin-react'
   
   export default defineConfig({
     plugins: [react()],
     build: {
       outDir: 'dist',
       sourcemap: false
     }
   })
   ```
4. Push changes:
   ```bash
   git add .
   git commit -m "Configure Static Web Apps"
   git push origin main
   ```
5. Go to GitHub repository → **"Actions"** tab
6. Watch both workflows run (App Service + Static Web Apps)
7. Once complete, visit `https://<your-static-web-app>.azurestaticapps.net`

#### Verify Frontend Deployment

1. Open `https://<your-static-web-app>.azurestaticapps.net`
2. You should see the login page
3. Check browser console for errors
4. Test authentication flow

---

### Step 3.6: Update Backend CORS

Now that you have the Static Web Apps URL:

1. Go to App Service (`pdfchat-api`)
2. Navigate to **"Configuration"** → **"Application settings"**
3. Edit `ALLOWED_ORIGIN`:
   - **Value**: `https://<your-static-web-app>.azurestaticapps.net`
4. Click **"Save"** → **"Continue"**

Or use CORS settings (Step 2.5).

---

## Part 4: Required Environment Variables

### Backend (Azure App Service)

| Variable | Example | Source | Required |
|----------|---------|--------|----------|
| `GEMINI_API_KEY` | `AIzaSyABC123...` | Google AI Studio | ✅ Yes |
| `COSMOS_URL` | `https://pdfchat-cosmos.documents.azure.com:443/` | Cosmos DB Keys | ✅ Yes |
| `COSMOS_KEY` | `PrimaryKey123==` | Cosmos DB Keys | ✅ Yes |
| `COSMOS_DATABASE_NAME` | `pdf_chat_db` | Manual | ✅ Yes |
| `COSMOS_CONTAINER_NAME` | `conversations` | Manual | ✅ Yes |
| `AZURE_BLOB_CONNECTION_STRING` | `DefaultEndpointsProtocol=https;...` | Blob Storage Keys | ✅ Yes |
| `AZURE_STORAGE_CONTAINER_NAME` | `pdf-uploads` | Manual | ✅ Yes |
| `RUN_LOCAL` | `False` | Manual | ✅ Yes |
| `ALLOWED_ORIGIN` | `https://app.azurestaticapps.net` | Static Web App URL | ✅ Yes |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `true` | Azure Config | ⚠️ Recommended |

### Frontend (Azure Static Web Apps)

| Variable | Example | Source | Required |
|----------|---------|--------|----------|
| `VITE_API_BASE_URL` | `https://pdfchat-api.azurewebsites.net` | App Service URL | ✅ Yes |
| `AAD_CLIENT_ID` | `abc123-def456-...` | Azure AD App Registration | ⚠️ For Auth |
| `AAD_CLIENT_SECRET` | `secret~value` | Azure AD App Registration | ⚠️ For Auth |

---

## Part 5: Common Deployment Mistakes

### ❌ Mistake #1: Forgetting to Set `RUN_LOCAL=False`

**Problem**: Backend tries to use `local_db.json` instead of Cosmos DB

**Symptoms**:
- Error: `FileNotFoundError: [Errno 2] No such file or directory: 'backend/local_db.json'`
- 500 errors on all API calls

**Solution**:
```python
# backend/main.py checks this variable
RUN_LOCAL = os.getenv("RUN_LOCAL", "True").lower() == "true"
```
Set `RUN_LOCAL=False` in App Service Configuration.

---

### ❌ Mistake #2: CORS Not Configured

**Problem**: Frontend can't call backend API

**Symptoms**:
- Browser console: `Access to fetch at 'https://pdfchat-api.azurewebsites.net' from origin 'https://app.azurestaticapps.net' has been blocked by CORS policy`
- Network tab shows preflight OPTIONS request fails

**Solution**:
1. Set `ALLOWED_ORIGIN` environment variable in App Service
2. Or configure CORS in App Service → CORS settings
3. Ensure `allow_credentials=True` in `CORSMiddleware`

---

### ❌ Mistake #3: Missing `SCM_DO_BUILD_DURING_DEPLOYMENT`

**Problem**: Python dependencies not installed during deployment

**Symptoms**:
- Error: `ModuleNotFoundError: No module named 'fastapi'`
- App Service logs show missing packages

**Solution**:
Set `SCM_DO_BUILD_DURING_DEPLOYMENT=true` in App Service Configuration.

Alternatively, add `oryx-build` command in GitHub workflow:
```yaml
- name: Install dependencies
  run: |
    cd backend
    python -m pip install --upgrade pip
    pip install -r requirements.txt
```

---

### ❌ Mistake #4: Incorrect Startup Command

**Problem**: App Service can't find FastAPI app

**Symptoms**:
- App Service shows "Service Unavailable"
- Logs: `Error: Couldn't find application object 'app'`

**Solution**:
Set **Startup Command** in App Service Configuration → General settings:
```bash
cd backend && python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Or create `backend/startup.sh`:
```bash
#!/bin/bash
cd /home/site/wwwroot/backend
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

---

### ❌ Mistake #5: Hardcoding `localhost` URLs

**Problem**: Frontend tries to call `http://localhost:8000` in production

**Symptoms**:
- Network errors in browser console
- API calls timeout

**Solution**:
```typescript
// frontend/src/lib/api.ts
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
```

Set `VITE_API_BASE_URL` in Static Web Apps Configuration.

---

### ❌ Mistake #6: Key Vault Access Not Granted

**Problem**: App Service can't read secrets from Key Vault

**Symptoms**:
- Error: `Azure.RequestFailedException: ForbiddenByPolicy`
- Environment variables show empty values

**Solution**:
1. Enable **Managed Identity** on App Service
2. Grant **Get** and **List** permissions in Key Vault Access Policies
3. Use Key Vault references in environment variables:
   ```
   @Microsoft.KeyVault(VaultName=pdfchat-vault;SecretName=gemini-api-key)
   ```

---

### ❌ Mistake #7: Wrong Build Output Directory

**Problem**: Static Web Apps deploys empty site

**Symptoms**:
- White screen on Static Web Apps URL
- 404 errors for all routes

**Solution**:
In Static Web Apps build configuration:
- **App location**: `/frontend`
- **Output location**: `dist` (Vite default)

Verify `frontend/package.json`:
```json
{
  "scripts": {
    "build": "vite build"
  }
}
```

---

### ❌ Mistake #8: Cosmos DB Partition Key Mismatch

**Problem**: Queries fail or return no results

**Symptoms**:
- Error: `PartitionKey value must be supplied for this operation`
- Empty chat history

**Solution**:
Ensure Cosmos DB container has partition key `/user_id` and queries include it:
```python
# backend/services/cosmos.py
container.query_items(
    query="SELECT * FROM c WHERE c.user_id = @user_id",
    parameters=[{"name": "@user_id", "value": user_id}],
    partition_key=user_id  # Must match container partition key
)
```

---

### ❌ Mistake #9: Blob Storage Container Not Created

**Problem**: File uploads fail

**Symptoms**:
- Error: `ResourceNotFoundError: The specified container does not exist`
- 500 errors on `/api/upload`

**Solution**:
1. Go to Storage Account → **Containers**
2. Create container named `pdf-uploads` (matches `AZURE_STORAGE_CONTAINER_NAME`)
3. Set **Public access level**: Private

---

### ❌ Mistake #10: Environment Variables Not Refreshed

**Problem**: Changes to environment variables don't take effect

**Symptoms**:
- Old values still used after updating Configuration
- API still points to wrong URL

**Solution**:
After updating App Service Configuration or Static Web Apps settings:
1. Click **"Save"**
2. Wait for **"Restarting..."** message
3. Verify restart in **Logs** or **Overview** page
4. Test with fresh browser session (clear cache)

---

### ❌ Mistake #11: GitHub Workflow Secrets Not Set

**Problem**: GitHub Actions deployment fails

**Symptoms**:
- Workflow shows red X
- Error: `Error: Unable to authenticate with Azure`

**Solution**:
GitHub Actions workflows use deployment tokens automatically created by Azure.

If manually configuring workflows:
1. Go to GitHub repository → **Settings** → **Secrets and variables** → **Actions**
2. Add secrets:
   - `AZURE_STATIC_WEB_APPS_API_TOKEN`: From Static Web Apps → Manage deployment token
   - `AZURE_WEBAPP_PUBLISH_PROFILE`: From App Service → Get publish profile

---

### ❌ Mistake #12: Missing `requirements.txt` Dependencies

**Problem**: App Service build succeeds but app crashes

**Symptoms**:
- Error: `ModuleNotFoundError: No module named 'PyPDF2'`

**Solution**:
Ensure `backend/requirements.txt` includes all dependencies:
```txt
fastapi==0.115.6
uvicorn[standard]==0.34.0
python-multipart==0.0.20
python-dotenv==1.0.1
azure-storage-blob==12.24.0
azure-cosmos==4.9.0
google-generativeai==0.8.3
PyPDF2==3.0.1
```

Test locally before deploying:
```bash
cd backend
pip install -r requirements.txt
python main.py
```

---

## Part 6: Troubleshooting

### View App Service Logs

**Method 1: Azure Portal**
1. Go to App Service → **Log stream** (left sidebar under "Monitoring")
2. Watch real-time logs

**Method 2: SSH**
1. Go to App Service → **SSH** (left sidebar under "Development Tools")
2. Click **"Go"**
3. Navigate to logs:
   ```bash
   cd /home/LogFiles
   cat application.log
   ```

**Method 3: Kudu**
1. Navigate to `https://pdfchat-api.scm.azurewebsites.net`
2. **Debug console** → **CMD**
3. Browse to `LogFiles/`

---

### View Static Web Apps Logs

1. Go to Static Web App → **Functions** (left sidebar)
2. Check deployment status
3. View GitHub Actions workflow logs:
   - Go to GitHub repository → **Actions** tab
   - Click on latest workflow run
   - Expand **"Build and Deploy"** step

---

### Common Log Errors

**Error**: `ModuleNotFoundError: No module named 'fastapi'`
- **Cause**: Dependencies not installed
- **Fix**: Set `SCM_DO_BUILD_DURING_DEPLOYMENT=true`

**Error**: `FileNotFoundError: backend/local_db.json`
- **Cause**: `RUN_LOCAL=True` in production
- **Fix**: Set `RUN_LOCAL=False`

**Error**: `Azure.RequestFailedException: ForbiddenByPolicy`
- **Cause**: Key Vault access denied
- **Fix**: Grant Managed Identity access to Key Vault

**Error**: `CORS policy: No 'Access-Control-Allow-Origin' header`
- **Cause**: CORS not configured
- **Fix**: Set `ALLOWED_ORIGIN` or configure CORS in App Service

---

## Part 7: Post-Deployment Checklist

### ✅ Verify Backend

- [ ] Visit `https://pdfchat-api.azurewebsites.net/docs` (Swagger UI loads)
- [ ] Test `/api/upload` endpoint with sample PDF
- [ ] Test `/api/ask` endpoint with question
- [ ] Check App Service logs for errors
- [ ] Verify Cosmos DB has data: Azure Portal → Cosmos DB → Data Explorer → `conversations`
- [ ] Verify Blob Storage has files: Azure Portal → Storage Account → Containers → `pdf-uploads`

### ✅ Verify Frontend

- [ ] Visit `https://<your-static-web-app>.azurestaticapps.net`
- [ ] Login/signup works
- [ ] Upload PDF works
- [ ] Ask question works
- [ ] Chat history loads
- [ ] Profile shows correct user info
- [ ] No console errors in browser DevTools

### ✅ Security

- [ ] Azure AD authentication enabled (production only)
- [ ] CORS configured (not `*`)
- [ ] Key Vault stores secrets (not plaintext in Configuration)
- [ ] Managed Identity enabled on App Service
- [ ] Blob Storage has private access (not public)
- [ ] Cosmos DB firewall configured (restrict to App Service IP)

### ✅ Performance

- [ ] App Service plan size adequate (B1 minimum, P1V2 for production)
- [ ] Cosmos DB serverless mode enabled (or provisioned RU/s configured)
- [ ] Static Web Apps uses CDN (automatic)
- [ ] Blob Storage uses Standard tier

### ✅ Monitoring

- [ ] Application Insights enabled (optional):
  - App Service → Application Insights → Enable
  - Install `applicationinsights` package in backend
- [ ] Alerts configured for errors
- [ ] Log retention set (7-30 days)

---

## Part 8: Cost Estimation

Monthly costs (East US region):

| Service | Tier | Monthly Cost |
|---------|------|--------------|
| App Service (B1) | Basic | ~$13 |
| App Service (P1V2) | Premium | ~$73 |
| Static Web Apps | Free | $0 |
| Static Web Apps | Standard | $9 |
| Cosmos DB | Serverless (1M RU/s) | ~$0.25 per million |
| Blob Storage | Standard LRS (10 GB) | ~$0.18 |
| Key Vault | Standard (1000 ops) | ~$0.03 |
| **Total (Dev)** | B1 + Free SWA | ~$13.50/month |
| **Total (Prod)** | P1V2 + Standard SWA | ~$82.50/month |

⚠️ **Gemini API costs are separate** - Check [Google AI Studio pricing](https://ai.google.dev/pricing)

---

## Summary

You now have:
- ✅ FastAPI backend deployed to Azure App Service
- ✅ React frontend deployed to Azure Static Web Apps
- ✅ Cosmos DB for chat history
- ✅ Blob Storage for PDF files
- ✅ Key Vault for secrets management
- ✅ Managed Identity for secure access
- ✅ CORS configured between frontend and backend
- ✅ GitHub Actions CI/CD pipelines

**Next steps**:
1. Configure custom domain (optional)
2. Enable Application Insights for monitoring
3. Set up Azure Front Door for global CDN (optional)
4. Implement backup and disaster recovery
5. Review [SECURITY_REVIEW.md](./SECURITY_REVIEW.md) for hardening recommendations

**Support**:
- [Azure App Service docs](https://learn.microsoft.com/en-us/azure/app-service/)
- [Azure Static Web Apps docs](https://learn.microsoft.com/en-us/azure/static-web-apps/)
- [FastAPI deployment guide](https://fastapi.tiangolo.com/deployment/azure/)
