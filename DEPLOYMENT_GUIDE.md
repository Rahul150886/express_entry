# Free Deployment Guide for Express Entry

## Quick Start with Render.com (Recommended)

### Step 1: Push to GitLab
```bash
git add .
git commit -m "Add deployment configuration"
git push origin main
```

### Step 2: Connect to Render
1. Go to https://render.com
2. Sign up with GitHub/GitLab
3. Click "New +" → "Web Service"
4. Connect your GitLab repository
5. Fill in the details:
   - **Name:** express-entry-backend
   - **Environment:** Python 3
   - **Build Command:** `pip install -r backend/requirements.txt`
   - **Start Command:** `cd backend && uvicorn api.main:app --host 0.0.0.0 --port 8000`
   - **Plan:** Free

### Step 3: Set Environment Variables in Render
Go to Environment in your Render dashboard and add:
```
DATABASE_URL=postgresql://...  # Will be auto-generated
REDIS_URL=redis://...          # Will be auto-generated
```

### Step 4: Deploy Frontend (Separate Service)
1. Create another Web Service in Render
2. Use the same repository
3. Build Command: `cd frontend && npm install && npm run build`
4. Static Site option or use Docker

---

## Alternative: Use Vercel + Railway

### Frontend on Vercel (Free)
```bash
npm install -g vercel
vercel
```
- Follow prompts
- Automatic deployments on git push

### Backend on Railway (Free Tier with $5 credit)
```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Init and deploy
railway init
railway up
```

---

## Environment Variables Needed

Create a `.env.production` file:
```
DATABASE_URL=postgres://user:pass@host:port/db
REDIS_URL=redis://user:pass@host:port
OPENAI_API_KEY=your-key
AZURE_STORAGE_KEY=your-key
AZURE_DOCUMENT_INTELLIGENCE_KEY=your-key
CORS_ORIGINS=https://your-domain.com
```

---

## Monitoring & Logs

### Render Dashboard
- https://dashboard.render.com
- View logs in real-time
- Monitor performance

### Command Line
```bash
# Check deployment status
render logs --service=express-entry-backend

# Tail live logs
render logs --service=express-entry-backend --tail
```

---

## Custom Domain (Free)

### On Render
1. Go to Service Settings
2. Custom Domain → Add custom domain
3. Point your DNS records (CNAME/A record)

### Using Freenom (Free Domains)
- https://www.freenom.com
- Get a free .ml, .ga, .cf, or .tk domain
- Add to your Render service

---

## Cost Breakdown (Monthly)

| Service | Cost | Specs |
|---------|------|-------|
| Render Web (Backend) | Free | 0.5GB RAM, 0.5 CPU |
| Render Database | Free | 100 MB PostgreSQL |
| Render Redis | Free | 25 MB Redis |
| Vercel Frontend | Free | Unlimited bandwidth |
| **Total** | **$0** | ✅ |

---

## Troubleshooting

### Deployment Fails
```bash
# Check logs
render logs --service=express-entry-backend

# Common issues:
# 1. Missing environment variables
# 2. Port not exposed (must be 8000)
# 3. Wrong start command
```

### Database Connection Issues
```bash
# Test database connection
psql $DATABASE_URL

# Check migrations
cd backend && alembic upgrade head
```

### Frontend 404 Errors
- Ensure nginx.conf has rewrite rule
- Check build output in Render logs
- Verify dist/ folder exists

---

## Auto-Deploy on Git Push

### GitLab CI/CD Setup
1. Create `.gitlab-ci.yml` ✅ (Already created)
2. In GitLab: Settings → CI/CD → Variables
3. Add: `RENDER_DEPLOY_HOOK` = Your Render webhook URL
4. Get webhook URL from Render: Settings → Deploy Hook

### GitHub Actions (Alternative)
Create `.github/workflows/deploy.yml`:
```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to Render
        run: curl ${{ secrets.RENDER_DEPLOY_HOOK }}
```

---

## Next Steps

1. ✅ Push code to GitLab
2. ✅ Sign up for Render (free account)
3. ✅ Connect your repository
4. ✅ Configure environment variables
5. ✅ Deploy!

Your app will be live at: `https://express-entry-backend.onrender.com`

Questions? Check Render docs: https://render.com/docs
