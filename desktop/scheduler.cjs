const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execute = promisify(execFile);
const LABEL = 'com.astral.companion.daily';
const TASK = 'AstralDailyUpdates';
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c],
  );
function plist(executable) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${LABEL}</string><key>ProgramArguments</key><array><string>${escape(executable)}</string><string>--daily-update</string></array><key>ProcessType</key><string>Background</string><key>RunAtLoad</key><true/><key>StartInterval</key><integer>3600</integer><key>ThrottleInterval</key><integer>300</integer></dict></plist>\n`;
}
async function ensure({
  executable,
  enabled,
  platform = process.platform,
  home = os.homedir(),
  uid = process.getuid?.(),
  run = execute,
  files = fs,
}) {
  if (!['darwin', 'win32'].includes(platform)) return { enabled: false, supported: false };
  if (platform === 'darwin') {
    const file = path.join(home, 'Library', 'LaunchAgents', LABEL + '.plist');
    const target = `gui/${uid}/${LABEL}`;
    if (!enabled) {
      await run('/bin/launchctl', ['bootout', target]).catch(() => {});
      await files.rm(file, { force: true });
      return { enabled: false, supported: true };
    }
    const body = plist(executable);
    await files.mkdir(path.dirname(file), { recursive: true });
    const old = await files.readFile(file, 'utf8').catch(() => null);
    if (old !== body) {
      await files.writeFile(file, body, { mode: 0o600 });
      await run('/bin/launchctl', ['bootout', target]).catch(() => {});
    }
    const loaded = await run('/bin/launchctl', ['print', target]).then(
      () => true,
      () => false,
    );
    if (!loaded) await run('/bin/launchctl', ['bootstrap', `gui/${uid}`, file]);
    return { enabled: true, supported: true, label: LABEL };
  }
  if (!enabled) {
    await run('schtasks.exe', ['/Delete', '/TN', TASK, '/F']).catch(() => {});
    return { enabled: false, supported: true };
  }
  if (/["\r\n]/.test(executable)) throw Error('Invalid scheduled executable path.');
  const action = `"${executable}" --daily-update`;
  const existing = await run('schtasks.exe', ['/Query', '/TN', TASK, '/XML']).catch(() => ({
    stdout: '',
  }));
  if (!existing.stdout.includes(escape(executable)) || !existing.stdout.includes('--daily-update'))
    await run('schtasks.exe', [
      '/Create',
      '/TN',
      TASK,
      '/TR',
      action,
      '/SC',
      'HOURLY',
      '/MO',
      '1',
      '/F',
      '/IT',
    ]);
  return { enabled: true, supported: true, label: TASK };
}
module.exports = { LABEL, TASK, plist, ensure };
