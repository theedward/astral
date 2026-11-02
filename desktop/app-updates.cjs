// Astral application updates. No addon paths or account credentials are involved.
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
const REPO = 'theedward/astral';
const BASE = `https://github.com/${REPO}/releases/download/`;
const MAX = 600 * 1024 * 1024;
function version(v) {
  if (!/^\d+\.\d+\.\d+$/.test(v)) throw Error('Invalid release version.');
  return v.split('.').map(Number);
}
function newer(next, current) {
  const a = version(next),
    b = version(current);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}
function verify(envelope, key, platform, arch) {
  if (
    typeof envelope.payload !== 'string' ||
    typeof envelope.signature !== 'string' ||
    envelope.payload.length > 100000
  )
    throw Error('Invalid update manifest.');
  const bytes = Buffer.from(envelope.payload, 'base64');
  if (!crypto.verify(null, bytes, key, Buffer.from(envelope.signature, 'base64')))
    throw Error('The update signature could not be verified.');
  const manifest = JSON.parse(bytes.toString('utf8'));
  version(manifest.version);
  if (manifest.schema !== 1 || manifest.repository !== REPO)
    throw Error('Unexpected update publisher.');
  const asset = manifest.assets?.[`${platform}-${arch}`];
  if (!asset) throw Error('There is no update for this computer yet.');
  const expected =
    platform === 'darwin'
      ? `Astral-${manifest.version}-mac-${arch}.zip`
      : `Astral-${manifest.version}-win-${arch}.exe`;
  if (
    asset.url !== BASE + `v${manifest.version}/` + expected ||
    !/^[a-f0-9]{64}$/.test(asset.sha256) ||
    !Number.isSafeInteger(asset.size) ||
    asset.size < 1 ||
    asset.size > MAX
  )
    throw Error('Invalid update download.');
  return { version: manifest.version, notes: String(manifest.notes || '').slice(0, 20000), asset };
}
async function smallJSON(response) {
  if (!response.ok) throw Error(`Update server returned ${response.status}.`);
  let text = '';
  for await (const chunk of response.body) {
    text += Buffer.from(chunk).toString('utf8');
    if (text.length > 150000) throw Error('Update response is too large.');
  }
  return JSON.parse(text);
}
// ZIP extraction uses ditto to retain framework symlinks. Inspect every entry first.
async function inspectZip(file) {
  const yauzl = require('yauzl');
  return new Promise((resolve, reject) => {
    yauzl.open(file, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
      if (error) return reject(error);
      const names = new Set(),
        canonical = new Set(),
        links = [],
        files = [];
      let total = 0,
        unpacked = 0;
      const fail = (e) => {
        zip.close();
        reject(e);
      };
      zip.on('error', fail);
      zip.on('entry', (entry) => {
        const name = entry.fileName;
        const normalized = name.normalize('NFD').toLowerCase().replace(/\/$/, '');
        if (
          !name.startsWith('Astral.app/') ||
          name.includes('\\') ||
          name.split('/').some((p) => p === '..' || p === '.') ||
          canonical.has(normalized) ||
          ++total > 50000
        )
          return fail(Error('Unsafe application archive.'));
        unpacked += entry.uncompressedSize;
        if (unpacked > 2 * 1024 * 1024 * 1024)
          return fail(Error('Application archive is too large.'));
        names.add(name);
        canonical.add(normalized);
        files.push(name);
        const type = (entry.externalFileAttributes >>> 16) & 0o170000;
        if (type === 0o120000) {
          if (entry.uncompressedSize > 4096) return fail(Error('Invalid archive link.'));
          zip.openReadStream(entry, (error, stream) => {
            if (error) return fail(error);
            const chunks = [];
            let size = 0;
            stream.on('error', fail);
            stream.on('data', (c) => {
              chunks.push(c);
              size += c.length;
              if (size > 4096) stream.destroy(Error('Invalid archive link.'));
            });
            stream.on('end', () => {
              const target = Buffer.concat(chunks).toString('utf8');
              const resolved = path.posix.normalize(
                path.posix.join(path.posix.dirname(name), target),
              );
              if (
                !target ||
                target.includes('\0') ||
                target.includes('\\') ||
                path.posix.isAbsolute(target) ||
                !resolved.startsWith('Astral.app/')
              )
                return fail(Error('Archive link escapes the application.'));
              links.push(name);
              zip.readEntry();
            });
          });
        } else if (![0, 0o100000, 0o040000].includes(type))
          fail(Error('Unsupported archive entry.'));
        else zip.readEntry();
      });
      zip.on('end', () => {
        if (
          links.some((link) =>
            files.some((name) =>
              name
                .normalize('NFD')
                .toLowerCase()
                .startsWith(link.normalize('NFD').toLowerCase() + '/'),
            ),
          )
        )
          return reject(Error('Archive writes through a link.'));
        if (!names.has('Astral.app/Contents/Info.plist'))
          return reject(Error('Application is missing from the archive.'));
        resolve();
      });
      zip.readEntry();
    });
  });
}
class AppUpdates {
  constructor({
    data,
    current,
    platform = process.platform,
    arch = process.arch,
    fetcher = fetch,
    changed = () => {},
  }) {
    Object.assign(this, { data, current, platform, arch, fetcher, changed });
    this.status = { current, phase: 'idle', checkedAt: null };
  }
  set(value) {
    Object.assign(this.status, value);
    this.changed();
  }
  async check() {
    if (this.active) throw Error('An Astral update operation is already running.');
    this.active = true;
    this.set({ phase: 'checking', error: null });
    try {
      const response = await this.fetcher(`https://api.github.com/repos/${REPO}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(20000),
      });
      if (response.status === 404) {
        this.release = null;
        this.downloaded = null;
        this.set({ phase: 'unpublished', latest: null, checkedAt: Date.now() });
        return this.status;
      }
      const release = await smallJSON(response);
      if (release.draft || release.prerelease || !/^v\d+\.\d+\.\d+$/.test(release.tag_name))
        throw Error('Invalid stable release.');
      const url = BASE + release.tag_name + '/astral-update.json';
      const envelope = await smallJSON(
        await this.fetcher(url, { signal: AbortSignal.timeout(20000) }),
      );
      const key = await fs.readFile(path.join(__dirname, 'update-public-key.pem'));
      const verified = verify(envelope, key, this.platform, this.arch);
      if ('v' + verified.version !== release.tag_name)
        throw Error('Release metadata does not match its tag.');
      const available = newer(verified.version, this.current);
      if (this.release?.version !== verified.version) this.downloaded = null;
      this.release = available ? verified : null;
      this.set({
        phase: available ? (this.downloaded ? 'ready' : 'available') : 'current',
        latest: verified.version,
        notes: verified.notes,
        checkedAt: Date.now(),
      });
    } catch (e) {
      this.set({ phase: 'error', error: e.message });
      throw e;
    } finally {
      this.active = false;
    }
    return this.status;
  }
  async download() {
    if (this.active) throw Error('An Astral update operation is already running.');
    if (!this.release || !newer(this.release.version, this.current))
      throw Error('Check for a newer Astral release first.');
    this.active = true;
    this.downloaded = null;
    this.set({ phase: 'downloading', error: null, percent: 0 });
    const dir = path.join(this.data, 'app-updates');
    const file = path.join(dir, this.platform === 'darwin' ? 'update.zip' : 'update.exe');
    const partial = file + '.partial';
    try {
      await fs.mkdir(dir, { recursive: true, mode: 0o700 });
      await fs.rm(partial, { force: true });
      const { asset } = this.release;
      const response = await this.fetcher(asset.url, { signal: AbortSignal.timeout(600000) });
      if (!response.ok) throw Error(`Download returned ${response.status}.`);
      const output = await fs.open(partial, 'wx', 0o600);
      let size = 0,
        last = -1;
      const hash = crypto.createHash('sha256');
      try {
        for await (const chunk of response.body) {
          size += chunk.length;
          if (size > asset.size) throw Error('The update is larger than expected.');
          hash.update(chunk);
          await output.writeFile(chunk);
          const percent = Math.floor((size / asset.size) * 100);
          if (percent !== last) {
            last = percent;
            this.set({ percent });
          }
        }
      } finally {
        await output.close();
      }
      if (size !== asset.size || hash.digest('hex') !== asset.sha256)
        throw Error('The update download failed integrity verification.');
      await fs.rename(partial, file);
      this.downloaded = file;
      this.set({ phase: 'ready', percent: 100 });
      return this.status;
    } catch (e) {
      await fs.rm(partial, { force: true });
      this.set({ phase: 'error', error: e.message });
      throw e;
    } finally {
      this.active = false;
    }
  }
  async validateDownload() {
    if (!this.downloaded || !this.release) throw Error('Download the update first.');
    const hash = crypto.createHash('sha256');
    const handle = await fs.open(this.downloaded, 'r');
    let size = 0;
    try {
      for await (const chunk of handle.createReadStream()) {
        size += chunk.length;
        hash.update(chunk);
      }
    } finally {
      await handle.close();
    }
    if (size !== this.release.asset.size || hash.digest('hex') !== this.release.asset.sha256)
      throw Error('The staged update has changed. Download it again.');
  }
  async prepareMac(target) {
    await this.validateDownload();
    await inspectZip(this.downloaded);
    if (!target.endsWith('/Astral.app') || (await fs.lstat(target)).isSymbolicLink())
      throw Error('Move Astral into a writable Applications folder before updating.');
    await fs.access(path.dirname(target), require('node:fs').constants.W_OK);
    const stage = await fs.mkdtemp(path.join(path.dirname(target), '.astral-update-'));
    try {
      await run('/usr/bin/ditto', ['-xk', this.downloaded, stage]);
      const bundle = path.join(stage, 'Astral.app');
      const info = (
        await run('/usr/bin/plutil', [
          '-convert',
          'json',
          '-o',
          '-',
          path.join(bundle, 'Contents/Info.plist'),
        ])
      ).stdout;
      const plist = JSON.parse(info);
      if (
        plist.CFBundleIdentifier !== 'com.joaoseixas.astral' ||
        plist.CFBundleShortVersionString !== this.release.version
      )
        throw Error('The application identity or version does not match the release.');
      await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle]);
      const token = crypto.randomBytes(24).toString('hex');
      const ack = path.join(this.data, 'app-updates', 'ack-' + token);
      const helper = path.join(this.data, 'app-updates', 'install-mac.sh');
      await fs.copyFile(path.join(__dirname, 'install-mac.sh'), helper);
      return { target, stage, ack, token, helper };
    } catch (e) {
      await fs.rm(stage, { recursive: true, force: true });
      throw e;
    }
  }
  launchMac(plan) {
    const child = spawn(
      '/bin/sh',
      [plan.helper, String(process.pid), plan.target, plan.stage, plan.ack, plan.token],
      { detached: true, stdio: 'ignore' },
    );
    // Wait for a successful spawn before allowing the application to quit.
    return new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('spawn', () => {
        child.unref();
        resolve();
      });
    });
  }
}
module.exports = { AppUpdates, verify, newer, inspectZip };
