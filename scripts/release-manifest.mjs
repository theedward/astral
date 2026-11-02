import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(await fs.readFile(path.join(root, 'package.json')));
const directory = process.argv[2] || path.join(root, 'release');
if (!process.env.ASTRAL_RELEASE_PRIVATE_KEY) throw Error('ASTRAL_RELEASE_PRIVATE_KEY is required.');
const publicKey = await fs.readFile(path.join(root, 'desktop/update-public-key.pem'));
const key = crypto.createPrivateKey(process.env.ASTRAL_RELEASE_PRIVATE_KEY);
const expectedKey = crypto.createPublicKey(publicKey).export({ type: 'spki', format: 'der' });
if (!crypto.createPublicKey(key).export({ type: 'spki', format: 'der' }).equals(expectedKey))
  throw Error('Release key does not match the pinned application key.');
const assets = {};
for (const [id, name] of [
  ['darwin-arm64', `Astral-${version}-mac-arm64.zip`],
  ['win32-x64', `Astral-${version}-win-x64.exe`],
]) {
  const bytes = await fs.readFile(path.join(directory, name));
  assets[id] = {
    url: `https://github.com/theedward/astral/releases/download/v${version}/${name}`,
    size: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  };
}
const notes = await fs.readFile(path.join(root, 'CHANGELOG.md'), 'utf8');
const payload = Buffer.from(
  JSON.stringify({
    schema: 1,
    repository: 'theedward/astral',
    version,
    notes: notes.split(/^## /m)[1]?.slice(0, 20000) || '',
    assets,
  }),
);
await fs.writeFile(
  path.join(directory, 'astral-update.json'),
  JSON.stringify({
    payload: payload.toString('base64'),
    signature: crypto.sign(null, payload, key).toString('base64'),
  }) + '\n',
);
console.log(`Signed update manifest for Astral ${version}.`);
