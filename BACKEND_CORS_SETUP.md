# Backend CORS Configuration for Frontend Deployment

This guide covers setting up CORS (Cross-Origin Resource Sharing) on your FastAPI backend to allow requests from your deployed frontend.

---

## Current CORS Setup

Your backend (in `backend/api/main.py` and `backend/infrastructure/config.py`) should be configured to accept requests from your frontend.

---

## CORS Configuration by Deployment Scenario

### Scenario 1: Both Frontend & Backend on Same Railway Project (Recommended)

**Frontend URL:** `https://express-entry-production.up.railway.app`
**Backend URL:** `http://api:8000` (internal Railway networking)
**Nginx:** Proxies `/api/*` requests

**CORS Configuration:**
```python
# backend/infrastructure/config.py
CORS_ORIGINS = [
    "http://localhost:3000",  # Local development
    "http://localhost",        # Local production preview
    "https://express-entry-production.up.railway.app",  # Railway
]

# Or more permissively for testing:
CORS_ORIGINS = "*"  # Allow all origins (use only in development)
```

**Why:** Nginx proxies all requests, so the browser sees a same-origin request. However, for safety, allow the public domain explicitly.

---

### Scenario 2: Frontend on Vercel, Backend on Railway

**Frontend URL:** `https://your-app.vercel.app`
**Backend URL:** `https://express-entry-production.up.railway.app`

**CORS Configuration:**
```python
# backend/infrastructure/config.py
CORS_ORIGINS = [
    "http://localhost:3000",  # Local development
    "https://your-app.vercel.app",  # Vercel deployment
    "https://express-entry-production.up.railway.app",  # Also allow direct access
]
```

**Environment Variable (Production):**
```bash
CORS_ORIGINS="http://localhost:3000,https://your-app.vercel.app,https://express-entry-production.up.railway.app"
```

---

### Scenario 3: Frontend on Render, Backend on Railway

**Frontend URL:** `https://express-entry-frontend.onrender.com`
**Backend URL:** `https://express-entry-production.up.railway.app`

**CORS Configuration:**
```python
# backend/infrastructure/config.py
CORS_ORIGINS = [
    "http://localhost:3000",  # Local development
    "https://express-entry-frontend.onrender.com",  # Render deployment
    "https://express-entry-production.up.railway.app",  # Also allow direct access
]
```

**Environment Variable (Production):**
```bash
CORS_ORIGINS="http://localhost:3000,https://express-entry-frontend.onrender.com,https://express-entry-production.up.railway.app"
```

---

## Update Backend Configuration

Edit `backend/infrastructure/config.py`:

```python
import os
from functools import lru_cache

class Settings:
    # ...existing settings...
    
    # CORS Configuration
    CORS_ORIGINS: list = []
    
    def __init__(self):
        # Allow environment variable to override
        cors_env = os.getenv("CORS_ORIGINS", "")
        if cors_env:
            self.CORS_ORIGINS = [origin.strip() for origin in cors_env.split(",")]
        else:
            # Default CORS origins by environment
            env = os.getenv("APP_ENV", "development")
            if env == "production":
                self.CORS_ORIGINS = [
                    "https://express-entry-production.up.railway.app",
                    # Add deployed frontend URLs here:
                    # "https://your-app.vercel.app",
                    # "https://your-app.onrender.com",
                ]
            else:
                self.CORS_ORIGINS = [
                    "http://localhost:3000",
                    "http://localhost",
                    "http://127.0.0.1:3000",
                    "http://127.0.0.1",
                ]

@lru_cache()
def get_settings() -> Settings:
    return Settings()
```

---

## Apply CORS Middleware

Ensure your `backend/api/main.py` has CORS middleware configured:

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from infrastructure.config import get_settings

app = FastAPI(title="Express Entry API")
settings = get_settings()

# Apply CORS middleware
if settings.CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS if settings.CORS_ORIGINS != "*" else ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
```

---

## Test CORS Configuration

### From Frontend Console

```javascript
// Open browser console (F12) on your frontend
fetch('https://express-entry-production.up.railway.app/api/v1/health')
  .then(r => r.json())
  .then(d => console.log('CORS OK:', d))
  .catch(e => console.error('CORS Error:', e))
```

### Expected Response

```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Troubleshooting CORS Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `No 'Access-Control-Allow-Origin' header` | Frontend domain not in CORS_ORIGINS | Add frontend URL to CORS_ORIGINS |
| `Method not allowed` | CORS policy blocks method | Ensure `allow_methods=["*"]` |
| `Preflight request failed` | OPTIONS request blocked | Add OPTIONS to allowed methods |
| `Credentials not included` | Missing `allow_credentials=True` | Add `allow_credentials=True` |

---

## Environment Variables on Railway

Set these in the Railway dashboard or via CLI:

```bash
# Option 1: Allow specific origins
railway variable set CORS_ORIGINS="https://express-entry-production.up.railway.app,https://your-app.vercel.app"

# Option 2: Allow all origins (development only)
railway variable set CORS_ORIGINS="*"
```

---

## Security Best Practices

⚠️ **DO NOT** use `CORS_ORIGINS = "*"` in production.

✅ **DO** explicitly list only the frontend domains that should access your API:

```python
CORS_ORIGINS = [
    "https://express-entry-production.up.railway.app",
    "https://your-vercel-domain.vercel.app",
]
```

---

## Next Steps

1. Update `backend/infrastructure/config.py` with your CORS configuration
2. Redeploy backend to Railway: `railway up`
3. Test from frontend: F12 Console → verify network requests succeed
4. If CORS errors occur, check Railway logs: `railway logs --service api`
5. Adjust CORS_ORIGINS as needed for additional frontend deployments

