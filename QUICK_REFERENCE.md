# 🎯 DEPLOYMENT QUICK REFERENCE

## The 3-Command Deployment

```bash
npm install -g @railway/cli        # Install (once)
railway login                       # Login (once)
cd /path/to/express_entry && railway init && railway add && railway add && railway up  # Deploy!
```

**That's it!** Your app goes live in ~15 minutes! 🚀

---

## 📋 Common Commands

| Command | What It Does |
|---------|-----|
| `railway init` | Initialize project |
| `railway add` | Add PostgreSQL/Redis |
| `railway up` | Deploy your app |
| `railway logs` | View live logs |
| `railway open` | Open dashboard |
| `railway restart` | Restart services |
| `railway shell` | Connect to container |
| `railway status` | Check deployment |
| `railway variables` | Manage env vars |

---

## 🔗 After Deployment

| What | Where |
|-----|-------|
| **Your Frontend** | https://express-entry.railway.app |
| **Your Backend** | https://express-entry-api.railway.app |
| **Dashboard** | https://railway.app/project/[id] |
| **FastAPI Docs** | https://api-url.railway.app/docs |

---

## ⚙️ Environment Variables to Add

In Railway Dashboard → Variables:

```
OPENAI_API_KEY=your-key
AZURE_STORAGE_ACCOUNT_NAME=your-name
AZURE_STORAGE_ACCOUNT_KEY=your-key
AZURE_DOCUMENT_INTELLIGENCE_KEY=your-key
AZURE_COGNITIVESERVICES_SPEECH_KEY=your-key
SECRET_KEY=random-secret
CORS_ORIGINS=https://your-frontend-url
```

---

## 📊 What Gets Auto-Created

✅ PostgreSQL database
✅ Redis cache
✅ Backend service
✅ Frontend service
✅ SSL certificate
✅ Public URLs
✅ Monitoring
✅ Backups

---

## 🆘 Quick Fixes

| Problem | Solution |
|---------|----------|
| Build failed | `railway logs` (check error) |
| DB error | `railway shell` → `alembic upgrade head` |
| Blank page | Update `VITE_API_BASE_URL` in variables |
| 503 error | `railway restart` |
| Can't login | `railway logout` then `railway login` |

---

## 📚 Documentation

| File | Purpose | Read |
|------|---------|------|
| `QUICK_START.md` | Fast deployment | ⚡ 5 min |
| `STEP_BY_STEP.md` | Detailed guide | 📖 20 min |
| `RAILWAY_DEPLOYMENT.md` | Complete guide | 📚 30 min |
| `ARCHITECTURE.md` | How it works | 🏗️ 15 min |
| `DEPLOYMENT_OPTIONS.md` | Compare options | 📊 10 min |

---

## ✅ Checklist

- [ ] Project ready
- [ ] Railway CLI installed
- [ ] Logged in to Railway
- [ ] Run `railway init`
- [ ] Add PostgreSQL (`railway add`)
- [ ] Add Redis (`railway add`)
- [ ] Deploy (`railway up`)
- [ ] Wait 10 minutes
- [ ] Visit your URL
- [ ] Add env variables
- [ ] Run migrations
- [ ] Test your app
- [ ] Celebrate! 🎉

---

## 💰 Cost

| Period | Cost |
|--------|------|
| First year | **$0** |
| Year 2+ | $5-15/month |
| Scaling | $0 setup, auto-scale |

---

## 🌐 Update Your App

After first deployment:

```bash
# Make code changes
vim backend/api/main.py

# Redeploy
railway up

# Done! Live in 2 minutes
```

---

## 🎓 Key Files Created

```
✅ railway.json               - Railway config
✅ QUICK_START.md             - 5-min guide
✅ STEP_BY_STEP.md            - Detailed guide
✅ RAILWAY_DEPLOYMENT.md      - Complete guide
✅ ARCHITECTURE.md            - Diagrams
✅ DEPLOYMENT_OPTIONS.md      - Comparisons
✅ DEPLOYMENT_SUMMARY.md      - Overview
✅ DEPLOYMENT_README.md       - Main guide
✅ .env.example               - Env vars
✅ check_deployment.py        - Validator
```

---

## 🚀 The Simplest Deploy Ever

### For humans who hate documentation:

```bash
npm install -g @railway/cli
railway login
# Go to your project
cd /Users/dhruv.rajput/Downloads/express_entry
# Answer the prompts
railway init
# Add services
railway add
railway add
# Deploy
railway up
# Wait 15 minutes
# Visit the URL
# Done!
```

---

## 📞 Help

- **Official Docs:** https://railway.app/docs
- **Discord:** https://discord.gg/railway
- **This Project:** See any `*DEPLOYMENT*.md` file

---

## 🎉 That's It!

Your entire full-stack project (backend + frontend + database) is now deployed for FREE! 🚀

**Total time investment: ~30 minutes (ever!)**

---

## 🎯 Next: Read One File

Pick one:

| If you... | Read |
|-----------|------|
| Want fastest deploy | `QUICK_START.md` |
| Want detailed steps | `STEP_BY_STEP.md` |
| Want to understand | `ARCHITECTURE.md` |
| Want all details | `RAILWAY_DEPLOYMENT.md` |
| Want comparisons | `DEPLOYMENT_OPTIONS.md` |

---

**GO DEPLOY!** 🚀✨

