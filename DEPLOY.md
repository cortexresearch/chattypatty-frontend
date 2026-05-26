# Frontend Deployment Guide (Netlify)

This frontend is a static site served via Netlify.

## 1. Prerequisites
- GitHub repository: `https://github.com/cortexresearch/chattypatty-frontend`
- Netlify account connected to GitHub.

## 2. Deployment Steps
1. Log in to [Netlify](https://app.netlify.com/).
2. Click **"Add new site"** -> **"Import an existing project"**.
3. Select **GitHub** and authorize.
4. Search for and select `chattypatty-frontend`.
5. **Build Settings:**
   - **Build command:** (Leave empty, it's a static site)
   - **Publish directory:** `.` (The root of the frontend repo)
6. Click **"Deploy chattypatty-frontend"**.

## 3. Post-Deployment Configuration
1. After deployment, Netlify will provide a URL (e.g., `https://chat.pxpony.com`).
2. Go to **Site Settings** -> **Domain Management** to set a custom domain if needed.

## 4. Troubleshooting
- If the chat doesn't connect, ensure the `BACKEND_URL` in `js/main.js` matches your Railway backend URL.
- Ensure the backend on Railway has CORS enabled for your Netlify domain (the current backend uses `origin: "*"`, which is fine for development).
