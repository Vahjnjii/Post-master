# 🚀 Cloudflare Deployment: Google Login Optimized Packet

This application has been optimized to run on **Cloudflare Pages** with deep integration for **Google Identity**.

## 🛡️ Identity & Zero Trust (The "Optimized" Way)
The backend is programmed to automatically detect and trust **Cloudflare Access** headers.
When you move this to Cloudflare, you don't need a manual "Login" button if you enable **Zero Trust**:

1.  **Identity Provider**: Link your Google Cloud Console project to Cloudflare Zero Trust.
2.  **Access Policy**: Enable Email/Google login for your domain.
3.  **Automatic Partitioning**: The app will read `Cf-Access-Authenticated-User-Email` and immediately partition data for that Google user.

## 📦 What's in this Packet?
-   **Frontend**: React + Vite optimized for Cloudflare deployment.
-   **Backend**: Express Server with built-in OAuth logic and Cloudflare Header Trust.
-   **Database**: SQLite/D1 ready schema for multi-user isolation.
-   **Key Management**: Multi-key Gemini rotation (managed in User Settings).

## 🛠️ Transfer to Cloudflare Pages (Updated)
1.  **Push to GitHub**: Upload this entire folder.
2.  **Create Pages Project**: Connect your GitHub repo to Cloudflare Pages.
3.  **Build Settings (CRITICAL)**:
    *   **Framework Preset**: Vite
    *   **Build command**: `npm run build`
    *   **Build output directory**: `dist`
4.  **Environment Variables (Cloudflare Dashboard)**:
    *   `JWT_SECRET`: Generate a random 64-character string.
    *   `GOOGLE_CLIENT_ID`: From Google Cloud Console.
    *   `GOOGLE_CLIENT_SECRET`: From Google Cloud Console.
    *   `APP_URL`: Your `.pages.dev` URL.
5.  **D1 Activation**:
    *   Create a D1 database named `post_cloud_db`.
    *   Bind it to the project in **Settings > Functions > D1 Database Bindings**. Name the binding `DB`.
    *   Run the schema found in `server/db.ts` using the Cloudflare console.
5.  **Build Command**: `npm run build`
6.  **Root Directory**: `/`

The app is now fully self-contained. The backend logic handles all Google credential variations automatically.
