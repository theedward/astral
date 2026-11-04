import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import worker, { hash } from '../cloud/worker.mjs';
class DB {
  constructor(sql) {
    this.db = new DatabaseSync(':memory:');
    this.db.exec(sql);
  }
  prepare(sql) {
    const native = this.db.prepare(sql);
    let v = [];
    const q = {
      bind(...args) {
        v = args;
        return q;
      },
      async first() {
        return native.get(...v) || null;
      },
      async all() {
        return { results: native.all(...v) };
      },
      async run() {
        const r = native.run(...v);
        return { meta: { changes: Number(r.changes) } };
      },
    };
    return q;
  }
  async batch(items) {
    this.db.exec('BEGIN');
    try {
      const r = [];
      for (const q of items) r.push(await q.run());
      this.db.exec('COMMIT');
      return r;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
}
async function fixture(t) {
  const DBi = new DB(
    await fs.readFile(new URL('../cloud/migrations/0001_initial.sql', import.meta.url), 'utf8'),
  );
  DBi.db.exec(
    await fs.readFile(
      new URL('../cloud/migrations/0002_cloud_controls.sql', import.meta.url),
      'utf8',
    ),
  );
  DBi.db.exec(
    await fs.readFile(
      new URL('../cloud/migrations/0003_profile_names.sql', import.meta.url),
      'utf8',
    ),
  );
  t.after(() => DBi.db.close());
  return {
    DB: DBi,
    PUBLIC_ORIGIN: 'https://astral.test',
    BNET_CLIENT_ID: 'fixture-client',
    BNET_CLIENT_SECRET: 'fixture-secret',
  };
}
const req = (p, method = 'GET', body, token) =>
  new Request('https://astral.test' + p, {
    method,
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
async function login(env, id = 'user-a') {
  const token = 'a'.repeat(42) + (id === 'user-a' ? 'a' : 'b');
  env.DB.db.prepare('INSERT INTO users(id,name) VALUES(?,?)').run(id, id);
  env.DB.db
    .prepare(
      'INSERT INTO sessions(hash,user_id,expires,id,label,created,last_seen) VALUES(?,?,?,?,?,?,?)',
    )
    .run(
      await hash(token),
      id,
      Math.floor(Date.now() / 1000) + 3600,
      (id === 'user-a' ? 'a' : 'b').repeat(43),
      'Test computer',
      1,
      1,
    );
  return token;
}
const snapshot = (rev) => ({ payload: 'H4sIAAAAAAAA', hash: 'a'.repeat(64), revision: rev });
test('health is public; protected data requires session', async (t) => {
  const e = await fixture(t);
  assert.equal((await (await worker.fetch(req('/health'), e)).json()).product, 'astral-sync');
  assert.equal((await worker.fetch(req('/profiles/current'), e)).status, 401);
  assert.equal(
    (await worker.fetch(req('/profiles/current'), { ...e, BNET_CLIENT_SECRET: '' })).status,
    503,
  );
});
test('account isolation and conditional revision writes', async (t) => {
  const e = await fixture(t),
    a = await login(e),
    b = await login(e, 'user-b');
  assert.equal(
    (await worker.fetch(req('/profiles/current', 'PUT', snapshot(0), a), e)).status,
    200,
  );
  assert.equal(
    (await (await worker.fetch(req('/profiles/current', 'GET', null, b), e)).json()).revision,
    0,
  );
  assert.equal(
    (await worker.fetch(req('/profiles/current', 'PUT', snapshot(0), a), e)).status,
    409,
  );
  assert.equal(
    (await (await worker.fetch(req('/profiles/current', 'GET', null, a), e)).json()).revision,
    1,
  );
});
test('snapshot history bounded to five revisions', async (t) => {
  const e = await fixture(t),
    a = await login(e);
  for (let i = 0; i < 7; i++)
    assert.equal(
      (await worker.fetch(req('/profiles/current', 'PUT', snapshot(i), a), e)).status,
      200,
    );
  assert.equal(e.DB.db.prepare('SELECT count(*) AS n FROM snapshots').get().n, 5);
  assert.equal(e.DB.db.prepare('SELECT count(*) AS n FROM chunks').get().n, 5);
});
test('OAuth browser state and one-use proof-bound device login', async (t) => {
  const e = await fixture(t),
    verifier = 'v'.repeat(43),
    challenge = await hash(verifier);
  const pair = await (
    await worker.fetch(req('/auth/device', 'POST', { challenge, label: 'Test computer' }), e)
  ).json();
  const start = await worker.fetch(req('/auth/start?id=' + pair.id), e),
    state = new URL(start.headers.get('Location')).searchParams.get('state');
  assert.match(
    await (await worker.fetch(req('/auth/callback?state=' + state + '&code=code'), e)).text(),
    /could not be verified/,
  );
  const original = globalThis.fetch;
  globalThis.fetch = async (url) =>
    Response.json(
      String(url).includes('/token')
        ? { access_token: 'fixture-token' }
        : { sub: '123', battletag: 'Player#1234' },
    );
  try {
    const callback = new Request(
      'https://astral.test/auth/callback?state=' + state + '&code=code',
      { headers: { Cookie: 'astral_oauth=' + state } },
    );
    assert.match(await (await worker.fetch(callback, e)).text(), /You’re signed in/);
    assert.equal(
      (
        await worker.fetch(
          req('/auth/device/poll', 'POST', { id: pair.id, verifier: 'x'.repeat(43) }),
          e,
        )
      ).status,
      410,
    );
    const ok = await (
      await worker.fetch(req('/auth/device/poll', 'POST', { id: pair.id, verifier }), e)
    ).json();
    assert.equal(ok.name, 'Player#1234');
    assert.equal(ok.token.length, 43);
    assert.equal(
      (await worker.fetch(req('/auth/device/poll', 'POST', { id: pair.id, verifier }), e)).status,
      410,
    );
  } finally {
    globalThis.fetch = original;
  }
});
test('logout revokes session; cross-origin access denied', async (t) => {
  const e = await fixture(t),
    a = await login(e);
  assert.equal(
    (
      await worker.fetch(
        new Request('https://astral.test/profiles/current', {
          headers: { Origin: 'https://other.test', Authorization: 'Bearer ' + a },
        }),
        e,
      )
    ).status,
    403,
  );
  assert.equal((await worker.fetch(req('/auth/logout', 'POST', null, a), e)).status, 200);
  assert.equal((await worker.fetch(req('/profiles/current', 'GET', null, a), e)).status, 401);
});
test('Retail and Forever settings are isolated for the same account', async (t) => {
  const e = await fixture(t),
    a = await login(e);
  assert.equal(
    (await worker.fetch(req('/profiles/retail/current', 'PUT', snapshot(0), a), e)).status,
    200,
  );
  assert.equal(
    (await (await worker.fetch(req('/profiles/forever/current', 'GET', null, a), e)).json())
      .revision,
    0,
  );
  assert.equal(
    (
      await worker.fetch(
        req('/profiles/forever/current', 'PUT', { ...snapshot(0), hash: 'b'.repeat(64) }, a),
        e,
      )
    ).status,
    200,
  );
  assert.equal(
    (await (await worker.fetch(req('/profiles/retail/current', 'GET', null, a), e)).json()).hash,
    'a'.repeat(64),
  );
  assert.equal(
    (await (await worker.fetch(req('/profiles/forever/current', 'GET', null, a), e)).json()).hash,
    'b'.repeat(64),
  );
});

test('sign-in pages escape content and block embedded scripts', async () => {
  const { page } = await import('../cloud/page.mjs');
  const response = page('<script>alert(1)</script>');
  const html = await response.text();
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.match(response.headers.get('Content-Security-Policy'), /default-src 'none'/);
  assert.match(response.headers.get('Content-Security-Policy'), /font-src 'self'/);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const home = await worker.fetch(req('/'), {});
  assert.equal(home.status, 200);
  const font = await worker.fetch(req('/assets/cinzel-decorative.ttf'), {});
  assert.equal(font.headers.get('Content-Type'), 'font/ttf');
  assert.ok((await font.arrayBuffer()).byteLength > 50000);
});

test('device polls stay pending while the OAuth callback checks Battle.net', async (t) => {
  const env = await fixture(t);
  const verifier = 'z'.repeat(43);
  const challenge = await hash(verifier);
  const pair = await (
    await worker.fetch(
      req('/auth/device', 'POST', { challenge, label: 'Slow identity provider' }),
      env,
    )
  ).json();
  const start = await worker.fetch(req('/auth/start?id=' + pair.id), env);
  const state = new URL(start.headers.get('Location')).searchParams.get('state');
  let release, started;
  const waiting = new Promise((resolve) => {
    started = resolve;
  });
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/token')) {
      started();
      await gate;
      return Response.json({ access_token: 'fixture-token' });
    }
    return Response.json({ sub: 'slow-user', battletag: 'Slow#1234' });
  };
  try {
    const callback = new Request(
      'https://astral.test/auth/callback?state=' + state + '&code=code',
      { headers: { Cookie: 'astral_oauth=' + state } },
    );
    const completion = worker.fetch(callback, env);
    await waiting;
    const pending = await worker.fetch(
      req('/auth/device/poll', 'POST', { id: pair.id, verifier }),
      env,
    );
    assert.equal(pending.status, 200);
    assert.deepEqual(await pending.json(), { pending: true });
    const replay = await worker.fetch(callback.clone(), env);
    assert.match(await replay.text(), /expired/);
    release();
    assert.match(await (await completion).text(), /You’re signed in/);
    const complete = await (
      await worker.fetch(req('/auth/device/poll', 'POST', { id: pair.id, verifier }), env)
    ).json();
    assert.equal(complete.name, 'Slow#1234');
    assert.equal(complete.token.length, 43);
    assert.equal(
      (await worker.fetch(req('/auth/device/poll', 'POST', { id: pair.id, verifier }), env)).status,
      410,
    );
  } finally {
    release();
    globalThis.fetch = original;
  }
});
test('cloud controls isolate devices, history and restored versions', async (t) => {
  const e = await fixture(t),
    a = await login(e),
    b = await login(e, 'user-b');
  await worker.fetch(req('/profiles/retail/current', 'PUT', snapshot(0), a), e);
  const info = await (await worker.fetch(req('/cloud/retail', 'GET', null, a), e)).json();
  assert.equal(info.devices.length, 1);
  assert.equal(info.devices[0].current, true);
  assert.equal(info.devices[0].hash, undefined);
  assert.equal(info.history.length, 1);
  const id = info.history[0].id;
  assert.equal(
    (await worker.fetch(req('/profiles/retail/history/' + id, 'GET', null, b), e)).status,
    404,
  );
  assert.equal(
    (await worker.fetch(req('/devices/' + 'a'.repeat(43), 'DELETE', null, b), e)).status,
    404,
  );
  const restored = await worker.fetch(
    req('/profiles/retail/history/' + id + '/restore', 'POST', { revision: 1 }, a),
    e,
  );
  assert.equal(restored.status, 200);
  assert.equal((await restored.json()).revision, 2);
  assert.equal(
    (
      await worker.fetch(
        req('/profiles/retail/history/' + id + '/restore', 'POST', { revision: 1 }, a),
        e,
      )
    ).status,
    409,
  );
  const revoked = await worker.fetch(req('/devices/' + 'a'.repeat(43), 'DELETE', null, a), e);
  assert.equal(revoked.status, 200);
  assert.equal((await worker.fetch(req('/cloud/retail', 'GET', null, a), e)).status, 401);
});
test('storage quotas reject atomically and cloud deletion preserves other accounts', async (t) => {
  const e = await fixture(t),
    a = await login(e),
    b = await login(e, 'user-b');
  await worker.fetch(req('/profiles/retail/current', 'PUT', snapshot(0), a), e);
  await worker.fetch(req('/profiles/retail/current', 'PUT', snapshot(0), b), e);
  const limited = { ...e, ASTRAL_USER_BYTES: 1 };
  assert.equal(
    (await worker.fetch(req('/profiles/retail/current', 'PUT', snapshot(1), a), limited)).status,
    507,
  );
  assert.equal(
    (await (await worker.fetch(req('/profiles/retail/current', 'GET', null, a), e)).json())
      .revision,
    1,
  );
  assert.equal(
    (await (await worker.fetch(req('/cloud/retail', 'GET', null, a), limited)).json()).usage.paused,
    true,
  );
  assert.equal(
    (await worker.fetch(req('/account/data', 'DELETE', { confirm: 'no' }, a), e)).status,
    400,
  );
  assert.equal(
    (await worker.fetch(req('/account/data', 'DELETE', { confirm: 'DELETE' }, a), e)).status,
    200,
  );
  assert.equal((await worker.fetch(req('/cloud/retail', 'GET', null, a), e)).status, 401);
  assert.equal(
    (await (await worker.fetch(req('/profiles/retail/current', 'GET', null, b), e)).json())
      .revision,
    1,
  );
  assert.equal(e.DB.db.prepare('SELECT COUNT(*) AS count FROM snapshots').get().count, 1);
});
test('daily limits pause uploads while data deletion remains available', async (t) => {
  const e = await fixture(t),
    a = await login(e);
  const key = 'uploads:' + Math.floor(Date.now() / 86400000) + ':service';
  e.DB.db
    .prepare('INSERT INTO rate_limits(key,count,expires) VALUES(?,?,?)')
    .run(key, 200, Math.floor(Date.now() / 1000) + 86400);
  assert.equal(
    (await worker.fetch(req('/profiles/retail/current', 'PUT', snapshot(0), a), e)).status,
    507,
  );
  assert.equal(e.DB.db.prepare('SELECT COUNT(*) AS count FROM snapshots').get().count, 0);
  assert.equal(
    (await worker.fetch(req('/account/data', 'DELETE', { confirm: 'DELETE' }, a), e)).status,
    200,
  );
});

test('Cloudflare free-tier failures pause sync without suggesting a billing upgrade', async (t) => {
  const e = await fixture(t);
  const failing = {
    ...e,
    DB: {
      prepare() {
        throw Error("Your account has exceeded D1's free tier daily row read limit.");
      },
    },
  };
  const response = await worker.fetch(req('/profiles/retail/current'), failing);
  assert.equal(response.status, 507);
  assert.equal((await response.json()).code, 'quota');
});

test('handheld backups and history are separate from legacy regular backups', async (t) => {
  const env = await fixture(t);
  const token = await login(env);
  const send = (path, method = 'GET', data = null) =>
    worker.fetch(req(path, method, data, token), env);
  assert.equal((await send('/profiles/current', 'PUT', snapshot(0))).status, 200);
  for (const client of ['retail', 'forever']) {
    const handheld = client + '-handheld';
    const hash = (client === 'retail' ? 'b' : 'c').repeat(64);
    assert.equal(
      (await send('/profiles/' + handheld + '/current', 'PUT', { ...snapshot(0), hash })).status,
      200,
    );
    const info = await (await send('/cloud/' + handheld)).json();
    assert.equal(info.history[0].hash, hash);
    const id = info.history[0].id;
    assert.equal((await send('/profiles/' + client + '/history/' + id)).status, 404);
    assert.equal((await send('/profiles/' + handheld + '/history/' + id)).status, 200);
    assert.equal(
      (await send('/profiles/' + handheld + '/history/' + id + '/restore', 'POST', { revision: 1 }))
        .status,
      200,
    );
  }
  assert.equal((await (await send('/profiles/retail/current')).json()).hash, 'a'.repeat(64));
  assert.equal((await (await send('/profiles/forever/current')).json()).revision, 0);
  assert.equal((await send('/profiles/retail-custom/current', 'PUT', snapshot(0))).status, 404);
});

test('custom profiles keep stable backups on rename and cannot be recreated by stale devices', async (t) => {
  const env = await fixture(t);
  const owner = await login(env);
  const other = await login(env, 'user-b');
  const send = (path, method = 'GET', data = null, token = owner) =>
    worker.fetch(req(path, method, data, token), env);
  const retail = '/sync-profiles/retail';
  await send('/profiles/retail-handheld/current', 'PUT', snapshot(0));
  const created = await send(retail, 'POST', { name: 'Travel' });
  assert.equal(created.status, 201);
  const { id } = await created.json();
  const slot = '/profiles/retail-' + id + '/current';
  assert.equal((await send(slot, 'PUT', snapshot(0))).status, 200);
  assert.equal(
    (await send(retail + '/' + id, 'PATCH', { name: 'Travel renamed' }, other)).status,
    404,
  );
  assert.equal((await send(retail + '/' + id, 'PATCH', { name: 'Travel renamed' })).status, 200);
  assert.equal((await send(retail + '/handheld', 'PATCH', { name: 'Ally' })).status, 200);
  const { profiles } = await (await send(retail)).json();
  assert.deepEqual(
    profiles.find((p) => p.id === id),
    { id, name: 'Travel renamed', revision: 1 },
  );
  assert.deepEqual(
    profiles.find((p) => p.id === 'handheld'),
    { id: 'handheld', name: 'Ally', revision: 1 },
  );
  assert.equal((await (await send('/sync-profiles/forever')).json()).profiles.length, 2);
  assert.equal((await send(slot, 'GET', null, other)).status, 404);
  assert.equal((await send(retail + '/' + id, 'DELETE', { confirm: id }, other)).status, 404);
  assert.equal((await send(retail + '/' + id, 'DELETE', { confirm: id })).status, 200);
  assert.equal((await send(slot, 'PUT', snapshot(0))).status, 404);
  assert.equal((await (await send('/profiles/retail-handheld/current')).json()).revision, 1);
});
