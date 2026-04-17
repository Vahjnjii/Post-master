import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import db from './server/db';
import jwt from 'jsonwebtoken';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret';
const PORT = 3000;

async function startServer() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));

  // --- MOCK AUTH FOR DEMO (Replace with real OAuth for Cloudflare) ---
  // On Cloudflare, you'd use a Library like @auth/core
  app.post('/api/auth/mock', (req, res) => {
    const { email, displayName, photoURL, uid } = req.body;
    
    const stmt = db.prepare('INSERT OR REPLACE INTO users (uid, email, displayName, photoURL) VALUES (?, ?, ?, ?)');
    stmt.run(uid, email, displayName, photoURL);

    const token = jwt.sign({ uid, email }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { uid, email, displayName, photoURL } });
  });

  // Auth Middleware
  const authenticate = (req: any, res: any, next: any) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token' });
    
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      req.user = decoded;
      next();
    } catch (e) {
      res.status(401).json({ error: 'Invalid token' });
    }
  };

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
