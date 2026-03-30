# ⚡ 5-MINUTE DEPLOYMENT GUIDE

## For the Impatient (Just Copy & Paste!)

### Step 1: Install Railway (1 minute)
```bash
npm install -g @railway/cli
```

### Step 2: Login (1 minute)
```bash
railway login
```
Opens browser automatically. Click "Continue with GitHub/GitLab"

### Step 3: Deploy Everything (3 minutes)
```bash
cd /Users/dhruv.rajput/Downloads/express_entry
railway init
railway add
railway add
railway up
```

**That's it!** Your app is now live! 🎉

---

## What Happens Automatically?

✅ Backend (FastAPI) deployed
✅ Frontend (React) deployed  
✅ PostgreSQL database created
✅ Redis cache created
✅ SSL certificate generated
✅ Public URLs created

---

## Access Your App

After step 3, you'll see output like:

```
✨ Deployment complete!

Frontend: https://express-entry-frontend.railway.app
Backend:  https://express-entry-backend.railway.app
```

Visit these URLs! Your app is live!

---

## Common Issues

| Problem | Solution |
|---------|----------|
| "Build failed" | Check logs: `railway logs` |
| "Database error" | Run migrations: `railway shell` then `alembic upgrade head` |
| "Blank page" | Update VITE_API_BASE_URL to your backend URL |

---

## Add Environment Variables

```bash
railway variables
```

Add your API keys here:
- OPENAI_API_KEY
- AZURE_STORAGE_ACCOUNT_KEY
- etc.

---

## Keep Deploying

Every time you update code:
```bash
railway up
```

Done! Updated version is live.

---

## Need Help?

```bash
railway status          # Check deployment
railway logs            # View errors
railway open            # Open dashboard
railway restart         # Restart services
```

---

## That's ALL you need to know! 🚀

You now have a production-grade deployment for FREE.

No configuration files, no Git setup, no complicated stuff.

Just run `railway up` and you're done!

**Your app is live in 5 minutes!** ⚡

