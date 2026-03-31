# 🚀 Deploy to Railway — Step by Step

Deploy this full-stack app (FastAPI backend + React frontend + PostgreSQL) on [Railway](https://railway.app) **for free**.

---

## What you'll deploy

| Service | Tech | URL after deploy |
|---|---|---|
| **Backend** | FastAPI + Uvicorn | `https://your-backend.up.railway.app` |
| **Frontend** | React + Nginx | `https://your-frontend.up.railway.app` |
| **Database** | PostgreSQL | Managed by Railway (internal) |

---

## Prerequisites

- [Railway account](https://railway.app) (free)
- [Railway CLI](https://docs.railway.app/guides/cli) installed:
  ```bash
  npm install -g @railway/cli
  # or on macOS:
  brew install railway
  ```
- Your own fork/clone of this repo pushed to GitHub

---

## Step 1 — Fork & clone this repo

```bash
git clone https://github.com/YOUR_USERNAME/express_entry.git
cd express_entry
```

---

## Step 2 — Login to Railway CLI

```bash
railway login
```

This opens a browser — log in with GitHub.

---

## Step 3 — Deploy the Backend

### 3a. Create a Railway project for the backend

```bash
cd express_entry   # repo root
railway init
```

- Select **"Create new project"**
- Name it: `express-entry`

### 3b. Deploy backend

```bash
railway up
```

Railway will build using `backend/Dockerfile`.  
Wait for it to finish — you'll see a build log URL.

### 3c. Add PostgreSQL database

```bash
railway add --plugin postgresql
```

This creates a managed Postgres instance. Railway automatically injects `DATABASE_URL` into your service — no manual config needed.

### 3d. Set required environment variables

```bash
railway variables set APP_ENV=production
railway variables set SECRET_KEY=your-super-secret-key-change-this
railway variables set PORT=8000
```

> **Optional** (AI features — app works without these):
> ```bash
> railway variables set AZURE_OPENAI_API_KEY=your-key
> railway variables set AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
> railway variables set AZURE_DOC_INTELLIGENCE_KEY=your-key
> railway variables set AZURE_DOC_INTELLIGENCE_ENDPOINT=https://your-resource.cognitiveservices.azure.com
> railway variables set SENDGRID_API_KEY=your-key
> ```

### 3e. Expose the backend and get its URL

```bash
railway domain
```

Note your backend URL — you'll need it in Step 4.  
Example: `https://express-entry-production.up.railway.app`

### 3f. Verify backend is working

```bash
curl https://express-entry-production.up.railway.app/health
# Expected: {"status":"healthy","timestamp":"..."}

# Also check API docs:
# https://express-entry-production.up.railway.app/docs
```

---

## Step 4 — Deploy the Frontend

### 4a. Create a separate Railway project for the frontend

```bash
cd frontend
railway init
```

- Select **"Create new project"**
- Name it: `express-entry-frontend`

### 4b. Set the backend URL

```bash
railway variables set BACKEND_URL=https://express-entry-production.up.railway.app
```

> Replace with your actual backend URL from Step 3e.

### 4c. Deploy frontend

```bash
railway up
```

### 4d. Get the frontend URL

```bash
railway domain
```

Example: `https://express-entry-frontend-production.up.railway.app`

### 4e. Verify frontend is working

```bash
curl -s -o /dev/null -w "%{http_code}" https://express-entry-frontend-production.up.railway.app
# Expected: 200
```

Open the URL in your browser — you should see the app! 🎉

---

## Step 5 — Connect GitHub for Auto-Deploy (Recommended)

Instead of running `railway up` every time you make a change, connect Railway to GitHub so it deploys automatically on every `git push`.

### For the Backend service:
1. Go to [railway.com](https://railway.com) → open **"express-entry"** project
2. Click the service → **Settings** tab
3. Under **Source** → click **"Connect Repo"**
4. Select your GitHub repo
5. Set **Root Directory** → `backend`
6. Set **Branch** → `main`

### For the Frontend service:
1. Go to [railway.com](https://railway.com) → open **"express-entry-frontend"** project
2. Click the service → **Settings** tab
3. Under **Source** → click **"Connect Repo"**
4. Select your GitHub repo
5. Set **Root Directory** → `frontend`
6. Set **Branch** → `main`

After this, your workflow is just:
```bash
git add -A
git commit -m "your change"
git push
# Railway auto-builds and deploys both services 🚀
```

---

## Architecture on Railway

```
User Browser
     │
     ▼
┌─────────────────────────────┐
│  Frontend (nginx)           │  https://your-frontend.up.railway.app
│  - Serves React SPA         │
│  - Proxies /api/ → Backend  │
└──────────────┬──────────────┘
               │ HTTPS proxy
               ▼
┌─────────────────────────────┐
│  Backend (FastAPI)          │  https://your-backend.up.railway.app
│  - REST API on $PORT        │
│  - Connects to PostgreSQL   │
└──────────────┬──────────────┘
               │ Internal
               ▼
┌─────────────────────────────┐
│  PostgreSQL (Railway Plugin)│  Internal only (not exposed)
└─────────────────────────────┘
```

---

## Key Files Changed for Railway

| File | What changed |
|---|---|
| `backend/Dockerfile` | Use `${PORT:-8000}` instead of hardcoded `8000` |
| `backend/infrastructure/config.py` | Read `DATABASE_URL` from env, convert to asyncpg format |
| `backend/infrastructure/persistence/database.py` | Use `async_database_url` property |
| `frontend/Dockerfile` | Use `docker-entrypoint.sh` instead of static nginx config |
| `frontend/docker-entrypoint.sh` | Generates nginx config at runtime using `$PORT` and `$BACKEND_URL` |
| `railway.json` | Railway config for backend (port, restart policy) |
| `frontend/railway.json` | Railway config for frontend |

---

## Troubleshooting

### Backend returns 502
- Wait 30 seconds — container may still be starting
- Check logs: `railway logs --tail 50` (from repo root)
- Make sure `PORT` is set: `railway variables set PORT=8000`

### Frontend returns 502
- Check `BACKEND_URL` is set correctly: `railway variables` (from frontend dir)
- Check frontend logs: `cd frontend && railway logs --tail 20`

### Database errors
- Make sure you ran `railway add --plugin postgresql`
- Railway auto-injects `DATABASE_URL` — no manual setting needed
- Check logs for "Database tables ready" message

### Build fails
- Check you're in the right directory (`repo root` for backend, `frontend/` for frontend)
- Check build logs at the URL printed during `railway up`

---

## URLs Summary

After deployment, bookmark these:

| URL | Purpose |
|---|---|
| `https://your-frontend.up.railway.app` | The app (open this in browser) |
| `https://your-backend.up.railway.app/docs` | API documentation (Swagger UI) |
| `https://your-backend.up.railway.app/health` | Backend health check |
