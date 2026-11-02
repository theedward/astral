const now = () => Math.floor(Date.now() / 1000);
const q = (env, sql, ...args) => env.DB.prepare(sql).bind(...args);
const json = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
const bounded = (value, max) =>
  value === undefined ? max : Math.max(0, Math.min(max, Number(value) || 0));
export function limits(env) {
  return {
    userBytes: bounded(env.ASTRAL_USER_BYTES, 10 * 1024 * 1024),
    serviceBytes: bounded(env.ASTRAL_SERVICE_BYTES, 50 * 1024 * 1024),
    snapshotCharacters: 1400000,
    retained: 5,
    userUploadsPerDay: 60,
    serviceUploadsPerDay: 200,
    requestsPerDay: 20000,
  };
}
const day = () => Math.floor(now() / 86400);
const uploadKey = (user) => 'uploads:' + day() + ':' + user;
export async function requestBudget(env) {
  const result = await q(
    env,
    'INSERT INTO rate_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<? RETURNING count',
    'requests:' + day(),
    (day() + 2) * 86400,
    limits(env).requestsPerDay,
  ).first();
  return !!result;
}
export async function usage(env, user) {
  const cap = limits(env);
  const row = await q(
    env,
    'SELECT COALESCE(SUM(bytes),0) AS bytes,COUNT(*) AS snapshots FROM snapshots WHERE user_id=?',
    user,
  ).first();
  const service = await q(env, 'SELECT COALESCE(SUM(bytes),0) AS bytes FROM snapshots').first();
  const uploads = await q(
    env,
    'SELECT count FROM rate_limits WHERE key=?',
    uploadKey(user),
  ).first();
  const globalUploads = await q(
    env,
    'SELECT count FROM rate_limits WHERE key=?',
    uploadKey('service'),
  ).first();
  return {
    bytes: row.bytes,
    snapshots: row.snapshots,
    limitBytes: cap.userBytes,
    uploadsToday: uploads?.count || 0,
    uploadsPerDay: cap.userUploadsPerDay,
    retainedPerClient: cap.retained,
    snapshotLimitCharacters: cap.snapshotCharacters,
    serviceAtCapacity: service.bytes >= cap.serviceBytes,
    paused:
      row.bytes >= cap.userBytes ||
      service.bytes >= cap.serviceBytes ||
      (uploads?.count || 0) >= cap.userUploadsPerDay ||
      (globalUploads?.count || 0) >= cap.serviceUploadsPerDay,
    spendingLimitUSD: 0,
    policy: 'Free plan only. Uploads pause at limits; Astral never upgrades billing.',
  };
}
async function payload(env, id) {
  const rows = await q(
    env,
    'SELECT content FROM chunks WHERE snapshot_id=? ORDER BY position',
    id,
  ).all();
  return rows.results.map((r) => r.content).join('');
}
export async function saveSnapshot(env, who, flavor, b, random) {
  if (
    !Number.isSafeInteger(b.revision) ||
    b.revision < 0 ||
    typeof b.payload !== 'string' ||
    b.payload.length > limits(env).snapshotCharacters ||
    !b.payload.length ||
    !b.payload.match(/^[A-Za-z0-9+/=]+$/) ||
    !String(b.hash).match(/^[0-9a-f]{64}$/)
  )
    return json({ error: 'Invalid or oversized settings snapshot.' }, 400);
  const cap = limits(env),
    id = random(),
    updated = new Date().toISOString(),
    revision = b.revision + 1;
  const owned = 'EXISTS(SELECT 1 FROM profiles WHERE user_id=? AND flavor=? AND snapshot_id=?)';
  const ownArgs = [who.user_id, flavor, id];
  const statements = [
    q(
      env,
      'INSERT INTO profiles(user_id,flavor,revision) VALUES(?,?,0) ON CONFLICT(user_id,flavor) DO NOTHING',
      who.user_id,
      flavor,
    ),
    q(
      env,
      `UPDATE profiles SET revision=?,snapshot_id=?,hash=?,updated=? WHERE user_id=? AND flavor=? AND revision=?
      AND COALESCE((SELECT SUM(bytes) FROM snapshots),0)+?<=?
      AND COALESCE((SELECT SUM(bytes) FROM snapshots WHERE user_id=?),0)+?<=?
      AND COALESCE((SELECT count FROM rate_limits WHERE key=?),0)<?
      AND COALESCE((SELECT count FROM rate_limits WHERE key=?),0)<?`,
      revision,
      id,
      b.hash,
      updated,
      who.user_id,
      flavor,
      b.revision,
      b.payload.length,
      cap.serviceBytes,
      who.user_id,
      b.payload.length,
      cap.userBytes,
      uploadKey('service'),
      cap.serviceUploadsPerDay,
      uploadKey(who.user_id),
      cap.userUploadsPerDay,
    ),
    q(
      env,
      `INSERT INTO snapshots(id,user_id,flavor,revision,created,hash,bytes,files,device_label) SELECT ?,?,?,?,?,?,?,?,? WHERE ${owned}`,
      id,
      who.user_id,
      flavor,
      revision,
      updated,
      b.hash,
      b.payload.length,
      Number.isSafeInteger(b.files) && b.files >= 0 && b.files <= 2000 ? b.files : null,
      who.label || 'Astral',
      ...ownArgs,
    ),
  ];
  for (let at = 0; at < b.payload.length; at += 65536)
    statements.push(
      q(
        env,
        `INSERT INTO chunks(snapshot_id,position,content) SELECT ?,?,? WHERE ${owned}`,
        id,
        at / 65536,
        b.payload.slice(at, at + 65536),
        ...ownArgs,
      ),
    );
  for (const key of [uploadKey('service'), uploadKey(who.user_id)])
    statements.push(
      q(
        env,
        `INSERT INTO rate_limits(key,count,expires) SELECT ?,1,? WHERE ${owned} ON CONFLICT(key) DO UPDATE SET count=count+1`,
        key,
        (day() + 2) * 86400,
        ...ownArgs,
      ),
    );
  const results = await env.DB.batch(statements);
  if (results[1].meta.changes !== 1) {
    const current = await q(
      env,
      'SELECT revision FROM profiles WHERE user_id=? AND flavor=?',
      who.user_id,
      flavor,
    ).first();
    if (current?.revision !== b.revision)
      return json({ error: 'The cloud setup changed. Review both versions before syncing.' }, 409);
    return json(
      {
        error:
          'Cloud uploads are paused at the free storage or daily upload limit. Your local setup is unchanged. Try tomorrow or remove old cloud data.',
        code: 'quota',
      },
      507,
    );
  }
  await env.DB.batch([
    q(
      env,
      'DELETE FROM chunks WHERE snapshot_id IN (SELECT id FROM snapshots WHERE user_id=? AND flavor=? ORDER BY revision DESC LIMIT -1 OFFSET ?)',
      who.user_id,
      flavor,
      cap.retained,
    ),
    q(
      env,
      'DELETE FROM snapshots WHERE user_id=? AND flavor=? AND id IN (SELECT id FROM snapshots WHERE user_id=? AND flavor=? ORDER BY revision DESC LIMIT -1 OFFSET ?)',
      who.user_id,
      flavor,
      who.user_id,
      flavor,
      cap.retained,
    ),
  ]);
  return json({ revision, updated });
}
export async function controls(request, env, who, body, random) {
  const path = new URL(request.url).pathname;
  const cloud = path.match(/^\/cloud\/(retail|forever)$/);
  if (cloud && request.method === 'GET') {
    const flavor = cloud[1];
    const devices = await q(
      env,
      'SELECT id,label,created,last_seen,expires FROM sessions WHERE user_id=? AND expires>? ORDER BY last_seen DESC LIMIT 100',
      who.user_id,
      now(),
    ).all();
    const profile = await q(
      env,
      'SELECT snapshot_id,revision,updated FROM profiles WHERE user_id=? AND flavor=?',
      who.user_id,
      flavor,
    ).first();
    const history = await q(
      env,
      'SELECT id,revision,created,hash,bytes,files,device_label FROM snapshots WHERE user_id=? AND flavor=? ORDER BY revision DESC LIMIT 5',
      who.user_id,
      flavor,
    ).all();
    return json({
      devices: devices.results.map((d) => ({ ...d, current: d.id === who.id })),
      history: history.results.map((s) => ({ ...s, current: s.id === profile?.snapshot_id })),
      usage: await usage(env, who.user_id),
      revision: profile?.revision || 0,
    });
  }
  const device = path.match(/^\/devices\/([A-Za-z0-9_-]{32,64})$/);
  if (device && request.method === 'DELETE') {
    const r = await q(
      env,
      'DELETE FROM sessions WHERE id=? AND user_id=?',
      device[1],
      who.user_id,
    ).run();
    if (!r.meta.changes) return json({ error: 'That device was not found.' }, 404);
    return json({ revoked: true, current: device[1] === who.id });
  }
  const history = path.match(
    /^\/profiles\/(retail|forever)\/history\/([A-Za-z0-9_-]{43})(\/restore)?$/,
  );
  if (history) {
    const [_, flavor, id, restore] = history;
    const snapshot = await q(
      env,
      'SELECT * FROM snapshots WHERE id=? AND user_id=? AND flavor=?',
      id,
      who.user_id,
      flavor,
    ).first();
    if (!snapshot) return json({ error: 'That cloud backup was not found.' }, 404);
    if (!restore && request.method === 'GET')
      return json({ ...snapshot, user_id: undefined, payload: await payload(env, id) });
    if (restore && request.method === 'POST') {
      const b = await body(request);
      if (!snapshot.hash && (!b.hash || !String(b.hash).match(/^[0-9a-f]{64}$/)))
        return json({ error: 'The old backup must be verified before restoration.' }, 400);
      return saveSnapshot(
        env,
        { ...who, label: 'Restored cloud backup' },
        flavor,
        {
          revision: b.revision,
          payload: await payload(env, id),
          hash: snapshot.hash || b.hash,
          files: snapshot.files,
        },
        random,
      );
    }
  }
  if (path === '/account/data' && request.method === 'DELETE') {
    const b = await body(request);
    if (b.confirm !== 'DELETE') return json({ error: 'Confirm cloud deletion first.' }, 400);
    await env.DB.batch([
      q(
        env,
        'DELETE FROM chunks WHERE snapshot_id IN (SELECT id FROM snapshots WHERE user_id=?)',
        who.user_id,
      ),
      q(env, 'DELETE FROM snapshots WHERE user_id=?', who.user_id),
      q(env, 'DELETE FROM profiles WHERE user_id=?', who.user_id),
      q(env, 'DELETE FROM sessions WHERE user_id=?', who.user_id),
      q(env, 'DELETE FROM pairs WHERE user_id=?', who.user_id),
      q(env, 'DELETE FROM users WHERE id=?', who.user_id),
      q(env, 'DELETE FROM rate_limits WHERE key LIKE ?', 'uploads:%:' + who.user_id),
    ]);
    return json({ deleted: true });
  }
  return null;
}
