# Security & Production Readiness Review

This document reviews Azure PDF Chat from a security and production-readiness perspective, identifying critical issues and providing actionable recommendations before Azure deployment.

---

## 1. Authentication Mechanism

### Current Implementation

**Development Mode (localhost)**:
```typescript
// frontend/src/lib/auth.ts
export const loginWithCredentials = async (email: string, password: string): Promise<void> => {
  const users = localStorage.getItem(USERS_KEY);
  const userList = JSON.parse(users);
  if (userList[email] && userList[email].password === password) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  }
}
```

**Issues**:
- ⚠️ **Plaintext passwords** stored in `localStorage`
- ⚠️ **No password hashing** (bcrypt, argon2)
- ⚠️ **No account lockout** after failed login attempts
- ⚠️ **No password complexity requirements**
- ⚠️ **Client-side only** - no backend validation
- ⚠️ **localStorage is insecure** - accessible to any JavaScript code

**Production Mode (Azure)**:
```typescript
// Relies on Azure Static Web Apps built-in auth
const response = await fetch("/.auth/me");
const payload: AuthResponse = await response.json();
return payload.clientPrincipal ?? null;
```

**Issues**:
- ⚠️ **No explicit user_id validation** - backend trusts any `user_id` sent by frontend
- ⚠️ **No session management** - stateless architecture vulnerable to replay attacks
- ⚠️ **No JWT verification** - backend doesn't verify Azure AD tokens

### 🔴 Critical Risks

1. **User Impersonation**: Anyone can send a request with `user_id=admin@company.com` and access their documents
   ```python
   # backend/main.py - NO validation
   @app.post("/api/upload")
   async def upload_pdf(user_id: str = Form(...), file: UploadFile = File(...)):
       # user_id is trusted without verification!
   ```

2. **Plaintext Password Storage**: Development mode stores passwords in plain text in browser
   ```
   localStorage["azure-pdf-chat-users"] = {
     "john@example.com": { "password": "Password123", "name": "John" }
   }
   ```

### ✅ Recommendations

**Immediate (Before Production Deployment)**:

1. **Enable Azure Static Web Apps Authentication**:
   ```json
   // staticwebapp.config.json
   {
     "routes": [
       {
         "route": "/api/*",
         "allowedRoles": ["authenticated"]
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
     }
   }
   ```

2. **Add Backend User Validation**:
   ```python
   # backend/middleware/auth.py (NEW FILE)
   from fastapi import Header, HTTPException
   
   async def verify_user(x_ms_client_principal: str = Header(None)):
       if not x_ms_client_principal:
           raise HTTPException(status_code=401, detail="Unauthorized")
       
       import base64, json
       principal = json.loads(base64.b64decode(x_ms_client_principal))
       return principal["userId"]
   
   # backend/main.py
   from .middleware.auth import verify_user
   
   @app.post("/api/upload")
   async def upload_pdf(
       verified_user_id: str = Depends(verify_user),
       file: UploadFile = File(...)
   ):
       # Use verified_user_id instead of accepting user_id from form
   ```

3. **Remove Development Authentication** (or disable in production):
   ```typescript
   // frontend/src/lib/auth.ts
   export const getUser = async (): Promise<AuthUser | null> => {
     if (isLocalhost()) {
       throw new Error("Local auth disabled. Configure Azure AD for production.");
     }
     // Only Azure AD auth in production
   }
   ```

4. **Implement Rate Limiting**:
   ```python
   # pip install slowapi
   from slowapi import Limiter, _rate_limit_exceeded_handler
   from slowapi.util import get_remote_address
   
   limiter = Limiter(key_func=get_remote_address)
   app.state.limiter = limiter
   
   @app.post("/api/ask")
   @limiter.limit("10/minute")  # Max 10 AI requests per minute per IP
   async def ask_question(request: Request, ...):
       ...
   ```

**Long-term Enhancements**:
- Implement multi-factor authentication (MFA) via Azure AD
- Add OAuth2 scopes for fine-grained permissions
- Implement session expiration and refresh tokens
- Add audit logging for authentication events

---

## 2. Secrets Management

### Current Implementation

**Environment Variables**:
```python
# backend/main.py
from dotenv import load_dotenv
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
COSMOS_KEY = os.getenv("COSMOS_KEY")
AZURE_BLOB_CONNECTION_STRING = os.getenv("AZURE_BLOB_CONNECTION_STRING")
```

**Storage**:
```
backend/.env (MUST BE GITIGNORED)
GEMINI_API_KEY=AIzaSyABC123...
COSMOS_KEY=PrimaryKey123456789==
AZURE_BLOB_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...
```

### 🔴 Critical Risks

1. **No `.gitignore` file found** - `.env` files may be committed to Git
   ```bash
   # ⚠️ If .env is committed, secrets are exposed in Git history
   git log --all --full-history -- backend/.env
   ```

2. **Secrets in Plaintext**: Environment variables stored in unencrypted files
3. **No Secret Rotation**: API keys never expire or rotate
4. **Logging Risk**: Secrets may appear in logs
   ```python
   # backend/test_api.py - EXPOSES API KEY IN LOGS
   print(f"Testing API Key: {api_key[:10]}...")  # Still risky!
   ```

### ✅ Recommendations

**Immediate (Before Production Deployment)**:

1. **Create `.gitignore` Files**:
   ```bash
   # Root .gitignore
   echo "*.env" >> .gitignore
   echo ".env.local" >> .gitignore
   echo "backend/.env" >> .gitignore
   echo "frontend/.env" >> .gitignore
   
   # Commit .gitignore
   git add .gitignore
   git commit -m "Add .gitignore to prevent secret leaks"
   ```

2. **Check Git History for Leaked Secrets**:
   ```bash
   # Scan for exposed secrets
   git log --all --full-history --source -- '*.env'
   
   # If secrets found, rotate ALL exposed keys immediately:
   # - Generate new Gemini API key
   # - Regenerate Cosmos DB keys
   # - Regenerate Blob Storage keys
   ```

3. **Use Azure Key Vault for Production**:
   ```python
   # backend/services/secrets.py (NEW FILE)
   from azure.identity import DefaultAzureCredential
   from azure.keyvault.secrets import SecretClient
   
   credential = DefaultAzureCredential()
   client = SecretClient(vault_url="https://pdfchat-vault.vault.azure.net/", credential=credential)
   
   GEMINI_API_KEY = client.get_secret("gemini-api-key").value
   COSMOS_KEY = client.get_secret("cosmos-key").value
   ```

4. **Configure Azure App Service Settings** (alternative to Key Vault):
   ```bash
   # Set secrets via Azure CLI (never commit these)
   az webapp config appsettings set \
     --name pdfchat-api \
     --resource-group pdfchat-rg \
     --settings \
       GEMINI_API_KEY="<secret>" \
       COSMOS_KEY="<secret>" \
       AZURE_BLOB_CONNECTION_STRING="<secret>"
   ```

5. **Remove Debug Logging of Secrets**:
   ```python
   # DELETE this line from backend/test_api.py
   print(f"Testing API Key: {api_key[:10]}...")
   
   # Never log secrets, even partially
   ```

6. **Add Secret Validation on Startup**:
   ```python
   # backend/main.py
   REQUIRED_SECRETS = ["GEMINI_API_KEY", "COSMOS_KEY", "AZURE_BLOB_CONNECTION_STRING"]
   
   @app.on_event("startup")
   async def validate_secrets():
       missing = [s for s in REQUIRED_SECRETS if not os.getenv(s)]
       if missing:
           raise RuntimeError(f"Missing required secrets: {', '.join(missing)}")
   ```

**Long-term Enhancements**:
- Implement secret rotation policy (every 90 days)
- Use managed identities for Azure services (no connection strings needed)
- Enable Azure Key Vault access logging
- Implement secret expiration monitoring

---

## 3. CORS Configuration

### Current Implementation

```python
# backend/main.py
if RUN_LOCAL:
    allowed_origins = ["http://localhost:5173", "http://localhost:3000"]
else:
    allowed_origin_value = os.getenv("ALLOWED_ORIGIN")
    allowed_origins = [allowed_origin_value]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],      # ⚠️ Allows all HTTP methods
    allow_headers=["*"],      # ⚠️ Allows all headers
    expose_headers=["*"],     # ⚠️ Exposes all headers
)
```

### 🟡 Moderate Risks

1. **Wildcard Methods/Headers**: `allow_methods=["*"]` and `allow_headers=["*"]` are too permissive
2. **Single Origin in Production**: No support for multiple allowed origins (e.g., staging + production)
3. **No Preflight Caching**: Slow CORS preflight for every request

### ✅ Recommendations

**Immediate**:

1. **Restrict Methods and Headers**:
   ```python
   app.add_middleware(
       CORSMiddleware,
       allow_origins=allowed_origins,
       allow_credentials=True,
       allow_methods=["GET", "POST", "OPTIONS"],  # Only needed methods
       allow_headers=["Content-Type", "Authorization"],  # Only needed headers
       expose_headers=["Content-Type"],  # Only needed exposed headers
       max_age=600,  # Cache preflight for 10 minutes
   )
   ```

2. **Support Multiple Origins**:
   ```python
   # backend/main.py
   ALLOWED_ORIGIN = os.getenv("ALLOWED_ORIGIN", "")
   allowed_origins = [origin.strip() for origin in ALLOWED_ORIGIN.split(",") if origin.strip()]
   
   if not allowed_origins:
       if RUN_LOCAL:
           allowed_origins = ["http://localhost:5173", "http://localhost:3000"]
       else:
           raise RuntimeError("ALLOWED_ORIGIN must be set in production")
   ```

3. **Environment Configuration**:
   ```env
   # backend/.env (production)
   ALLOWED_ORIGIN=https://pdfchat.azurestaticapps.net,https://staging-pdfchat.azurestaticapps.net
   ```

**Long-term Enhancements**:
- Implement dynamic origin validation (check against database of allowed domains)
- Add CORS error logging to detect unauthorized access attempts
- Consider using Azure API Management for centralized CORS policies

---

## 4. File Upload Validation

### Current Implementation

**Frontend Validation** (`frontend/src/components/UploadCard.tsx`):
```typescript
const MAX_FILE_SIZE_MB = 25;
const ACCEPTED_TYPES = ["application/pdf"];

if (!ACCEPTED_TYPES.includes(file.type)) {
  setStatus("Please upload a valid PDF document.");
}

if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
  setStatus("File is too large. Maximum allowed size is 25 MB.");
}
```

**Backend Validation** (`backend/main.py`):
```python
if file.content_type not in {"application/pdf", "application/x-pdf"}:
    raise HTTPException(status_code=400, detail="Only PDF uploads are supported.")

# ⚠️ NO FILE SIZE CHECK IN BACKEND
```

### 🔴 Critical Risks

1. **No Backend Size Limit**: Users can bypass frontend validation and upload gigabyte-sized files
   ```bash
   # Attacker can bypass frontend validation
   curl -X POST http://api.example.com/api/upload \
     -F "user_id=victim@example.com" \
     -F "file=@10GB.pdf"
   ```

2. **MIME Type Spoofing**: File extension doesn't match content
   ```bash
   # Rename malicious file to .pdf
   mv malware.exe malware.pdf
   # Upload succeeds because only MIME type is checked
   ```

3. **No Virus Scanning**: Malicious PDFs with embedded scripts not detected

4. **No Content Validation**: PDF structure not verified (could be corrupted or exploit PDF parsers)

5. **Filename Injection**: Special characters in filenames not sanitized
   ```python
   # Current sanitization
   def _sanitize_filename(filename: str, fallback: str) -> str:
       name = Path(filename).name if filename else fallback
       return name or fallback
   # ⚠️ Doesn't strip special characters like |, &, ;, $(command)
   ```

### ✅ Recommendations

**Immediate (Before Production Deployment)**:

1. **Add Backend File Size Validation**:
   ```python
   # backend/main.py
   MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024  # 25 MB
   
   @app.post("/api/upload")
   async def upload_pdf(user_id: str = Form(...), file: UploadFile = File(...)):
       # Read file size without loading entire file into memory
       file.file.seek(0, 2)  # Seek to end
       size = file.file.tell()
       file.file.seek(0)  # Reset position
       
       if size > MAX_FILE_SIZE_BYTES:
           raise HTTPException(status_code=413, detail=f"File too large. Max size: {MAX_FILE_SIZE_BYTES / (1024**2):.0f}MB")
   ```

2. **Verify PDF Magic Bytes**:
   ```python
   async def validate_pdf_content(file: UploadFile):
       # Read first 5 bytes to check PDF signature
       header = await file.read(5)
       await file.seek(0)  # Reset for later processing
       
       if not header.startswith(b'%PDF-'):
           raise HTTPException(status_code=400, detail="Invalid PDF file format")
   ```

3. **Enhanced Filename Sanitization**:
   ```python
   import re
   
   def _sanitize_filename(filename: str, fallback: str) -> str:
       if not filename:
           return fallback
       
       # Extract basename (prevents path traversal)
       name = Path(filename).name
       
       # Remove dangerous characters
       name = re.sub(r'[^\w\s\-\.]', '', name)
       
       # Limit length
       name = name[:255]
       
       return name or fallback
   ```

4. **Implement Virus Scanning** (Azure Blob Storage):
   ```python
   # Use Azure Defender for Storage (enable in Azure Portal)
   # Or integrate with ClamAV
   import clamd
   
   async def scan_file_for_viruses(file_path: str):
       cd = clamd.ClamdUnixSocket()
       result = cd.scan(file_path)
       if result and 'FOUND' in str(result):
           raise HTTPException(status_code=400, detail="Malicious file detected")
   ```

5. **Add Rate Limiting for Uploads**:
   ```python
   @app.post("/api/upload")
   @limiter.limit("5/hour")  # Max 5 uploads per hour per user
   async def upload_pdf(request: Request, ...):
       ...
   ```

6. **Content-Type Header Validation**:
   ```python
   @app.post("/api/upload")
   async def upload_pdf(...):
       # Validate Content-Type header
       if file.content_type not in {"application/pdf", "application/x-pdf"}:
           raise HTTPException(status_code=400, detail="Invalid content type")
       
       # Validate actual file content
       await validate_pdf_content(file)
   ```

**Long-term Enhancements**:
- Implement PDF structure validation using `PyPDF2` or `pdfminer.six`
- Add quarantine folder for suspicious uploads
- Enable Azure Blob Storage immutability policies
- Implement upload quota per user (e.g., 100 MB total per month)
- Add file type detection using `python-magic` library

---

## 5. Pre-Deployment Checklist

### 🔴 Critical (MUST FIX Before Production)

- [ ] **Create `.gitignore` file** excluding `*.env`, `*.env.local`
- [ ] **Scan Git history for leaked secrets** and rotate if found
- [ ] **Enable Azure Static Web Apps authentication** (Azure AD)
- [ ] **Add backend user validation** using `x-ms-client-principal` header
- [ ] **Move secrets to Azure Key Vault** or App Service settings
- [ ] **Add backend file size validation** (25 MB limit)
- [ ] **Verify PDF magic bytes** to prevent file type spoofing
- [ ] **Remove plaintext password storage** in `localStorage`
- [ ] **Disable local development authentication** in production builds
- [ ] **Set `ALLOWED_ORIGIN` environment variable** to Static Web Apps URL

### 🟡 Important (Should Fix Soon)

- [ ] **Implement rate limiting** (5 uploads/hour, 10 AI requests/minute)
- [ ] **Add virus scanning** using Azure Defender or ClamAV
- [ ] **Enhance filename sanitization** to remove special characters
- [ ] **Restrict CORS methods/headers** to minimum required
- [ ] **Add secret rotation policy** (90-day expiration)
- [ ] **Implement audit logging** for all API operations
- [ ] **Enable HTTPS-only** in production (Azure enforces by default)
- [ ] **Add request retry logic** in frontend for transient failures
- [ ] **Implement session expiration** (30-minute idle timeout)

### 🟢 Nice to Have (Future Improvements)

- [ ] Implement multi-factor authentication (MFA)
- [ ] Add Content Security Policy (CSP) headers
- [ ] Enable Azure DDoS Protection
- [ ] Implement data encryption at rest (Cosmos DB + Blob Storage)
- [ ] Add API request/response logging for forensics
- [ ] Implement backup and disaster recovery plan
- [ ] Add health check monitoring with alerts
- [ ] Enable Azure Application Insights for telemetry
- [ ] Implement usage quotas per user
- [ ] Add GDPR compliance features (data export, right to be forgotten)

---

## 6. Azure Deployment Configuration

### Required Azure Resources

1. **Azure Static Web Apps** (Frontend)
   - Enable built-in authentication (Azure AD)
   - Configure custom domain with SSL
   - Set environment variables: `VITE_API_BASE_URL`

2. **Azure App Service** (Backend)
   - Enable managed identity
   - Configure App Service settings with secrets
   - Enable HTTPS-only
   - Set CORS allowed origins

3. **Azure Blob Storage**
   - Enable Azure Defender for Storage (malware scanning)
   - Configure private endpoint (no public access)
   - Enable soft delete (30-day retention)
   - Set lifecycle management policies

4. **Azure Cosmos DB**
   - Enable firewall (allow only App Service)
   - Configure partition key: `/user_id`
   - Enable automatic backups
   - Set TTL for message history (e.g., 90 days)

5. **Azure Key Vault**
   - Store all secrets (API keys, connection strings)
   - Enable soft delete and purge protection
   - Grant App Service managed identity access

6. **Azure Application Insights** (Monitoring)
   - Enable distributed tracing
   - Configure alerts for errors and performance
   - Set up custom metrics for AI requests

### Sample `staticwebapp.config.json`

```json
{
  "routes": [
    {
      "route": "/api/*",
      "allowedRoles": ["authenticated"]
    },
    {
      "route": "/.auth/login/*",
      "allowedRoles": ["anonymous"]
    }
  ],
  "navigationFallback": {
    "rewrite": "/index.html"
  },
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

### Sample Azure CLI Deployment

```bash
#!/bin/bash
# deploy.sh

RESOURCE_GROUP="pdfchat-rg"
LOCATION="eastus"
APP_NAME="pdfchat-api"
STORAGE_ACCOUNT="pdfchatstorage"
COSMOS_ACCOUNT="pdfchat-cosmos"
KEYVAULT_NAME="pdfchat-vault"

# Create resource group
az group create --name $RESOURCE_GROUP --location $LOCATION

# Create App Service
az webapp create \
  --resource-group $RESOURCE_GROUP \
  --plan pdfchat-plan \
  --name $APP_NAME \
  --runtime "PYTHON:3.11" \
  --https-only

# Enable managed identity
az webapp identity assign \
  --resource-group $RESOURCE_GROUP \
  --name $APP_NAME

# Create Key Vault
az keyvault create \
  --resource-group $RESOURCE_GROUP \
  --name $KEYVAULT_NAME \
  --location $LOCATION

# Grant App Service access to Key Vault
IDENTITY_ID=$(az webapp identity show --resource-group $RESOURCE_GROUP --name $APP_NAME --query principalId -o tsv)
az keyvault set-policy \
  --name $KEYVAULT_NAME \
  --object-id $IDENTITY_ID \
  --secret-permissions get list

# Store secrets in Key Vault
az keyvault secret set --vault-name $KEYVAULT_NAME --name "gemini-api-key" --value "<your-key>"
az keyvault secret set --vault-name $KEYVAULT_NAME --name "cosmos-key" --value "<your-key>"

# Configure App Service to use Key Vault
az webapp config appsettings set \
  --resource-group $RESOURCE_GROUP \
  --name $APP_NAME \
  --settings \
    GEMINI_API_KEY="@Microsoft.KeyVault(VaultName=$KEYVAULT_NAME;SecretName=gemini-api-key)" \
    COSMOS_KEY="@Microsoft.KeyVault(VaultName=$KEYVAULT_NAME;SecretName=cosmos-key)"
```

---

## 7. Security Monitoring

### Recommended Alerts

1. **Excessive Failed Login Attempts**
   - Threshold: >5 failures in 5 minutes
   - Action: Block IP, notify admin

2. **Large File Upload**
   - Threshold: >20 MB
   - Action: Log and review

3. **Unusual API Request Volume**
   - Threshold: >100 requests/minute per user
   - Action: Temporary rate limit

4. **Secret Access**
   - Trigger: Any Key Vault access
   - Action: Log and audit

5. **High Error Rate**
   - Threshold: >10% error rate
   - Action: Alert DevOps team

### Sample Azure Monitor Query

```kusto
// Detect potential attacks
AppRequests
| where TimeGenerated > ago(1h)
| where ResultCode >= 400
| summarize ErrorCount = count() by ClientIp, UserId
| where ErrorCount > 20
| order by ErrorCount desc
```

---

## Summary

**Current Security Posture**: 🔴 **NOT PRODUCTION READY**

**Critical Issues**:
1. No backend authentication validation
2. Secrets may be committed to Git (no `.gitignore`)
3. No backend file size validation
4. Plaintext passwords in localStorage
5. No rate limiting

**Before deploying to Azure, you MUST**:
1. ✅ Create `.gitignore` and check for leaked secrets
2. ✅ Enable Azure Static Web Apps authentication
3. ✅ Add backend user validation (`x-ms-client-principal`)
4. ✅ Move all secrets to Azure Key Vault
5. ✅ Add backend file size and content validation
6. ✅ Implement rate limiting
7. ✅ Remove local authentication in production builds
8. ✅ Configure CORS allowed origins

**Estimated Effort**: 2-3 days to fix critical issues + 1 week for comprehensive security hardening.
