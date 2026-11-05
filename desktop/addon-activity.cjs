const path = require('node:path');
const crypto = require('node:crypto');
const engine = require('./engine.cjs');

async function list(data, root) {
  const entries = await engine.json(path.join(data, 'addon-activity.json'), []);
  return (Array.isArray(entries) ? entries : []).filter(
    (entry) => entry.root === path.resolve(root),
  );
}

// Called inside the main process's exclusive mutation guard. Store outcomes only;
// package validation, rollback and game-running checks remain in the installer.
async function track(data, root, addon, action, operation) {
  const entry = {
    id: crypto.randomUUID(),
    root: path.resolve(root),
    addonId: addon.id,
    name: addon.name,
    action,
    time: new Date().toISOString(),
    from: addon.version || null,
  };
  let result, failure;
  try {
    result = await operation();
    Object.assign(entry, {
      status: result?.unchanged ? 'current' : 'success',
      to: result?.version,
      backupId: result?.id,
    });
  } catch (error) {
    failure = error;
    Object.assign(entry, { status: 'error', message: error.message });
  }
  try {
    const file = path.join(data, 'addon-activity.json');
    const entries = await engine.json(file, []);
    await engine.save(file, [entry, ...(Array.isArray(entries) ? entries : [])].slice(0, 100));
  } catch (error) {
    // An activity write must not turn a completed installation into a failed one,
    // or hide the original installer error.
    console.error('Could not save addon activity:', error.message);
  }
  if (failure) throw failure;
  return result;
}
module.exports = { list, track };
