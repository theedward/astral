import { controls, requestBudget, saveSnapshot } from './controls.mjs';
import { page } from './page.mjs';
import { FONT_BASE64, FONT_LICENSE } from './font.mjs';
// Astral's free-tier Cloudflare Worker. OAuth secrets are Worker secrets only.
const encoder = new TextEncoder();
const now = () => Math.floor(Date.now() / 1000);
const random = () => b64(crypto.getRandomValues(new Uint8Array(32)));
function b64(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}
function unb64(s) {
  return Uint8Array.from(
    atob(s.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (s.length % 4)) % 4)),
    (c) => c.charCodeAt(0),
  );
}
export async function hash(value) {
  return b64(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}
const json = (value, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
const query = (env, sql, ...args) => env.DB.prepare(sql).bind(...args);
async function body(request, limit = 4096) {
  const size = Number(request.headers.get('content-length') || 0);
  if (size > limit) throw Error('Request too large.');
  const reader = request.body?.getReader();
  if (!reader) throw Error('Missing request.');
  let total = 0;
  const blocks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      throw Error('Request too large.');
    }
    blocks.push(value);
  }
  const buffer = new Uint8Array(total);
  let at = 0;
  for (const b of blocks) {
    buffer.set(b, at);
    at += b.length;
  }
  return JSON.parse(new TextDecoder().decode(buffer));
}
async function wrappingKey(env) {
  return crypto.subtle.importKey(
    'raw',
    await crypto.subtle.digest('SHA-256', encoder.encode(env.BNET_CLIENT_SECRET)),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}
async function seal(env, token) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await wrappingKey(env),
    encoder.encode(token),
  );
  return b64(iv) + '.' + b64(new Uint8Array(encrypted));
}
async function unseal(env, value) {
  const [iv, data] = value.split('.');
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(iv) },
      await wrappingKey(env),
      unb64(data),
    ),
  );
}
async function limit(request, env) {
  const key = await hash(
    (request.headers.get('CF-Connecting-IP') || 'local') + ':' + Math.floor(now() / 300),
  );
  const r = await query(
    env,
    'INSERT INTO rate_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',
    key,
    now() + 600,
  ).first();
  return r.count <= 30;
}
async function session(request, env) {
  const token = request.headers.get('Authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  if (!token) return null;
  return query(
    env,
    'SELECT s.user_id,s.id,s.label,s.last_seen,u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.expires>?',
    await hash(token),
    now(),
  ).first();
}
export async function route(request, env) {
  const url = new URL(request.url),
    p = url.pathname;
  if (p === '/') return page('', true);
  if (p === '/assets/cinzel-decorative.ttf')
    return new Response(
      Uint8Array.from(atob(FONT_BASE64), (c) => c.charCodeAt(0)),
      {
        headers: {
          'Content-Type': 'font/ttf',
          'Cache-Control': 'public,max-age=86400',
          'X-Content-Type-Options': 'nosniff',
        },
      },
    );
  if (p === '/assets/fonts/OFL.txt')
    return new Response(FONT_LICENSE, {
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
        'Cache-Control': 'public,max-age=86400',
      },
    });
  const profileMatch = p.match(/^\/profiles\/((?:retail|forever)(?:-handheld)?)\/current$/);
  const flavor = profileMatch?.[1] || 'retail';
  if (p === '/health')
    return json({
      product: 'astral-sync',
      protocol: 1,
      authConfigured: !!(env.BNET_CLIENT_ID && env.BNET_CLIENT_SECRET),
    });
  if (request.headers.get('Origin') && request.headers.get('Origin') !== env.PUBLIC_ORIGIN)
    return json({ error: 'Origin not allowed.' }, 403);
  if (!env.PUBLIC_ORIGIN?.startsWith('https://') || !env.BNET_CLIENT_ID || !env.BNET_CLIENT_SECRET)
    return json({ error: 'Astral’s Battle.net integration has not been configured.' }, 503);
  const cleanupRequest =
    (p === '/account/data' || p.startsWith('/devices/') || p === '/auth/logout') &&
    ['DELETE', 'POST'].includes(request.method);
  if (!cleanupRequest && !(await requestBudget(env)))
    return json(
      {
        error: 'Astral has reached its free daily request limit. Try again after midnight UTC.',
        code: 'quota',
      },
      429,
    );
  if (p === '/auth/device' && request.method === 'POST') {
    if (!(await limit(request, env)))
      return json({ error: 'Too many sign-in requests. Please wait.' }, 429);
    const b = await body(request);
    if (!/^[A-Za-z0-9_-]{43}$/.test(b.challenge) || typeof b.label !== 'string')
      return json({ error: 'Invalid device.' }, 400);
    const id = random();
    await query(
      env,
      'INSERT INTO pairs(id,challenge,label,expires) VALUES(?,?,?,?)',
      id,
      b.challenge,
      b.label.slice(0, 80),
      now() + 300,
    ).run();
    return json({ id, url: env.PUBLIC_ORIGIN + '/auth/start?id=' + id });
  }
  if (p === '/auth/start' && request.method === 'GET') {
    const id = url.searchParams.get('id'),
      pair = await query(
        env,
        'SELECT id FROM pairs WHERE id=? AND expires>? AND user_id IS NULL',
        id,
        now(),
      ).first();
    if (!pair) return page('This sign-in has expired.');
    const state = random();
    await query(env, 'UPDATE pairs SET state_hash=? WHERE id=?', await hash(state), id).run();
    const auth = new URL('https://oauth.battle.net/authorize');
    auth.search = new URLSearchParams({
      response_type: 'code',
      client_id: env.BNET_CLIENT_ID,
      redirect_uri: env.PUBLIC_ORIGIN + '/auth/callback',
      scope: 'openid',
      state,
    }).toString();
    return new Response(null, {
      status: 302,
      headers: {
        Location: auth.href,
        'Set-Cookie': `astral_oauth=${state}; HttpOnly; Secure; SameSite=Lax; Path=/auth; Max-Age=300`,
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
      },
    });
  }
  if (p === '/auth/callback' && request.method === 'GET') {
    const state = url.searchParams.get('state'),
      cookie = request.headers.get('Cookie')?.match(/(?:^|;\s*)astral_oauth=([A-Za-z0-9_-]+)/)?.[1];
    if (!state || cookie !== state || !url.searchParams.get('code'))
      return page('Sign-in was cancelled or could not be verified.');
    // Consume browser state atomically without removing the device pairing.
    // Polls must remain pending while the external identity requests are in flight.
    const pair = await query(
      env,
      'UPDATE pairs SET state_hash=NULL WHERE state_hash=? AND expires>? RETURNING *',
      await hash(state),
      now(),
    ).first();
    if (!pair) return page('This sign-in has expired.');
    const tokenResponse = await fetch('https://oauth.battle.net/token', {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + btoa(env.BNET_CLIENT_ID + ':' + env.BNET_CLIENT_SECRET),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: url.searchParams.get('code'),
        redirect_uri: env.PUBLIC_ORIGIN + '/auth/callback',
      }),
    });
    if (!tokenResponse.ok) return page('Battle.net could not complete sign-in.');
    const grant = await tokenResponse.json();
    const infoResponse = await fetch('https://oauth.battle.net/userinfo', {
      headers: { Authorization: 'Bearer ' + grant.access_token },
    });
    if (!infoResponse.ok) return page('Battle.net identity could not be verified.');
    const user = await infoResponse.json();
    if (!user.sub || typeof user.sub !== 'string')
      return page('Battle.net identity could not be verified.');
    const id = 'bnet:' + user.sub,
      name = typeof user.battletag === 'string' ? user.battletag : 'Battle.net player',
      token = random();
    await env.DB.batch([
      query(
        env,
        'INSERT INTO users(id,name) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name',
        id,
        name,
      ),
      query(
        env,
        'INSERT INTO sessions(hash,user_id,expires,id,label,created,last_seen) VALUES(?,?,?,?,?,?,?)',
        await hash(token),
        id,
        now() + 30 * 86400,
        random(),
        pair.label,
        now(),
        now(),
      ),
      query(
        env,
        'UPDATE pairs SET user_id=?,sealed_token=? WHERE id=? AND challenge=? AND expires>?',
        id,
        await seal(env, token),
        pair.id,
        pair.challenge,
        now(),
      ),
    ]);
    return page('You’re connected. Welcome home.');
  }
  if (p === '/auth/device/poll' && request.method === 'POST') {
    const b = await body(request);
    if (!/^[A-Za-z0-9_-]{43}$/.test(b.id) || !/^[A-Za-z0-9_-]{43}$/.test(b.verifier))
      return json({ error: 'Invalid device request.' }, 400);
    const pair = await query(
      env,
      'SELECT * FROM pairs WHERE id=? AND challenge=? AND expires>?',
      b.id,
      await hash(b.verifier),
      now(),
    ).first();
    if (!pair) return json({ error: 'Sign-in expired. Please try again.' }, 410);
    if (!pair.user_id) return json({ pending: true });
    const consumed = await query(
      env,
      'DELETE FROM pairs WHERE id=? AND challenge=? AND user_id IS NOT NULL RETURNING *',
      b.id,
      await hash(b.verifier),
    ).first();
    if (!consumed) return json({ error: 'Sign-in already completed.' }, 410);
    const user = await query(env, 'SELECT name FROM users WHERE id=?', consumed.user_id).first();
    return json({ token: await unseal(env, consumed.sealed_token), name: user.name });
  }
  const who = await session(request, env);
  if (!who) return json({ error: 'Please sign in with Battle.net.' }, 401);
  if ((who.last_seen || 0) < now() - 900)
    await query(
      env,
      'UPDATE sessions SET last_seen=? WHERE id=? AND user_id=?',
      now(),
      who.id,
      who.user_id,
    ).run();
  const control = await controls(request, env, who, body, random);
  if (control) return control;
  if (p === '/auth/logout' && request.method === 'POST') {
    await query(
      env,
      'DELETE FROM sessions WHERE hash=?',
      await hash(request.headers.get('Authorization').slice(7)),
    ).run();
    return json({ ok: true });
  }
  if ((profileMatch || p === '/profiles/current') && request.method === 'GET') {
    const profile = await query(
      env,
      'SELECT * FROM profiles WHERE user_id=? AND flavor=?',
      who.user_id,
      flavor,
    ).first();
    if (!profile?.snapshot_id) return json({ revision: 0 });
    const result = await query(
      env,
      'SELECT content FROM chunks WHERE snapshot_id=? ORDER BY position',
      profile.snapshot_id,
    ).all();
    return json({
      revision: profile.revision,
      hash: profile.hash,
      updated: profile.updated,
      payload: result.results.map((r) => r.content).join(''),
    });
  }
  if ((profileMatch || p === '/profiles/current') && request.method === 'PUT') {
    return saveSnapshot(env, who, flavor, await body(request, 1500000), random);
  }
  return json({ error: 'Not found.' }, 404);
}
export default {
  async fetch(request, env) {
    try {
      return await route(request, env);
    } catch (error) {
      if (
        /free tier|daily.*limit|maximum.*size|exceeded.*(?:quota|limit)/i.test(error.message || '')
      )
        return json(
          {
            error:
              'Cloudflare’s free quota has been reached. Sync is paused; try after the daily reset. Astral will not upgrade your plan.',
            code: 'quota',
          },
          507,
        );
      return json(
        {
          error:
            error.message === 'Request too large.'
              ? 'Settings snapshot is too large.'
              : 'The service could not complete this request.',
        },
        error.message === 'Request too large.' ? 413 : 500,
      );
    }
  },
  async scheduled(_, env) {
    await env.DB.batch([
      query(env, 'DELETE FROM pairs WHERE expires<?', now()),
      query(env, 'DELETE FROM sessions WHERE expires<?', now()),
      query(env, 'DELETE FROM rate_limits WHERE expires<?', now()),
    ]);
  },
};
