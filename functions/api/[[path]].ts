import jwt from 'jsonwebtoken';

interface Env {
  // @ts-ignore
  DB: D1Database;
  JWT_SECRET: string;
}

// @ts-ignore
export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // Header helpers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,PATCH,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,cf-access-authenticated-user-email,cf-access-authenticated-user-id',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // --- AUTH UTILITY ---
  const getAuthUser = async () => {
    // 1. CF Access Headers
    const cfEmail = request.headers.get('cf-access-authenticated-user-email');
    if (cfEmail) {
      let user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(cfEmail).first();
      if (!user) {
        const uid = `cf_${cfEmail.split('@')[0]}_${Math.random().toString(36).substring(2, 6)}`;
        await env.DB.prepare('INSERT INTO users (uid, email, displayName) VALUES (?, ?, ?)')
          .bind(uid, cfEmail, cfEmail.split('@')[0]).run();
        user = { uid, email: cfEmail };
      }
      return user;
    }

    // 2. JWT Header
    const authHeader = request.headers.get('Authorization');
    if (authHeader) {
      const token = authHeader.split(' ')[1];
      try {
        return jwt.verify(token, env.JWT_SECRET) as any;
      } catch (e) { return null; }
    }
    return null;
  };

  // --- API ROUTING ---
  if (path.startsWith('/api/me')) {
    const user = await getAuthUser();
    return Response.json({ user }, { headers: corsHeaders });
  }

  if (path.startsWith('/api/chats')) {
    const user = await getAuthUser();
    if (!user) return new Response('Unauthorized', { status: 401 });

    if (request.method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM chats WHERE userId = ? ORDER BY createdAt DESC').bind(user.uid).all();
      return Response.json(results, { headers: corsHeaders });
    }
    
    if (request.method === 'POST') {
      const { title } = await request.json() as any;
      const id = crypto.randomUUID();
      await env.DB.prepare('INSERT INTO chats (id, userId, title) VALUES (?, ?, ?)').bind(id, user.uid, title).run();
      return Response.json({ id, title }, { headers: corsHeaders });
    }
  }

  if (path.startsWith('/api/keys')) {
    const user = await getAuthUser();
    if (!user) return new Response('Unauthorized', { status: 401 });

    if (request.method === 'GET') {
      const { results } = await env.DB.prepare('SELECT id, keyLabel, apiKey, quotaExhausted, createdAt FROM api_keys WHERE userId = ?').bind(user.uid).all();
      return Response.json(results, { headers: corsHeaders });
    }

    if (request.method === 'POST') {
      const { keyLabel, apiKey } = await request.json() as any;
      const id = crypto.randomUUID();
      await env.DB.prepare('INSERT INTO api_keys (id, userId, keyLabel, apiKey) VALUES (?, ?, ?, ?)').bind(id, user.uid, keyLabel, apiKey).run();
      return Response.json({ id, keyLabel }, { headers: corsHeaders });
    }
  }
  
  // Update state for exhausted keys
  if (path.includes('/exhausted') && request.method === 'PATCH') {
     const user = await getAuthUser();
     if (!user) return new Response('Unauthorized', { status: 401 });
     const id = path.split('/')[3];
     await env.DB.prepare('UPDATE api_keys SET quotaExhausted = 1 WHERE id = ? AND userId = ?').bind(id, user.uid).run();
     return Response.json({ success: true }, { headers: corsHeaders });
  }

  // Fallback for static assets (This won't be reached if using Pages normally, but good to have)
  return new Response('API Not Found', { status: 404 });
};
