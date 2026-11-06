const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const fs = require('node:fs/promises');
const engine = require('./engine.cjs');
const settings = require('./settings.cjs');
const selection = require('./addon-selection.cjs');
const policy = require('./profile-policy.cjs');
const packages = require('./library-sync.cjs');
const validId = (id) => typeof id === 'string' && /^(regular|handheld|[a-f0-9]{32})$/.test(id);
function location(data, root, account, id) {
  if (!validId(id)) throw Error('Unknown profile.');
  const key = crypto
    .createHash('sha256')
    .update(JSON.stringify([path.resolve(root), account]))
    .digest('hex');
  return path.join(data, 'local-profiles', key, id + '.json');
}
async function read(data, root, account, id) {
  const saved = await engine.json(location(data, root, account, id), null);
  if (saved && settings.inspect(saved.payload).hash !== saved.hash)
    throw Error('The saved local profile checksum does not match.');
  return saved;
}
const encode = (bundle) => {
  const payload = zlib.gzipSync(Buffer.from(JSON.stringify(bundle))).toString('base64');
  return { payload, ...settings.inspect(payload) };
};
async function prepare({ data, root, account, from, to, edits = {} }) {
  if (!validId(from) || !validId(to)) throw Error('Unknown profile.');
  if (!edits || typeof edits !== 'object' || Array.isArray(edits))
    throw Error('Invalid addon choices.');
  const current = await settings.capture(root, account, data);
  const saved = from === to ? current : await read(data, root, account, to);
  let target = saved || current;
  let bundle = settings.decode(target.payload);
  const inventory = await engine.inventory(root, data);
  if (Object.keys(edits).length) {
    bundle.schema = 2;
    bundle.addonSelection = selection.edit(
      bundle.addonSelection || settings.decode(current.payload).addonSelection,
      inventory.addons,
      edits,
    );
    target = encode(bundle);
  }
  bundle = policy.apply(bundle, {
    root,
    profile: to,
    inventory,
    currentInput: settings.decode(current.payload).input,
  });
  target = encode(bundle);
  const packagePlan = await packages.plan({
    root,
    data,
    target: packages.required(bundle.library || [], bundle.addonSelection),
  });
  const base = await settings.accountRoot(root, account);
  if (bundle.addonSelection) await selection.plan(root, base, bundle.addonSelection);
  const before = selection.rows(settings.decode(current.payload).addonSelection, inventory.addons);
  const after = selection.rows(
    bundle.addonSelection || settings.decode(current.payload).addonSelection,
    inventory.addons,
  );
  const changes = after
    .filter((row) => before.find((old) => old.id === row.id)?.enabled !== row.enabled)
    .map((row) => ({ ...row, before: before.find((old) => old.id === row.id)?.enabled }));
  const oldFiles = new Map(
    settings.decode(current.payload).files.map((file) => [file.path, file.sha256]),
  );
  const changedSettings = bundle.files
    .filter((file) => oldFiles.get(file.path) !== file.sha256)
    .map((file) => file.path);
  if (JSON.stringify(bundle.input) !== JSON.stringify(settings.decode(current.payload).input))
    changedSettings.push('Controller settings');
  const fingerprint = crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        current: current.hash,
        target: target.hash,
        inventory: inventory.addons.map(({ id, modules, version }) => ({ id, modules, version })),
      }),
    )
    .digest('hex');
  return {
    fingerprint,
    current,
    target,
    packages: packagePlan,
    initialized: !saved,
    changes,
    changedSettings,
    rows: after,
  };
}
async function apply({
  data,
  root,
  account,
  from,
  to,
  edits = {},
  expected,
  running,
  commit = async () => {},
  onProgress = () => {},
  installPackages = packages.install,
}) {
  if (await running()) throw Error('Close WoW before changing profiles.');
  const plan = await prepare({ data, root, account, from, to, edits });
  if (plan.fingerprint !== expected) throw Error('The setup changed. Review the profile again.');
  if (plan.packages.manual.length)
    throw Error(
      'Install or connect these addons before switching: ' +
        plan.packages.manual.map((a) => a.name).join(', '),
    );
  const sourceFile = location(data, root, account, from),
    targetFile = location(data, root, account, to);
  const previousTarget = await fs.readFile(targetFile).catch(() => null);
  await engine.save(sourceFile, plan.current);
  let applied = false;
  try {
    await installPackages({
      root,
      data,
      plan: plan.packages,
      onProgress,
      afterInstall: () =>
        settings.apply(
          root,
          account,
          encode({
            schema: 2,
            files: [],
            addonSelection: settings.decode(plan.current.payload).addonSelection,
          }).payload,
          data,
          running,
        ),
    });
    await settings.apply(root, account, plan.target.payload, data, running);
    applied = true;
    await engine.save(targetFile, plan.target);
    await commit();
  } catch (error) {
    // The installer already restores partial writes; also undo a completed apply
    // if saving the active profile or preferences failed afterwards.
    if (applied) await settings.apply(root, account, plan.current.payload, data, running);
    if (from === to) await engine.save(targetFile, plan.current);
    else if (previousTarget) await fs.writeFile(targetFile, previousTarget);
    else if (from !== to) await fs.rm(targetFile, { force: true });
    throw error;
  }
  return plan;
}
module.exports = { prepare, apply, read, validId };
