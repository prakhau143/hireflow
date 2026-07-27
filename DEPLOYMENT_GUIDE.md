# HireFlow Deployment Guide

This guide will help you deploy HireFlow to production using Render (backend) and Vercel (frontend).

## Prerequisites

- GitHub account with the project pushed to a repository
- Render account (free tier available)
- Vercel account (free tier available)
- Groq API key

---

## Step 1: Deploy Backend to Render

### 1.1 Push Code to GitHub

```bash
git add .
git commit -m "Ready for deployment"
git push origin main
```

### 1.2 Deploy on Render

1. Go to [render.com](https://render.com) and sign up/login
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Configure the service:
   - **Name**: `hireflow-api`
   - **Runtime**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Root Directory**: `backend`
5. Add Environment Variables:
   - `SECRET_KEY`: Generate a random key (use: `python -c "import secrets; print(secrets.token_urlsafe(32))"`)
   - `GROQ_API_KEY`: Your Groq API key
   - `DATABASE_URL`: `sqlite+aiosqlite:///./hireflow.db` (or PostgreSQL URL if using Postgres)
   - `ALLOWED_ORIGINS`: `https://hireflow.vercel.app,https://hireflow-frontend.vercel.app`
   - `ALGORITHM`: `HS256`
   - `ACCESS_TOKEN_EXPIRE_MINUTES`: `10080`
   - `ENCRYPTION_KEY`: Generate another random key
6. Click **"Deploy Web Service"**

### 1.3 Add Persistent Disk (Important!)

After deployment:
1. Go to your service on Render
2. Click **"Disk"** tab
3. Click **"New Disk"**
4. Configure:
   - **Name**: `hireflow-data`
   - **Mount Path**: `/opt/render/project/src/backend`
   - **Size**: 1 GB
5. Click **"Create Disk"**

This ensures your database and uploaded resumes persist across deployments.

### 1.4 Create Admin User

After deployment, SSH into the Render service or use the Render shell to run:

```bash
cd /opt/render/project/src/backend
python create_admin.py
```

Or use the existing admin credentials:
- **Email**: mittalprakhar504@gmail.com
- **Password**: (set during local setup)

---

## Step 2: Deploy Frontend to Vercel

### 2.1 Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) and sign up/login
2. Click **"Add New Project"**
3. Import your GitHub repository
4. Configure:
   - **Framework Preset**: Vite
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. Add Environment Variables:
   - `VITE_API_URL`: Your Render backend URL (e.g., `https://hireflow-api.onrender.com`)
6. Click **"Deploy"**

### 2.2 Update Backend CORS

After getting your Vercel URL, update the `ALLOWED_ORIGINS` in Render:
1. Go to your Render service
2. Click **"Environment"**
3. Edit `ALLOWED_ORIGINS` to include your Vercel URL
4. Redeploy

---

## Step 3: Verify Deployment

### 3.1 Backend Health Check

Visit: `https://hireflow-api.onrender.com/api/health`

Should return:
```json
{
  "status": "ok",
  "service": "HireFlow AI",
  "version": "1.0.0"
}
```

### 3.2 Frontend Access

Visit your Vercel URL and:
1. Try logging in with admin credentials
2. Test uploading a resume
3. Test SMTP configuration
4. Verify all features work

---

## Environment Variables Reference

### Backend (Render)

| Variable | Description | Example |
|----------|-------------|---------|
| `SECRET_KEY` | JWT signing key | Random 32+ char string |
| `GROQ_API_KEY` | Groq AI API key | `gsk_...` |
| `DATABASE_URL` | Database connection | `sqlite+aiosqlite:///./hireflow.db` |
| `ALLOWED_ORIGINS` | CORS allowed origins | `https://hireflow.vercel.app` |
| `ALGORITHM` | JWT algorithm | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Token expiry | `10080` (7 days) |
| `ENCRYPTION_KEY` | Password encryption key | Random 32+ char string |

### Frontend (Vercel)

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | `https://hireflow-api.onrender.com` |

---

## Troubleshooting

### Backend Issues

**Database not persisting?**
- Ensure you added a persistent disk in Render
- Check mount path is `/opt/render/project/src/backend`

**CORS errors?**
- Update `ALLOWED_ORIGINS` in Render environment variables
- Include your Vercel URL

**Admin user not working?**
- Run `create_admin.py` in the Render shell
- Or use the `/api/auth/register` endpoint to create a new admin

### Frontend Issues

**API calls failing?**
- Check `VITE_API_URL` is set correctly in Vercel
- Verify backend is running and accessible
- Check browser console for CORS errors

**Build failing?**
- Ensure all dependencies are in `package.json`
- Check TypeScript errors in build logs

---

## Post-Deployment Checklist

- [ ] Backend health check passes
- [ ] Frontend loads without errors
- [ ] Admin login works
- [ ] Resume upload works
- [ ] SMTP configuration works
- [ ] AI features work (Groq API key valid)
- [ ] Database persists across deployments
- [ ] CORS configured correctly
- [ ] Environment variables set in both platforms

---

## Cost Estimate

**Render (Free Tier):**
- 750 hours/month
- 512 MB RAM
- Persistent disk: 1 GB free

**Vercel (Free Tier):**
- Unlimited deployments
- 100 GB bandwidth/month
- Edge network

**Total Cost**: $0/month (free tiers)

---

## Support

For issues:
1. Check Render logs for backend errors
2. Check Vercel logs for frontend errors
3. Verify environment variables are set correctly
4. Check this guide's troubleshooting section
