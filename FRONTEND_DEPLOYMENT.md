# Express Entry Frontend Deployment Guide

This guide covers deploying your React frontend to **Railway**, **Render**, or **Vercel**.

---

## Backend API URL

Your backend is deployed at: **`https://express-entry-production.up.railway.app`**

**Important:** The frontend communicates with the backend via relative paths (`/api/v1/...`). When both frontend and backend are on the same domain (or via nginx proxy), this works seamlessly.

---

## Option 1: Deploy to Railway (Recommended)

Railway can host both frontend and backend in the same project, with nginx proxying requests.

### Step 1: Configure Environment

The frontend is configured with relative API paths, which work automatically when both services run under the same Railway project.

### Step 2: Update railway.json

If you want the frontend and backend on the same Railway project, your `railway.json` might look like:

```json
{
  "build": {
    "builder": "dockerfile",
    "dockerfile": "Dockerfile"
  },
  "deploy": {
    "numReplicas": 1,
    "restartPolicyMaxRetries": 3,
    "startupTimeout": 120
  }
}
```

However, for multi-service setup, see the full `railway.json` in the project root.

### Step 3: Push to Railway

```bash
cd /Users/dhruv.rajput/Downloads/express_entry
railway up
```

Railway will detect the `Dockerfile` in the `frontend/` directory (if using a multi-service setup) or use the root Dockerfile.

---

## Option 2: Deploy Frontend Separately to Render

### Step 1: Create render.yaml for Frontend

Create `/Users/dhruv.rajput/Downloads/express_entry/frontend/render.yaml`:

```yaml
services:
  - type: web
    name: express-entry-frontend
    env: node
    plan: free
    buildCommand: npm install && npm run build
    startCommand: npm run preview
    envVars:
      - key: VITE_API_URL
        value: https://express-entry-production.up.railway.app
    staticPublishPath: dist
```

### Step 2: Push to Render

```bash
cd /Users/dhruv.rajput/Downloads/express_entry/frontend
render deploy
```

### Step 3: Update Environment Variable

In `render.yaml`, set `VITE_API_URL` to point to your backend:

```yaml
envVars:
  - key: VITE_API_URL
    value: https://express-entry-production.up.railway.app
```

---

## Option 3: Deploy Frontend to Vercel (Best for React/Vite)

Vercel has first-class support for Vite and React apps.

### Step 1: Install Vercel CLI

```bash
npm install -g vercel
```

### Step 2: Deploy

```bash
cd /Users/dhruv.rajput/Downloads/express_entry/frontend
vercel
```

### Step 3: Configure Environment

When prompted or via Vercel dashboard:
- **Project Name:** `express-entry-frontend`
- **Environment:** `Node.js`
- **Build Command:** `npm run build`
- **Output Directory:** `dist`

Then, add an environment variable in the Vercel dashboard:
- **Name:** `VITE_API_URL`
- **Value:** `https://express-entry-production.up.railway.app`

### Step 4: Update vite.config.js

If deploying separately from the backend, update `vite.config.js` to use the environment variable:

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    react({
      jsxRuntime: 'automatic'
    })
  ],
  server: {
    port: 3000,
    proxy: {
      '/api': { 
        target: process.env.VITE_API_URL || 'http://localhost:8000', 
        changeOrigin: true 
      },
      '/ws': { 
        target: (process.env.VITE_API_URL || 'http://localhost:8000').replace('http', 'ws'),
        ws: true 
      }
    }
  }
})
```

Then update `src/services/api.js`:

```javascript
const apiBaseURL = import.meta.env.VITE_API_URL || ''

const api = axios.create({
  baseURL: apiBaseURL ? `${apiBaseURL}/api/v1` : '/api/v1',
  headers: { 'Content-Type': 'application/json' }
})
```

---

## Option 4: Deploy Both Backend & Frontend Together on Railway

This is the most seamless approach. Both services run in the same Railway project, with nginx in the frontend container proxying API requests.

### Architecture

```
Railway Project: express-entry-production
├── Backend Service (FastAPI on port 8000)
└── Frontend Service (Nginx serving React, port 80/3000)
    └── Nginx proxies /api/* to Backend
```

### Step 1: Update Nginx Config

Your `frontend/nginx.conf` already has this, but ensure the proxy target points to the backend service correctly:

```nginx
location /api/ {
    proxy_pass http://api:8000;  # "api" is the Railway service name
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

### Step 2: Use Multi-Service railway.json

Update the root `railway.json`:

```json
{
  "services": [
    {
      "name": "api",
      "build": {
        "builder": "dockerfile",
        "dockerfile": "Dockerfile"
      },
      "deploy": {
        "numReplicas": 1,
        "restartPolicyMaxRetries": 3,
        "startupTimeout": 120,
        "port": 8000
      }
    },
    {
      "name": "frontend",
      "build": {
        "builder": "dockerfile",
        "dockerfile": "frontend/Dockerfile"
      },
      "deploy": {
        "numReplicas": 1,
        "restartPolicyMaxRetries": 3,
        "startupTimeout": 120,
        "port": 80
      }
    }
  ]
}
```

### Step 3: Deploy

```bash
cd /Users/dhruv.rajput/Downloads/express_entry
railway up
```

Railway will detect the multi-service setup and deploy both services.

---

## Testing the Frontend

Once deployed, test the frontend:

1. **Open the frontend URL** in your browser
2. **Check the browser console** (F12 → Console) for any errors
3. **Test API calls** by navigating to a page that makes a request (e.g., Dashboard, Profile)
4. **Check Network tab** (F12 → Network) to verify `/api/v1/...` requests are reaching the backend

### Common Issues

| Issue | Solution |
|-------|----------|
| CORS errors | Ensure backend has `CORS_ORIGINS` set to include the frontend URL |
| API returns 404 | Ensure `baseURL: '/api/v1'` is correct in `src/services/api.js` |
| Blank page | Check browser console for build/runtime errors |
| Static assets 404 | Ensure `dist/` directory is properly built and served |

---

## Environment Variables

### For Development

Run locally with:

```bash
cd frontend
npm install
npm run dev
```

The vite dev server proxies `/api` to `http://localhost:8000` (backend).

### For Production (Separate Deployment)

If deploying frontend separately:

**Render:**
```yaml
envVars:
  - key: VITE_API_URL
    value: https://express-entry-production.up.railway.app
```

**Vercel:**
```
VITE_API_URL=https://express-entry-production.up.railway.app
```

**Railway (with nginx proxy):**
No extra config needed; nginx handles proxying.

---

## Recommended Setup

**For simplicity and cost:** Deploy both frontend and backend to Railway (Option 4)
- Single project management
- No CORS issues (same domain)
- Nginx handles routing transparently
- Cheaper than separate services

**For flexibility:** Deploy frontend to Vercel, backend on Railway (Option 3)
- Best React dev experience (Vercel Edge Functions, Analytics)
- Separate scaling/independent deployments
- Requires CORS configuration on backend

---

## Next Steps

1. Choose your deployment option (1-4)
2. Configure environment variables
3. Deploy and test API connectivity
4. Monitor logs for errors
5. Set up CI/CD (GitHub Actions, Railway auto-deploy on git push)

---

## Health Checks

After deployment, verify both services are healthy:

**Backend:**
```bash
curl https://express-entry-production.up.railway.app/health
# Expected: { "status": "healthy", ... }
```

**Frontend:**
```bash
curl https://your-frontend-url/
# Expected: HTML response with React app
```

---

## Support

For issues:
1. Check Railway/Render logs: `railway logs` or dashboard
2. Check browser console (F12) for frontend errors
3. Check API response codes in Network tab
4. Verify environment variables are set correctly
5. Ensure DATABASE_URL is set on backend

