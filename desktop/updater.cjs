const path = require('node:path');
const engine = require('./engine.cjs');
const { allowed, flavor } = require('./flavors.cjs');
const DAY = 24 * 60 * 60 * 1000;
const { newer } = engine;
async function status(data) {
  return engine.json(path.join(data, 'daily-updates.json'), { nextAt: 0, runs: [] });
}
async function run({
  data,
  roots,
  ignored = {},
  legacyRio = false,
  force = false,
  now = Date.now(),
  onProgress = () => {},
  api = engine,
}) {
  const previous = await status(data);
  if (!force && now < (previous.nextAt || 0)) return previous;
  if (await api.gameRunning())
    return { ...previous, deferred: true, reason: 'Waiting for WoW to close.' };
  const report = { time: new Date(now).toISOString(), results: [], status: 'complete' };
  for (const root of [...new Set(roots)]) {
    const type = flavor(root),
      inv = await api.inventory(root, data);
    for (const addon of inv.addons) {
      if (
        (!addon.repo && !addon.bundled) ||
        !allowed(addon, type) ||
        ignored[type]?.includes(addon.id)
      )
        continue;
      if (legacyRio && addon.id === 'rio') {
        report.results.push({
          id: addon.id,
          name: addon.name,
          client: type,
          status: 'external',
          message: 'Handled by the existing daily Raider.IO updater on this Mac.',
        });
        continue;
      }
      if (await api.gameRunning()) {
        report.status = 'deferred';
        break;
      }
      try {
        onProgress({ id: addon.id, kind: 'update', percent: 0, message: 'Checking ' + addon.name });
        const release = await api.getRelease(addon, data, true),
          upgrade = newer(addon, release);
        if (upgrade === null) {
          report.results.push({
            id: addon.id,
            name: addon.name,
            client: type,
            status: 'review',
            message: 'Version format needs a manual review.',
          });
          continue;
        }
        if (!upgrade) {
          report.results.push({ id: addon.id, name: addon.name, client: type, status: 'current' });
          continue;
        }
        await api.install(addon, root, data, release, (percent) =>
          onProgress({ id: addon.id, kind: 'update', percent, message: 'Updating ' + addon.name }),
        );
        report.results.push({
          id: addon.id,
          name: addon.name,
          client: type,
          status: 'updated',
          from: addon.version,
          to: release.version,
          notes: release.notes || '',
        });
      } catch (e) {
        report.status = 'attention';
        report.results.push({
          id: addon.id,
          name: addon.name,
          client: type,
          status: 'error',
          message: e.message,
        });
        if (/WoW started|Close World of Warcraft/.test(e.message)) {
          report.status = 'deferred';
          break;
        }
        if (/rate limit/i.test(e.message)) {
          report.status = 'attention';
          break;
        }
      }
    }
    if (report.status !== 'complete') break;
  }
  const result = {
    nextAt:
      now + (report.status === 'deferred' ? 60000 : report.status === 'attention' ? 3600000 : DAY),
    runs: [report, ...(previous.runs || [])].slice(0, 14),
  };
  await engine.save(path.join(data, 'daily-updates.json'), result);
  return result;
}
module.exports = { newer, status, run };
