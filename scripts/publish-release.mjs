// Run locally after CI prepares the draft. The private key never leaves this machine.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const keyFile = process.argv[2];
if (!keyFile) throw Error('Usage: node scripts/publish-release.mjs /path/to/local-private-key.pem');
const keyInfo = await fs.stat(keyFile);
if (process.platform !== 'win32' && keyInfo.mode & 0o077)
  throw Error('The release key must be readable only by its owner (chmod 600).');
const { version } = JSON.parse(await fs.readFile(path.join(root, 'package.json')));
const tag = 'v' + version,
  repo = 'theedward/astral';
const gh = async (args) =>
  (await run('gh', [...args, '--repo', repo], { maxBuffer: 1024 * 1024 })).stdout;
const release = JSON.parse(await gh(['release', 'view', tag, '--json', 'tagName,isDraft,assets']));
if (release.tagName !== tag || !release.isDraft)
  throw Error('Only the matching draft release may be signed and published.');
const names = [`Astral-${version}-mac-arm64.zip`, `Astral-${version}-win-x64.exe`];
for (const name of names)
  if (!release.assets.some((a) => a.name === name && a.size > 0 && a.size <= 600 * 1024 * 1024))
    throw Error('Both platform installers must be present before publication.');
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'astral-publish-'));
try {
  await gh(['release', 'download', tag, '--dir', temp, ...names.flatMap((n) => ['--pattern', n])]);
  await run(process.execPath, [path.join(root, 'scripts/release-manifest.mjs'), temp], {
    env: { ...process.env, ASTRAL_RELEASE_PRIVATE_KEY: await fs.readFile(keyFile, 'utf8') },
  });
  await gh(['release', 'upload', tag, path.join(temp, 'astral-update.json'), '--clobber']);
  await gh(['release', 'edit', tag, '--draft=false', '--latest']);
  console.log(`Published verified release: https://github.com/${repo}/releases/tag/${tag}`);
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}
