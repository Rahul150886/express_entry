# 🚀 Complete FREE Deployment Guide - Backend + Frontend

## Quick Summary
Deploy your entire Express Entry project (Backend + Frontend + Database) **100% FREE** using Railway.app

- ✅ Backend (FastAPI) 
- ✅ Frontend (React/Vite)
- ✅ PostgreSQL Database
- ✅ Redis Cache
- **Total Cost: $0/month** (first $5 free, then pay-as-you-go starting at $5/month)

---

## 🎯 Step-by-Step Deployment

### Step 1: Install Railway CLI (Mac/Linux)
```bash
npm install -g @railway/cli
```

Or using Homebrew:
```bash
brew install railway
```

### Step 2: Login to Railway
```bash
railway login
```
This opens your browser automatically. Sign up with GitHub/GitLab (free).

### Step 3: Navigate to Your Project
```bash
cd /Users/dhruv.rajput/Downloads/express_entry
```

### Step 4: Initialize Railway Project
```bash
railway init
```

When asked:
- **Project name:** `express-entry`
- **Environment:** `production`

### Step 5: Add Services (Database & Cache)
```bash
# Add PostgreSQL
railway add
# Select "PostgreSQL" → Railway auto-configures it

# Add Redis
railway add
# Select "Redis" → Railway auto-configures it
```

### Step 6: Deploy Your Project
```bash
railway up
```

This will:
1. Deploy your backend (FastAPI on Port 8000)
2. Deploy your frontend (React on Port 5173)
3. Set up PostgreSQL database
4. Set up Redis cache
5. Generate public URLs for both

### Step 7: View Your Live App! 🎉
```bash
railway open
```

---

## 📝 Environment Variables Setup

After deployment, Railway creates these automatically:

### Auto-Generated Variables:
- `DATABASE_URL` - Your PostgreSQL connection
- `REDIS_URL` - Your Redis connection

### You Need to Add:
Go to Railway Dashboard → Your Project → Variables

Add these:
```
OPENAI_API_KEY=your-key-here
AZURE_STORAGE_ACCOUNT_NAME=your-account
AZURE_STORAGE_ACCOUNT_KEY=your-key
AZURE_DOCUMENT_INTELLIGENCE_KEY=your-key
AZURE_COGNITIVESERVICES_SPEECH_KEY=your-key
SECRET_KEY=your-secret-key-here
CORS_ORIGINS=["https://your-frontend-url.railway.app"]
```

---

## 📊 What You Get (Completely FREE)

| Component | Status |
|-----------|--------|
| Backend API | ✅ Deployed |
| Frontend App | ✅ Deployed |
| PostgreSQL DB | ✅ Deployed |
| Redis Cache | ✅ Deployed |
| SSL Certificate | ✅ Free |
| Custom Domain | ✅ Free |
| Monitoring | ✅ Free |

---

## 🔗 Access Your App

After deployment, you'll get URLs like:

- **Frontend:** `https://express-entry-frontend.railway.app`
- **Backend API:** `https://express-entry-backend.railway.app`
- **Railway Dashboard:** `https://railway.app/project/[your-project-id]`

---

## 🆘 Troubleshooting

### Problem: "Build failed"
```bash
# Check logs
railway logs

# Common fix: Update Python/Node versions in Procfile
```

### Problem: "Database connection error"
```bash
# View DATABASE_URL
railway variables

# Make sure it's set correctly
railway env:pull
```

### Problem: "Frontend showing blank page"
```bash
# Check if frontend build succeeded
railway logs --service frontend

# Make sure VITE_API_BASE_URL is set to your backend URL
```

### Problem: "Port already in use"
```bash
# Railway auto-assigns ports, shouldn't happen
# But if it does, restart:
railway restart
```

---

## 📱 Update Your Frontend API URL

In your `frontend/src` files, update API calls:

**Before:**
```javascript
const API_URL = 'http://localhost:8000/api';
```

**After (in production):**
```javascript
const API_URL = process.env.VITE_API_BASE_URL || 'https://your-backend.railway.app/api';
```

Or create `.env.production`:
```
VITE_API_BASE_URL=https://express-entry-backend.railway.app/api
```

---

## 🔄 Continuous Deployment (Auto-Deploy on Code Push)

### Option 1: GitHub/GitLab Integration
1. Push your code to GitHub/GitLab
2. Go to Railway Dashboard
3. Connect your repo
4. Auto-deploys on every push!

### Option 2: Manual Redeploy
```bash
# Make changes locally
git add .
git commit -m "Update"

# Redeploy
railway up
```

---

## 💾 Database Management

### Run Migrations
```bash
# Connect to your Railway database
railway shell

# Inside the shell, run migrations
cd backend
alembic upgrade head
```

### Backup Database
```bash
# Railway auto-backups daily
# But you can manually export:
railway db:backup
```

### View Database
```bash
# Connect to PostgreSQL
railway db:connect

# Or use Railway dashboard → PostgreSQL → Connect
```

---

## 🎓 Common Commands

```bash
# Check deployment status
railway status

# View live logs
railway logs

# View environment variables
railway variables

# Stop deployment
railway stop

# Restart services
railway restart

# Deploy again
railway up

# View public URLs
railway open

# Remove a service
railway remove <service-name>
```

---

## 🌐 Add Custom Domain (Optional)

1. Go to Railway Dashboard
2. Select your project
3. Go to "Domains"
4. Add your custom domain
5. Update DNS records (CNAME)
6. Done!

For free domain: Use **Freenom.com** (.ml, .ga, .cf, .tk domains are free)

---

## 💰 Pricing (After Free Tier)

Railway gives you **$5/month free** (plenty!), then:

| Resource | Cost |
|----------|------|
| Backend API | Included in free tier |
| PostgreSQL | Included in free tier |
| Redis | Included in free tier |
| Excess usage | $0.001/CPU/minute |

**Estimate:** Your project will stay free for a long time!

---

## ✅ Deployment Checklist

- [ ] Install Railway CLI: `npm install -g @railway/cli`
- [ ] Login: `railway login`
- [ ] Initialize: `railway init`
- [ ] Add PostgreSQL: `railway add` → PostgreSQL
- [ ] Add Redis: `railway add` → Redis
- [ ] Deploy: `railway up`
- [ ] Set environment variables
- [ ] Test frontend: Visit the URL
- [ ] Test backend: Visit `/docs` endpoint
- [ ] Update frontend API URL
- [ ] Run migrations: `alembic upgrade head`
- [ ] Celebrate! 🎉

---

## 🚀 You're Live!

Your entire project is now deployed for FREE with:
- PostgreSQL database
- Redis cache
- FastAPI backend
- React frontend
- SSL/HTTPS
- Custom domain support
- 24/7 uptime monitoring

**Total time to deployment: ~10 minutes!**

Need help? Railway docs: https://railway.app/docs

