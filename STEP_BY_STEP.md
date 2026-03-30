# 🚀 DEPLOYMENT STEPS - Follow This!

## Phase 1: Setup (10 minutes)

### Step 1️⃣: Install Railway CLI
```bash
npm install -g @railway/cli
```
✅ Verify:
```bash
railway --version
```

### Step 2️⃣: Login to Railway
```bash
railway login
```
✅ Browser opens → Click "Continue with GitHub" or "GitLab"
✅ Confirm in terminal

---

## Phase 2: Initialize (5 minutes)

### Step 3️⃣: Navigate to Project
```bash
cd /Users/dhruv.rajput/Downloads/express_entry
```
✅ Confirm you see: backend/, frontend/, railway.json

### Step 4️⃣: Initialize Railway Project
```bash
railway init
```
✅ Project name: `express-entry` (or any name)
✅ Environment: `production`

---

## Phase 3: Add Services (3 minutes)

### Step 5️⃣: Add PostgreSQL Database
```bash
railway add
```
✅ Select: `PostgreSQL`
✅ Railway auto-configures it

### Step 6️⃣: Add Redis Cache
```bash
railway add
```
✅ Select: `Redis`
✅ Railway auto-configures it

---

## Phase 4: Deploy! (5-10 minutes)

### Step 7️⃣: Deploy Your Project
```bash
railway up
```

**WAIT!** This will:
- 📦 Build your backend
- 📦 Build your frontend
- 🗄️ Setup database
- ⚡ Setup cache
- 🌐 Deploy everything
- 📱 Generate URLs

**Takes 5-10 minutes for first deployment**

---

## Phase 5: Configuration (5 minutes)

### Step 8️⃣: View Your Live App
```bash
railway open
```
✅ Opens Railway dashboard
✅ You'll see your public URLs!

**Example URLs:**
- Frontend: `https://express-entry.railway.app`
- Backend: `https://express-entry-api.railway.app`

### Step 9️⃣: Set Environment Variables

In Railway dashboard:
1. Click your project
2. Go to "Variables"
3. Add these:

```
OPENAI_API_KEY=your-key
AZURE_STORAGE_ACCOUNT_NAME=your-name
AZURE_STORAGE_ACCOUNT_KEY=your-key
AZURE_DOCUMENT_INTELLIGENCE_KEY=your-key
AZURE_COGNITIVESERVICES_SPEECH_KEY=your-key
SECRET_KEY=generate-random-key
CORS_ORIGINS=https://your-frontend-url.railway.app
```

---

## Phase 6: Database Migrations (3 minutes)

### Step 🔟: Run Migrations

```bash
railway shell
```

Inside the container:
```bash
cd backend
alembic upgrade head
exit
```

✅ Database schema is now created!

---

## Phase 7: Testing (5 minutes)

### Step 1️⃣1️⃣: Test Your App

**Test Frontend:**
```
Visit: https://your-frontend-url.railway.app
```
✅ Should see your React app

**Test Backend:**
```
Visit: https://your-backend-url.railway.app/docs
```
✅ Should see FastAPI documentation

**Test API:**
```bash
curl https://your-backend-url.railway.app/api/health
```
✅ Should return `{"status": "ok"}`

---

## Phase 8: Monitoring (Optional)

### View Logs
```bash
railway logs
```

### Monitor Performance
```bash
railway status
```

### Check for Errors
```bash
railway logs --follow
```

---

## ✅ Complete Checklist

### Before Deployment
- [ ] Project downloaded & ready
- [ ] Backend code is ready
- [ ] Frontend code is ready
- [ ] Docker files exist (already there)

### Setup Phase
- [ ] Railway CLI installed
- [ ] Logged in to Railway
- [ ] Project initialized

### Deployment Phase
- [ ] PostgreSQL added
- [ ] Redis added
- [ ] `railway up` completed successfully
- [ ] App is live!

### Configuration Phase
- [ ] Environment variables added
- [ ] Database migrations run
- [ ] Frontend URL updated in code

### Testing Phase
- [ ] Frontend loads
- [ ] Backend API works
- [ ] Database is connected
- [ ] API keys are working

---

## 🎉 You're Done!

Your app is now:
- ✅ Live on the internet
- ✅ Running 24/7
- ✅ With a database
- ✅ With caching
- ✅ With SSL/HTTPS
- ✅ 100% FREE

---

## 📊 Total Time: ~40 minutes

| Phase | Time | Status |
|-------|------|--------|
| Setup | 10 min | ⏱️ Once only |
| Initialize | 5 min | ⏱️ Once only |
| Add Services | 3 min | ⏱️ Once only |
| Deploy | 10 min | ⏱️ First time (then 2 min) |
| Configure | 5 min | ⏱️ Once only |
| Migrations | 3 min | ⏱️ Once only |
| Testing | 5 min | ⏱️ Once only |
| **TOTAL** | **~40 min** | **✅ DONE!** |

---

## 🔄 Future Updates

After first deployment, updating is super easy:

```bash
# Make changes to your code
git add . && git commit -m "Update"

# Redeploy (takes ~2 minutes)
railway up
```

Your updated app is LIVE! 🚀

---

## 🆘 Need Help?

**Check logs:**
```bash
railway logs
```

**Restart:**
```bash
railway restart
```

**Status check:**
```bash
railway status
```

**Open dashboard:**
```bash
railway open
```

---

## 🎓 What You Now Have

```
┌─────────────────────────────────────┐
│   Your Live Production App!         │
│                                     │
│  ✅ Frontend (React/Vite)          │
│  ✅ Backend (FastAPI)              │
│  ✅ Database (PostgreSQL)          │
│  ✅ Cache (Redis)                  │
│  ✅ SSL Certificate (HTTPS)        │
│  ✅ Auto-scaling                   │
│  ✅ 24/7 Uptime                    │
│  ✅ Monitoring & Logs              │
│                                     │
│  💰 Cost: $0/month (FREE!)         │
│                                     │
│  🌐 URL: https://your-app.railway.app
└─────────────────────────────────────┘
```

---

## 🎯 TLDR (Too Long, Didn't Read)

```bash
npm install -g @railway/cli
railway login
cd /Users/dhruv.rajput/Downloads/express_entry
railway init
railway add  # Add PostgreSQL
railway add  # Add Redis
railway up
```

**Done!** App is live! 🎉

---

**Next:** Open your browser and visit the URL from `railway open`

**That's it!** You're officially deployed! 🚀✨

