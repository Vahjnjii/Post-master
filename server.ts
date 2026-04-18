import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import db from './server/db';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import axios from 'axios';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

const client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
const PORT = 3000;

async function startServer() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  // --- GOOGLE OAUTH ROUTES ---
  app.get('/api/auth/google/url', (req, res) => {
    if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.includes('YOUR_GOOGLE')) {
      return res.status(500).json({ 
        error: 'GOOGLE_CLIENT_ID is not configured. Get it from https://console.cloud.google.com/apis/credentials and add it to your environment variables.' 
      });
    }
    const redirectUri = `${APP_URL}/auth/google/callback`;
    const authorizeUrl = client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email'],
      redirect_uri: redirectUri,
    });
    res.json({ url: authorizeUrl });
  });

  app.get(['/auth/google/callback', '/auth/google/callback/'], async (req, res) => {
    const code = req.query.code as string;
    if (!code) return res.status(400).send('No code provided');

    try {
      const redirectUri = `${APP_URL}/auth/google/callback`;
      const { tokens } = await client.getToken({
        code,
        redirect_uri: redirectUri,
      });
      
      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token!,
        audience: GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      
      if (!payload) throw new Error('No payload from Google');

      const { sub: uid, email, name: displayName, picture: photoURL } = payload;
      
      // Upsert user
      const stmt = db.prepare('INSERT OR REPLACE INTO users (uid, email, displayName, photoURL) VALUES (?, ?, ?, ?)');
      stmt.run(uid, email, displayName, photoURL);

      const sessionToken = jwt.sign({ uid, email, displayName, photoURL }, JWT_SECRET, { expiresIn: '7d' });

      // Send message to opener window and close
      res.send(`
        <html>
          <body>
            <script>
              window.opener.postMessage({ 
                type: 'OAUTH_AUTH_SUCCESS', 
                token: '${sessionToken}',
                user: ${JSON.stringify({ uid, email, displayName, photoURL })}
              }, '*');
              window.close();
            </script>
            <div style="font-family: sans-serif; text-align: center; margin-top: 50px;">
              <h2>Login Successful!</h2>
              <p>Closing window...</p>
            </div>
          </body>
        </html>
      `);
    } catch (e: any) {
      console.error('OAuth error:', e);
      res.status(500).send(`Authentication failed: ${e.message}`);
    }
  });

  // --- AUTH MIDDLEWARE (Optimized for Cloudflare) ---
  const authenticate = (req: any, res: any, next: any) => {
    // 1. CLOUDFLARE ACCESS (The "Optimized" Packet Way)
    // When you link Google to Cloudflare Zero Trust, these headers are injected automatically.
    const cfUserEmail = req.headers['cf-access-authenticated-user-email'];
    const cfUserId = req.headers['cf-access-authenticated-user-id'] || req.headers['cf-access-user-id'];

    if (cfUserEmail) {
      let user = db.prepare('SELECT * FROM users WHERE email = ?').get(cfUserEmail) as any;
      if (!user) {
        const uid = cfUserId ? `cf_${cfUserId}` : `cf_${Buffer.from(cfUserEmail as string).toString('hex').substring(0, 12)}`;
        db.prepare('INSERT INTO users (uid, email, displayName) VALUES (?, ?, ?)')
          .run(uid, cfUserEmail, (cfUserEmail as string).split('@')[0]);
        user = { uid, email: cfUserEmail, displayName: (cfUserEmail as string).split('@')[0] };
      }
      req.user = user;
      return next();
    }

    // 2. JWT FALLBACK (Manual Google Login)
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        req.user = decoded;
        return next();
      } catch (e) {
        return res.status(401).json({ error: 'Invalid Session' });
      }
    }

    res.status(401).json({ error: 'Authentication Required' });
  };

  app.get('/api/me', authenticate, (req: any, res) => {
    res.json({ user: req.user });
  });

  // --- CHATS API ---
  app.get('/api/chats', authenticate, (req: any, res) => {
    const chats = db.prepare('SELECT * FROM chats WHERE userId = ? ORDER BY createdAt DESC LIMIT 50').all(req.user.uid);
    res.json(chats);
  });

  app.post('/api/chats', authenticate, (req: any, res) => {
    const { title } = req.body;
    const id = uuidv4();
    db.prepare('INSERT INTO chats (id, userId, title) VALUES (?, ?, ?)').run(id, req.user.uid, title);
    res.json({ id, title });
  });

  app.put('/api/chats/:id', authenticate, (req: any, res) => {
    const { title } = req.body;
    db.prepare('UPDATE chats SET title = ? WHERE id = ? AND userId = ?').run(title, req.params.id, req.user.uid);
    res.json({ success: true });
  });

  app.delete('/api/chats/:id', authenticate, (req: any, res) => {
    db.prepare('DELETE FROM messages WHERE chatId = ?').run(req.params.id);
    db.prepare('DELETE FROM posts WHERE chatId = ?').run(req.params.id);
    db.prepare('DELETE FROM chats WHERE id = ? AND userId = ?').run(req.params.id, req.user.uid);
    res.json({ success: true });
  });

  // --- MESSAGES API ---
  app.get('/api/chats/:chatId/messages', authenticate, (req: any, res) => {
    const messages = db.prepare('SELECT * FROM messages WHERE chatId = ? AND userId = ? ORDER BY timestamp ASC').all(req.params.chatId, req.user.uid);
    // Parse JSON fields
    const formatted = messages.map((m: any) => ({
      ...m,
      postPlaceholders: m.postPlaceholders ? JSON.parse(m.postPlaceholders) : undefined
    }));
    res.json(formatted);
  });

  app.post('/api/messages', authenticate, (req: any, res) => {
    const { chatId, role, content, postPlaceholders } = req.body;
    const id = uuidv4();
    db.prepare('INSERT INTO messages (id, chatId, userId, role, content, postPlaceholders) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, chatId, req.user.uid, role, content, postPlaceholders ? JSON.stringify(postPlaceholders) : null);
    res.json({ id });
  });

  // --- POSTS API ---
  app.get('/api/messages/:messageId/posts', authenticate, (req: any, res) => {
    const posts = db.prepare('SELECT * FROM posts WHERE messageId = ? AND userId = ? ORDER BY createdAt ASC').all(req.params.messageId, req.user.uid);
    const formatted = posts.map((p: any) => ({
      ...p,
      content: JSON.parse(p.content),
      hashtags: JSON.parse(p.hashtags),
      interacted: Boolean(p.interacted)
    }));
    res.json(formatted);
  });

  app.post('/api/posts', authenticate, (req: any, res) => {
    const { chatId, messageId, title, content, hashtags, languageName, imageData } = req.body;
    const id = uuidv4();
    db.prepare('INSERT INTO posts (id, userId, chatId, messageId, title, content, hashtags, languageName, imageData) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, req.user.uid, chatId, messageId, title, JSON.stringify(content), JSON.stringify(hashtags), languageName, imageData);
    res.json({ id });
  });

  app.patch('/api/posts/:id', authenticate, (req: any, res) => {
    const { interacted } = req.body;
    db.prepare('UPDATE posts SET interacted = ? WHERE id = ? AND userId = ?').run(interacted ? 1 : 0, req.params.id, req.user.uid);
    res.json({ success: true });
  });

  // Stats
  app.post('/api/chats/:id/stats', authenticate, (req: any, res) => {
    const { type } = req.body; // 'shared' or 'downloaded'
    const column = type === 'shared' ? 'sharedCount' : 'downloadedCount';
    db.prepare(`UPDATE chats SET ${column} = ${column} + 1 WHERE id = ? AND userId = ?`).run(req.params.id, req.user.uid);
    res.json({ success: true });
  });

  // --- API KEYS MGMT ---
  app.get('/api/keys', authenticate, (req: any, res) => {
    const keys = db.prepare('SELECT id, keyLabel, apiKey, quotaExhausted, createdAt FROM api_keys WHERE userId = ? ORDER BY createdAt DESC').all(req.user.uid);
    res.json(keys);
  });

  app.post('/api/keys', authenticate, (req: any, res) => {
    const { keyLabel, apiKey } = req.body;
    const id = uuidv4();
    db.prepare('INSERT INTO api_keys (id, userId, keyLabel, apiKey) VALUES (?, ?, ?, ?)').run(id, req.user.uid, keyLabel, apiKey);
    res.json({ id, keyLabel });
  });

  app.delete('/api/keys/:id', authenticate, (req: any, res) => {
    db.prepare('DELETE FROM api_keys WHERE id = ? AND userId = ?').run(req.params.id, req.user.uid);
    res.json({ success: true });
  });

  app.patch('/api/keys/:id/exhausted', authenticate, (req: any, res) => {
    db.prepare('UPDATE api_keys SET quotaExhausted = 1 WHERE id = ? AND userId = ?').run(req.params.id, req.user.uid);
    res.json({ success: true });
  });

  // Vite Integration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    // ... logic for production build ...
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
