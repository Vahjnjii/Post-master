import jwt from 'jsonwebtoken';

interface Env {
  // @ts-ignore
  DB: D1Database;
  JWT_SECRET: string;
}

// @ts-ignore
export const onRequest: PagesFunction<Env> = async (context) => {
  try {
    const { request, env } = context;
    const url = new URL(request.url);
    const path = url.pathname;

    // Header helpers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,PATCH,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,cf-access-authenticated-user-email,cf-access-authenticated-user-id',
      'Content-Type': 'application/json'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (!env.DB) {
      return new Response(JSON.stringify({ error: "Cloudflare D1 Database (DB) is not bound. Please check your project settings." }), { status: 500, headers: corsHeaders });
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
        if (!token || !env.JWT_SECRET) return null;
        try {
          return jwt.verify(token, env.JWT_SECRET) as any;
        } catch (e) { return null; }
      }
      return null;
    };

    // --- API ROUTING ---
    if (path.includes('/api/config')) {
      return Response.json({ 
        googleClientId: env.GOOGLE_CLIENT_ID || '', 
        isConfigured: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)
      }, { headers: corsHeaders });
    }

    if (path.includes('/api/health')) {
      const dbStatus = env.DB ? 'Connected' : 'Missing Binding';
      return Response.json({ status: 'ok', database: dbStatus, timestamp: new Date().toISOString() }, { headers: corsHeaders });
    }

    if (path.includes('/api/me')) {
      const user = await getAuthUser();
      return Response.json({ user }, { headers: corsHeaders });
    }

    if (path.includes('/api/chats') && !path.includes('/stats')) {
      const user = await getAuthUser();
      if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

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

    if (path.includes('/api/keys')) {
      const user = await getAuthUser();
      if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

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
       if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
       const segments = path.split('/');
       const id = segments[segments.length - 2];
       await env.DB.prepare('UPDATE api_keys SET quotaExhausted = 1 WHERE id = ? AND userId = ?').bind(id, user.uid).run();
       return Response.json({ success: true }, { headers: corsHeaders });
    }

    return new Response(JSON.stringify({ error: `API Route Not Found: ${path}` }), { status: 404, headers: corsHeaders });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: `Critical Function Error: ${err.message}` }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } });
  }
};
