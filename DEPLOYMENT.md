# 🚀 Cloudflare Deployment: Google Login Optimized Packet

This application has been optimized to run on **Cloudflare Pages** with deep integration for **Google Identity**.

## 🛡️ Identity & Zero Trust (The "Optimized" Way)
This app is built to be "Hands-Off." The backend handles the Google Login complexity so you don't have to.

### 🔑 The "Login Information" (Google OAuth)
For the "Sign in with Google" button to work, you **must** get your credentials from the **[Google Cloud Console](https://console.cloud.google.com/apis/credentials)**:
1.  **Create OAuth Client ID**: Select "Web Application."
2.  **Authorized Redirect URIs**: Add `https://your-app.pages.dev/auth/google/callback`.
3.  **Copy the ID & Secret**: Paste them into the Cloudflare Dashboard environment variables.

---

## 📦 What's in this Packet?
-   **Frontend**: React + Vite optimized for Cloudflare deployment.
-   **Backend**: Cloudflare Pages Functions (in `/functions`) and Express (for local dev).
-   **Database**: Zero-Maintenance D1/SQLite partitioning.
-   **Security**: Pre-generated `JWT_SECRET` (unique to this build) is already in your `wrangler.toml`.

## 🛠️ Transfer to Cloudflare Pages (Updated)
1.  **Push to GitHub**: Upload this entire folder.
2.  **Create Pages Project**: Connect your GitHub repo to Cloudflare Pages.
3.  **Build Settings (MANDATORY in UI)**:
    *   **Wait!** Page projects *ignore* the build command in `wrangler.toml`. You MUST set these manually in the Cloudflare Dashboard:
    *   **Framework Preset**: `Vite` 
    *   **Build command**: `npm run build`
    *   **Build output directory**: `dist`
4.  **Environment Variables (Settings > Variables)**:
    *   `JWT_SECRET`: (Already set in `wrangler.toml`, but you can override here).
    *   `GOOGLE_CLIENT_ID`: (From Google Console).
    *   `GOOGLE_CLIENT_SECRET`: (From Google Console).
    *   `APP_URL`: `https://your-app.pages.dev` (Matches your live URL).
5.  **D1 Activation (Settings > Functions)**:
    *   **D1 Database Binding**: Click "Add Binding." name it `DB`, and select your database.
5.  **Build Command**: `npm run build`
6.  **Root Directory**: `/`

The app is now fully self-contained. The backend logic handles all Google credential variations automatically.
