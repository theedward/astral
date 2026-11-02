// Build outside cloud-synced folders, whose Finder metadata can invalidate codesign.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const run = promisify(execFile);
if (process.platform !== 'darwin') throw Error('Build macOS packages on macOS.');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = await fs.mkdtemp(path.join(os.tmpdir(), 'astral-mac-build-'));
try {
  const result = await run(
    process.execPath,
    [
      path.join(root, 'node_modules/electron-builder/cli.js'),
      '--mac',
      'dir',
      'zip',
      '--arm64',
      '--publish',
      'never',
      `--config.directories.output=${output}`,
    ],
    { cwd: root, maxBuffer: 10 * 1024 * 1024 },
  );
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  await run('/usr/bin/codesign', [
    '--verify',
    '--deep',
    '--strict',
    path.join(output, 'mac-arm64/Astral.app'),
  ]);
  const { version } = JSON.parse(await fs.readFile(path.join(root, 'package.json')));
  const name = `Astral-${version}-mac-arm64.zip`;
  await fs.mkdir(path.join(root, 'release'), { recursive: true });
  await fs.copyFile(path.join(output, name), path.join(root, 'release', name));
  console.log(`Verified macOS archive: release/${name}`);
} finally {
  await fs.rm(output, { recursive: true, force: true });
}
