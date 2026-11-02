// Display the author's declared artwork from the local game installation.
// Addon artwork is not bundled in Astral or relicensed as our source code.
const fs = require('node:fs/promises'),
  path = require('node:path'),
  zlib = require('node:zlib');
const cache = new Map();
function chunk(type, data) {
  const name = Buffer.from(type),
    length = Buffer.alloc(4),
    crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  crc.writeUInt32BE(zlib.crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
function png(width, height, pixels) {
  if (
    width < 1 ||
    height < 1 ||
    width * height > 1024 * 1024 ||
    pixels.length !== width * height * 4
  )
    throw Error('Unsupported icon dimensions.');
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++)
    Buffer.from(pixels.buffer, pixels.byteOffset + y * width * 4, width * 4).copy(
      rows,
      y * (width * 4 + 1) + 1,
    );
  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
function tga(data) {
  if (
    data.length < 18 ||
    data[1] !== 0 ||
    ![2, 10].includes(data[2]) ||
    ![24, 32].includes(data[16])
  )
    throw Error('Unsupported TGA icon.');
  const width = data.readUInt16LE(12),
    height = data.readUInt16LE(14),
    bpp = data[16] / 8,
    count = width * height;
  if (!width || !height || count > 1024 * 1024) throw Error('Unsupported icon size.');
  const rgba = Buffer.alloc(count * 4);
  let at = 18 + data[0],
    index = 0;
  const pixel = () => {
    if (at + bpp > data.length) throw Error('Truncated TGA icon.');
    const color = [data[at + 2], data[at + 1], data[at], bpp === 4 ? data[at + 3] : 255];
    at += bpp;
    return color;
  };
  const put = (color) => {
    if (index >= count) throw Error('Invalid TGA packet.');
    let x = index % width,
      y = Math.floor(index / width);
    if (data[17] & 16) x = width - 1 - x;
    if (!(data[17] & 32)) y = height - 1 - y;
    rgba.set(color, (y * width + x) * 4);
    index++;
  };
  while (index < count) {
    if (data[2] === 2) put(pixel());
    else {
      if (at >= data.length) throw Error('Truncated TGA packet.');
      const packet = data[at++],
        n = (packet & 127) + 1;
      if (packet & 128) {
        const color = pixel();
        for (let i = 0; i < n; i++) put(color);
      } else for (let i = 0; i < n; i++) put(pixel());
    }
  }
  return { width, height, data: rgba };
}
async function casePath(root, parts) {
  let p = root;
  for (const part of parts) {
    const entries = await fs.readdir(p);
    const actual = entries.find((e) => e.toLowerCase() === part.toLowerCase());
    if (!actual) return null;
    p = path.join(p, actual);
  }
  return p;
}
async function icon(root, reference) {
  if (typeof reference !== 'string' || !/^Interface[\\/]AddOns[\\/]/i.test(reference)) return null;
  const parts = reference.split(/[\\/]/);
  if (parts.some((p) => !p || p === '.' || p === '..' || p.includes(':'))) return null;
  try {
    let file;
    for (const ext of /\.(png|jpe?g|tga|blp)$/i.test(reference) ? [''] : ['.tga', '.blp', '.png']) {
      const copy = [...parts];
      copy[copy.length - 1] += ext;
      file = await casePath(root, copy);
      if (file) break;
    }
    if (!file) return null;
    const real = await fs.realpath(file),
      base = await fs.realpath(path.join(root, 'Interface', 'AddOns'));
    if (!real.startsWith(base + path.sep)) return null;
    const stat = await fs.stat(real);
    if (stat.size > 8 * 1024 * 1024) return null;
    const key = real + ':' + stat.mtimeMs;
    const prior = cache.get(key);
    if (prior) return prior;
    const raw = await fs.readFile(real);
    let bytes;
    if (/\.png$/i.test(real)) bytes = raw;
    else if (/\.jpe?g$/i.test(real)) return 'data:image/jpeg;base64,' + raw.toString('base64');
    else if (/\.tga$/i.test(real)) {
      const image = tga(raw);
      bytes = png(image.width, image.height, image.data);
    } else if (/\.blp$/i.test(real)) {
      const { Blp, BLP_IMAGE_FORMAT } = await import('@wowserhq/format');
      if (raw.length < 20 || raw.readUInt32LE(12) * raw.readUInt32LE(16) > 1024 * 1024) return null;
      const source = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
      const image = new Blp().load(source).getImage(0, BLP_IMAGE_FORMAT.IMAGE_ABGR8888);
      bytes = png(image.width, image.height, new Uint8Array(image.data));
    } else return null;
    const result = 'data:image/png;base64,' + bytes.toString('base64');
    if (cache.size > 100) cache.clear();
    cache.set(key, result);
    return result;
  } catch {
    return null;
  }
}
module.exports = { icon, tga, png };
