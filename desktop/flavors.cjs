const path = require('node:path');
function flavor(root) {
  const n = path.basename(root);
  return ['_forever_', '_classic_beta_'].includes(n) ? 'forever' : 'retail';
}
function allowed(addon, type) {
  return (addon.flavors || ['retail', 'forever']).includes(type);
}
function interfaceFor(type) {
  return type === 'forever' ? '16001' : '120105';
}
function syncAction(local, remote, lastHash, choice, lastRemoteHash = lastHash) {
  if (!remote.revision) return 'upload';
  if (remote.hash === local.hash || (local.hash === lastHash && remote.hash === lastRemoteHash))
    return 'unchanged';
  if (choice === 'cloud' || local.files === 0 || lastHash === local.hash) return 'download';
  if (choice === 'local' || remote.hash === lastRemoteHash) return 'upload';
  return 'conflict';
}
module.exports = { flavor, allowed, interfaceFor, syncAction };
