# PostgreSQL Database Setup for Express Entry

## 🚀 Complete Setup Process

### Step 1: Create PostgreSQL on Railway

1. **Open your Railway Project Dashboard:**
   ```
   https://railway.com/project/57b1b937-ce99-4533-a4a7-4281f0108dbf
   ```

2. **Click the "+" button** (appears in the top-right of Services section)

3. **From the menu, select "Database" → "PostgreSQL"**

4. **Railway automatically creates:**
   - PostgreSQL instance
   - Database named `railway`
   - User `postgres` with random password
   - Generates `DATABASE_URL` environment variable

---

### Step 2: Get Your Database Connection String

1. **In Railway Dashboard**, click on the **"PostgreSQL"** service (in left sidebar)

2. **Go to the "Variables" tab**

3. **Find and copy the `DATABASE_URL`**
   - Looks like: `postgresql://postgres:random_password@containers.railway.app:5432/railway`
   - This is your connection string!

---

### Step 3: Add DATABASE_URL to Your Backend Service

1. **Click on your Backend service** (Express Entry Backend)

2. **Go to "Variables" tab**

3. **Click "New Variable" button**

4. **Enter:**
   - **Key:** `DATABASE_URL`
   - **Value:** Paste the URL from Step 2

5. **Click "Add"**

---

### Step 4: Redeploy Backend

Railway will automatically detect the new variable and redeploy your backend.

**You should see in the logs:**
```
✅ Database tables initialised
```

---

## 📋 What Happens During Deployment

1. **App starts** → Reads `DATABASE_URL` environment variable
2. **Connects to PostgreSQL** → Establishes connection
3. **Runs migrations** → Creates all tables (users, applicants, documents, etc.)
4. **Serves requests** → Now ready to store data!

---

## ✅ How to Verify It Works

### Check Logs in Railway:

1. Click Backend service
2. Go to "Logs" tab
3. Look for:
   ```
   DATABASE_URL   : postgresql://postgres:...
   Database tables initialised ✓
   ```

### Test via API:

Once deployed, try creating a user:
```bash
curl -X POST https://your-backend-url/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "TestPassword123!"
  }'
```

If you get a response (not a 500 error), the database is working! ✅

---

## 🔧 Local Testing (Optional)

If you want to test locally before deploying:

```bash
# 1. Install PostgreSQL locally
# macOS:
brew install postgresql

# 2. Start PostgreSQL
brew services start postgresql

# 3. Create a local database
createdb express_entry

# 4. Set environment variable
export DATABASE_URL="postgresql://postgres:password@localhost:5432/express_entry"

# 5. Run migrations
cd backend
alembic upgrade head

# 6. Start the app
uvicorn api.main:app --reload
```

---

## 🆘 Troubleshooting

### Problem: "1/1 replicas never became healthy"
**Solution:** DATABASE_URL not set or invalid. Double-check:
1. PostgreSQL service exists in Railway
2. DATABASE_URL copied correctly
3. Backend service has the variable added
4. Redeploy after adding variable

### Problem: "Connection refused"
**Solution:** PostgreSQL service may be starting. Wait 2-3 minutes and redeploy.

### Problem: "Skipping DB init" in logs
**Solution:** DATABASE_URL is empty or has localhost. Fix:
1. Verify DATABASE_URL is set in Backend variables
2. Make sure it's not pointing to localhost
3. Redeploy

### Problem: "permission denied" error
**Solution:** Database user doesn't have permissions. Use Railway's auto-generated DATABASE_URL which has correct permissions.

---

## 📊 Database Schema

Your app creates these tables automatically:

- `users` - User accounts
- `applicants` - Express Entry profiles
- `language_tests` - IELTS/CELPIP scores
- `work_experiences` - Job history
- `education` - Degrees & credentials
- `documents` - Uploaded files
- `job_offer` - Job offers
- `draws` - EE draw history
- `notifications` - User notifications
- And more...

All managed by Alembic migrations in `backend/migrations/`

---

## 🎯 Next Steps

1. ✅ Add PostgreSQL to Railway
2. ✅ Copy DATABASE_URL
3. ✅ Add to Backend service variables
4. ✅ Wait for redeploy (2-5 minutes)
5. ✅ Check logs for "Database tables initialised"
6. 🚀 Your app is live with database!

**Ready?** Start with Step 1 above! Let me know if you get stuck.

