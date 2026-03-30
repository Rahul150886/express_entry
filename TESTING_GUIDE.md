# Express Entry - Frontend & Backend Integration Testing Guide

This guide helps you verify that your frontend and backend are properly connected and working together.

---

## Table of Contents

1. [Local Testing](#local-testing)
2. [Deployed Testing](#deployed-testing)
3. [Common Issues & Troubleshooting](#common-issues--troubleshooting)
4. [Network Inspection](#network-inspection)

---

## Local Testing

### Start Backend Locally

```bash
cd /Users/dhruv.rajput/Downloads/express_entry/backend

# Install dependencies
pip install -r requirements.txt

# Set environment variables
export DATABASE_URL="postgresql+asyncpg://user:password@localhost/express_entry"
export APP_ENV="development"
export DEBUG="True"

# Run FastAPI server
python -m uvicorn api.main:app --reload --host 0.0.0.0 --port 8000
```

**Expected output:**
```
INFO:     Uvicorn running on http://0.0.0.0:8000
```

### Start Frontend Locally

In a new terminal:

```bash
cd /Users/dhruv.rajput/Downloads/express_entry/frontend

# Install dependencies
npm install

# Start dev server
npm run dev
```

**Expected output:**
```
  ➜  Local:   http://localhost:3000/
  ➜  press h to show help
```

### Test API Connectivity

**Option 1: Browser Console**

1. Open `http://localhost:3000` in your browser
2. Open Developer Tools: **F12** → **Console** tab
3. Paste and run:

```javascript
// Test backend health
fetch('/api/v1/health')
  .then(r => r.json())
  .then(d => console.log('✅ Health check:', d))
  .catch(e => console.error('❌ Error:', e.message))
```

**Expected response:**
```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

**Option 2: Network Tab**

1. Open **F12** → **Network** tab
2. Navigate to a page that makes API calls (e.g., Dashboard, Profile)
3. Look for requests like:
   - `http://localhost:8000/api/v1/users/me` → Status **200**
   - `http://localhost:8000/api/v1/documents` → Status **200**
4. If requests fail, check the Response tab for error details

**Option 3: Direct curl**

```bash
# Test backend directly
curl -X GET http://localhost:8000/health

# Test via dev server proxy
curl -X GET http://localhost:3000/api/v1/health
```

---

## Deployed Testing

### Backend Health Check

```bash
# Check backend is running
curl https://express-entry-production.up.railway.app/health

# Expected output:
# {
#   "status": "healthy",
#   "database": "connected",
#   "timestamp": "2024-01-15T10:30:00Z"
# }
```

### Frontend Deployment Verification

Once frontend is deployed, test it:

**Option 1: Browser Console**

1. Open your deployed frontend URL (e.g., `https://your-app.vercel.app`)
2. Open **F12** → **Console**
3. Paste:

```javascript
// If backend is on same domain (Railway with nginx):
fetch('/api/v1/health')
  .then(r => r.json())
  .then(d => console.log('✅ Backend OK:', d))
  .catch(e => console.error('❌ CORS/Network Error:', e))

// If backend is on different domain:
fetch('https://express-entry-production.up.railway.app/api/v1/health')
  .then(r => r.json())
  .then(d => console.log('✅ Backend OK:', d))
  .catch(e => console.error('❌ CORS Error:', e))
```

**Option 2: Check Network Requests**

1. Navigate to a page with API calls (Dashboard, Profile, etc.)
2. Open **F12** → **Network** tab
3. Verify requests like `/api/v1/...` return status **200**
4. If status is **0** or request is blocked, check:
   - CORS headers in Response
   - Exact request URL in Request headers

---

## Common Issues & Troubleshooting

### Issue 1: "No 'Access-Control-Allow-Origin' header"

**Symptom:**
```
Access to XMLHttpRequest at 'https://express-entry-production.up.railway.app/api/v1/...' 
from origin 'https://your-app.vercel.app' has been blocked by CORS policy
```

**Solution:**

1. Add frontend URL to backend CORS configuration:

```python
# backend/infrastructure/config.py
CORS_ORIGINS = [
    "https://your-app.vercel.app",
    "https://express-entry-production.up.railway.app",
]
```

2. Set environment variable on Railway:

```bash
railway variable set CORS_ORIGINS="https://your-app.vercel.app,https://express-entry-production.up.railway.app"
```

3. Redeploy backend:

```bash
cd /Users/dhruv.rajput/Downloads/express_entry
railway up
```

4. Wait for deployment (2-3 minutes) and test again

---

### Issue 2: "ERR_NAME_NOT_RESOLVED" or "Failed to fetch"

**Symptom:**
```
TypeError: Failed to fetch
```

**Cause:** Frontend cannot reach backend (network/DNS issue)

**Solution:**

1. **Verify backend URL is correct:**
   - Railway dashboard → Copy exact deployment URL
   - Check in browser: paste URL directly, should return JSON

2. **Check if frontend is setting wrong URL:**
   ```javascript
   // In browser console:
   console.log(import.meta.env.VITE_API_URL)
   ```
   Should show your backend URL or empty (for same-domain)

3. **If deploying on separate domains, update vite.config.js:**
   ```javascript
   proxy: {
     '/api': { 
       target: process.env.VITE_API_URL || 'http://localhost:8000',
       changeOrigin: true 
     }
   }
   ```

4. **If on Railway with nginx, verify nginx config:**
   ```nginx
   location /api/ {
       proxy_pass http://api:8000;  # "api" must match service name
   }
   ```

---

### Issue 3: Request returns 404

**Symptom:**
```
GET /api/v1/health 404
```

**Cause:** Backend endpoint doesn't exist or API prefix is wrong

**Solution:**

1. Verify endpoint exists in backend:
   ```bash
   grep -r "@app.get" /Users/dhruv.rajput/Downloads/express_entry/backend/api/
   ```

2. Verify API prefix `/api/v1` matches:
   ```python
   # In src/services/api.js
   baseURL: '/api/v1'  # Must match
   
   # In backend, endpoints should be:
   @app.get("/health")  # Accessed as /api/v1/health
   ```

3. Check backend logs:
   ```bash
   railway logs --service api
   ```

---

### Issue 4: 401 Unauthorized (authentication fails)

**Symptom:**
```
GET /api/v1/users/me 401 Unauthorized
```

**Cause:** No authentication token or token is invalid

**Solution:**

1. **For unauthenticated endpoints**, they should be marked:
   ```python
   @app.get("/health")  # No auth required
   async def health():
       return {"status": "healthy"}
   ```

2. **For authenticated endpoints**, frontend must include token:
   ```javascript
   // In src/services/api.js
   api.interceptors.request.use(config => {
     const token = localStorage.getItem('access_token')
     if (token) config.headers.Authorization = `Bearer ${token}`
     return config
   })
   ```

3. **First, login to get token:**
   - Navigate to login page
   - Enter credentials
   - Check Console: `localStorage.access_token` should exist
   - Then try other endpoints

---

### Issue 5: Blank page or "Cannot find module"

**Symptom:**
- Frontend loads but shows blank page
- Console shows: `Cannot find module 'react'` or similar

**Solution:**

1. **Rebuild frontend:**
   ```bash
   cd /Users/dhruv.rajput/Downloads/express_entry/frontend
   rm -rf node_modules dist
   npm install
   npm run build
   ```

2. **Check build output for errors:**
   ```bash
   npm run build 2>&1 | tail -50
   ```

3. **Redeploy to platform (Railway/Vercel/Render)**

---

### Issue 6: "WebSocket connection failed"

**Symptom:**
```
WebSocket connection to 'ws://...' failed
```

**Cause:** WebSocket proxy not configured

**Solution:**

1. **Update nginx.conf** (if using Railway with nginx):
   ```nginx
   location /ws/ {
       proxy_pass http://api:8000;
       proxy_http_version 1.1;
       proxy_set_header Upgrade $http_upgrade;
       proxy_set_header Connection "Upgrade";
   }
   ```

2. **If frontend is separate, update API base URL:**
   ```javascript
   // In src/services/api.js
   const apiBaseURL = import.meta.env.VITE_API_URL || ''
   const wsURL = (apiBaseURL || window.location.origin)
     .replace('https://', 'wss://')
     .replace('http://', 'ws://')
   ```

3. **Redeploy and test:**
   ```bash
   # In console
   const ws = new WebSocket('wss://your-backend-url/ws')
   ws.onopen = () => console.log('✅ WebSocket connected')
   ```

---

## Network Inspection

### Using Browser DevTools

**F12 → Network Tab:**

1. Filter by XHR (XMLHttpRequest) to see only API calls
2. For each request, check:
   - **Status**: Should be 200, 201, etc. (not 4xx, 5xx)
   - **Method**: GET, POST, etc.
   - **URL**: Should match your backend
   - **Headers**: Check `Authorization`, `Content-Type`
   - **Response**: Check for error messages

**F12 → Console Tab:**

```javascript
// Log all XHR requests
const originalFetch = window.fetch;
window.fetch = function(...args) {
  console.log('📤 Fetch:', args[0]);
  return originalFetch.apply(this, args).then(r => {
    console.log('📥 Response:', r.status, r.url);
    return r;
  });
};
```

### Using curl

```bash
# Test authentication
curl -X POST https://express-entry-production.up.railway.app/api/v1/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'

# Test with token
TOKEN="your-token-here"
curl -X GET https://express-entry-production.up.railway.app/api/v1/users/me \
  -H "Authorization: Bearer $TOKEN"
```

---

## Test Checklist

Use this checklist to verify everything works:

- [ ] Backend deployed to Railway (status: running)
- [ ] Backend health check returns 200: `curl https://express-entry-production.up.railway.app/health`
- [ ] Frontend built successfully: `npm run build` completes without errors
- [ ] Frontend deployed to Railway/Vercel/Render (status: running)
- [ ] Frontend loads in browser without errors (F12 Console: no red errors)
- [ ] Frontend can reach backend (F12 Console: `fetch('/api/v1/health')` returns data)
- [ ] Login works (user can authenticate and token is stored)
- [ ] Protected routes work (authenticated endpoints return data)
- [ ] API calls display data correctly (Dashboard, Profile, etc.)
- [ ] No CORS errors in Console
- [ ] No 404 errors in Network tab
- [ ] No 5xx errors in backend logs

---

## Support & Debugging

**Check Logs:**

```bash
# Backend logs
railway logs --service api

# Frontend logs (if using Railway)
railway logs --service frontend

# Vercel logs (if deployed there)
vercel logs --prod
```

**Enable Debug Mode:**

```bash
# Frontend
export VITE_DEBUG=true

# Backend
export DEBUG=True
```

**Ask for Help:**

Include:
1. Frontend URL you're testing
2. Backend URL
3. Exact error message from Console
4. Network tab screenshot showing failed request
5. Backend logs from `railway logs`

