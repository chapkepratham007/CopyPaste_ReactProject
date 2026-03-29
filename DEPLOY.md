# Deploy CopyPaste App to Render

This guide walks you through deploying the CopyPaste app (full-stack with backend + frontend) to Render.com.

## Architecture

- **Backend (API)**: Node.js + Express + SQLite (runs on Render Web Service)
- **Frontend**: React + Vite (runs on Render Static Site)
- **Storage**: 10GB persistent disk for SQLite DB and file uploads

## Prerequisites

1. [Render.com](https://render.com) account (free tier available)
2. [GitHub](https://github.com) account
3. Your code pushed to a GitHub repository

## Step 1: Push Code to GitHub

```bash
# Initialize git if not already done
git init

# Add all files
git add .

# Commit
git commit -m "Production ready for Render deployment"

# Add your GitHub repo as remote
git remote add origin https://github.com/YOUR_USERNAME/copypaste-app.git

# Push
git push -u origin main
```

## Step 2: Deploy to Render

### Option A: Using render.yaml (Blueprint)

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **"New +"** → **"Blueprint"**
3. Connect your GitHub repository
4. Render will automatically detect `render.yaml` and create both services
5. Click **"Apply"**

### Option B: Manual Setup

If Blueprint doesn't work, create services manually:

#### Create Backend Service

1. Click **"New +"** → **"Web Service"**
2. Connect your GitHub repo
3. Configure:
   - **Name**: `copypaste-api`
   - **Runtime**: `Node`
   - **Build Command**: `cd server && npm ci`
   - **Start Command**: `cd server && npm start`
   - **Plan**: Standard (needed for persistent disk)

4. Click **"Advanced"** and add Environment Variables:
   ```
   NODE_ENV=production
   PORT=10000
   DB_PATH=/opt/render/project/.data/db.sqlite
   UPLOAD_DIR=/opt/render/project/.data/uploads
   CORS_ORIGIN=https://copypaste-web.onrender.com (your frontend URL, update after creating frontend)
   RATE_LIMIT_WINDOW_MS=900000
   RATE_LIMIT_MAX_REQUESTS=100
   ```

5. Add **Disk**:
   - **Name**: `copypaste-data`
   - **Mount Path**: `/opt/render/project/.data`
   - **Size**: 10 GB

6. Click **"Create Web Service"**

#### Create Frontend Service

1. Click **"New +"** → **"Static Site"**
2. Connect your GitHub repo
3. Configure:
   - **Name**: `copypaste-web`
   - **Build Command**: `cd web && npm ci && npm run build`
   - **Publish Directory**: `web/dist`

4. Add Environment Variable:
   ```
   VITE_API_BASE=https://copypaste-api.onrender.com (your backend URL)
   ```

5. Click **"Create Static Site"**

## Step 3: Update CORS (if using manual setup)

After both services are created:

1. Go to your **backend service** settings
2. Update `CORS_ORIGIN` environment variable to match your **frontend URL**
   - Example: `https://copypaste-web-xxx.onrender.com`
3. The service will restart automatically

## Step 4: Verify Deployment

1. Visit your frontend URL (e.g., `https://copypaste-web.onrender.com`)
2. Create a test clip with password
3. Upload a small file (< 25MB for free tier testing)
4. Verify you can read the clip back

## Important Notes

### Free Tier Limitations
- **Web Service**: Spins down after 15 min inactivity (takes ~30s to wake up)
- **Static Site**: Always available
- **Disk**: 10GB limit on free tier

### Large Files
- Max file size: 10GB (configured in code)
- For 1GB+ files, uploads may take significant time
- Progress indicators are shown in UI
- Consider upgrading plan for better bandwidth

### Security Features Added
- Helmet.js security headers
- Rate limiting (100 requests per 15 min)
- Stricter rate limit on uploads (10 per 15 min)
- CORS protection
- Password hashing with bcrypt

### Environment Variables Reference

| Variable | Backend | Frontend | Description |
|----------|---------|----------|-------------|
| `NODE_ENV` | ✓ | ✗ | Set to `production` |
| `PORT` | ✓ | ✗ | Usually 10000 on Render |
| `DB_PATH` | ✓ | ✗ | SQLite database location |
| `UPLOAD_DIR` | ✓ | ✗ | File upload storage |
| `CORS_ORIGIN` | ✓ | ✗ | Frontend URL |
| `VITE_API_BASE` | ✗ | ✓ | Backend API URL |
| `RATE_LIMIT_WINDOW_MS` | ✓ | ✗ | Rate limit window |
| `RATE_LIMIT_MAX_REQUESTS` | ✓ | ✗ | Max requests per window |

## Troubleshooting

### "Failed to fetch" errors
- Check CORS_ORIGIN matches your frontend URL exactly
- Check both services are "Live" (not "Deploying")
- Check backend logs in Render dashboard

### Files not persisting
- Verify disk is mounted at `/opt/render/project/.data`
- Check `DB_PATH` and `UPLOAD_DIR` point to disk location

### Large upload failures
- Free tier may timeout on very large files
- Consider upgrading to paid plan for better performance
- Check if file exceeds 10GB limit

## Updating After Deployment

Push new code to GitHub:
```bash
git add .
git commit -m "Your changes"
git push
```

Render will automatically redeploy both services.

## Support

- Render Docs: https://docs.render.com
- Check service logs in Render dashboard for errors
