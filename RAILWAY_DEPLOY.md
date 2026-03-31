# 🍁 Deploy to Railway — Step by Step Guide

Deploy this Express Entry app (FastAPI + React + PostgreSQL) **for free** on [Railway.app](https://railway.app).

**No code changes needed. Just follow these steps.**

---

## ⏱️ Total time: ~15 minutes

---

## What you will get

| Service | URL (after deploy) |
|---|---|
| ✅ Frontend (React app) | `https://YOUR-APP-frontend-production.up.railway.app` |
| ✅ Backend (FastAPI) | `https://YOUR-APP-production.up.railway.app` |
| ✅ Database (PostgreSQL) | Managed by Railway (internal, no URL needed) |

---

## Prerequisites

You need these installed on your computer:

**1. Node.js** (to install Railway CLI)
- Download from https://nodejs.org (LTS version)

**2. Railway CLI**
```bash
npm install -g @railway/cli
```

**3. A Railway account** (free)
- Sign up at https://railway.app using your GitHub account

---

## PART 1 — Deploy the Backend (FastAPI)

### Step 1 — Clone this repo

```bash
git clone https://github.com/Rahul150886/express_entry.git
cd express_entry
```

---

### Step 2 — Login to Railway

```bash
railway login
```

> This opens a browser. Click **"Login with GitHub"** and authorize Railway.

---

### Step 3 — Create a Railway project for the backend

Run this from the **root of the repo** (the `express_entry` folder):

```bash
railway init
```

You will see prompts:
- **"Create new project"** → press Enter ✅
- **"Project name"** → type `express-entry` and press Enter ✅

---

### Step 4 — Deploy the backend

```bash
railway up
```

> This uploads your code and builds the backend Docker image.
> It will print a **Build Logs URL** — open it in your browser to watch the build.
> Wait until you see: **"Deploy complete"**

---

### Step 5 — Add PostgreSQL database

```bash
railway add --plugin postgresql
```

> Railway creates a free PostgreSQL database and automatically connects it to your backend.
> You don't need to configure anything — `DATABASE_URL` is injected automatically.

---

### Step 6 — Set environment variables

```bash
railway variables set APP_ENV=production
railway variables set SECRET_KEY=change-this-to-a-long-random-string
railway variables set PORT=8000
```

> ⚠️ Change `SECRET_KEY` to something random, e.g. `MyS3cr3tK3y!Express2026`

---

### Step 7 — Get your backend URL

```bash
railway domain
```

> This prints your backend URL. **Copy it** — you will need it in Part 2.
> Example: `https://express-entry-production.up.railway.app`

---

### Step 8 — Verify backend is working

Open this in your browser (replace with your actual URL):

```
https://YOUR-BACKEND-URL/health
```

You should see:
```json
{"status": "healthy", "timestamp": "..."}
```

Also check the API docs:
```
https://YOUR-BACKEND-URL/docs
```

✅ **Backend is live!**

---

## PART 2 — Deploy the Frontend (React)

### Step 9 — Go to the frontend folder

```bash
cd frontend
```

> ⚠️ Make sure you are inside the `frontend` folder for all steps in Part 2.

---

### Step 10 — Create a new Railway project for the frontend

```bash
railway init
```

You will see prompts:
- **"Create new project"** → press Enter ✅
- **"Project name"** → type `express-entry-frontend` and press Enter ✅

---

### Step 11 — Set the backend URL

```bash
railway variables set BACKEND_URL=https://YOUR-BACKEND-URL-FROM-STEP-7
```

> ⚠️ Replace with the actual URL you copied in Step 7.
> Example:
> ```bash
> railway variables set BACKEND_URL=https://express-entry-production.up.railway.app
> ```

---

### Step 12 — Deploy the frontend

```bash
railway up
```

> Wait until you see: **"Deploy complete"**

---

### Step 13 — Get your frontend URL

```bash
railway domain
```

> Open this URL in your browser — you should see the app! 🎉

---

## PART 3 — Auto-deploy on code changes (Optional but Recommended)

Connect Railway to GitHub so it **deploys automatically on every `git push`** — no need to run `railway up` again.

### For the Backend:
1. Go to [railway.com](https://railway.com) → open **"express-entry"** project
2. Click the service → **Settings** tab
3. **Source** → **"Connect Repo"** → select your GitHub repo
4. **Root Directory** → set to `backend`
5. **Branch** → `main` → Save

### For the Frontend:
1. Go to [railway.com](https://railway.com) → open **"express-entry-frontend"** project
2. Click the service → **Settings** tab
3. **Source** → **"Connect Repo"** → select your GitHub repo
4. **Root Directory** → set to `frontend`
5. **Branch** → `main` → Save

After connecting, your workflow is just:
```bash
git add -A
git commit -m "my change"
git push
# Railway auto-builds and deploys 🚀
```

---

## All commands at a glance

```bash
# ── STEP 1: Clone ────────────────────────────────
git clone https://github.com/Rahul150886/express_entry.git
cd express_entry

# ── STEP 2-7: Backend ────────────────────────────
railway login
railway init                    # name it: express-entry
railway up                      # deploy backend
railway add --plugin postgresql # add database
railway variables set APP_ENV=production
railway variables set SECRET_KEY=change-this-to-something-random
railway variables set PORT=8000
railway domain                  # COPY this URL — needed for frontend

# ── STEP 9-13: Frontend ──────────────────────────
cd frontend
railway init                    # name it: express-entry-frontend
railway variables set BACKEND_URL=https://PASTE-BACKEND-URL-HERE
railway up                      # deploy frontend
railway domain                  # open this URL in browser ← your app!
```

---

## Troubleshooting

**"Application failed to respond" (502)**
- Wait 30 seconds and refresh — container may still be starting
- Check logs: `railway logs --tail 30` (from repo root for backend)
- Ensure `PORT=8000` is set: `railway variables`

**Frontend shows blank page or error**
- Check `BACKEND_URL` is set: `cd frontend && railway variables`
- Check frontend logs: `cd frontend && railway logs --tail 20`
- Confirm backend `/health` works first (Step 8)

**Database errors**
- Confirm you ran `railway add --plugin postgresql` (Step 5)
- Look for "Database tables ready" in logs: `railway logs --tail 50`

**Build fails**
- Backend commands must be run from `express_entry/` (repo root)
- Frontend commands must be run from `express_entry/frontend/`

---

## Optional: Enable AI features

The app works without these. Set them to enable AI chat, document review, and NOC matching:

```bash
# Run from repo root (backend project)
railway variables set AZURE_OPENAI_API_KEY=your-key
railway variables set AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
railway variables set AZURE_DOC_INTELLIGENCE_KEY=your-key
railway variables set AZURE_DOC_INTELLIGENCE_ENDPOINT=https://your-resource.cognitiveservices.azure.com
railway variables set SENDGRID_API_KEY=your-key
```
