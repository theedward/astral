import { crc32 } from 'node:zlib';
export function zip(files) {
  let offset = 0;
  const local = [],
    central = [];
  for (const [name, value] of Object.entries(files)) {
    const filename = Buffer.from(name),
      data = Buffer.from(typeof value === 'string' ? value : value.data),
      crc = crc32(data),
      h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50);
    h.writeUInt16LE(20, 4);
    h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(data.length, 18);
    h.writeUInt32LE(data.length, 22);
    h.writeUInt16LE(filename.length, 26);
    local.push(h, filename, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50);
    c.writeUInt16LE(0x0314, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(data.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(filename.length, 28);
    if (value.mode) c.writeUInt32LE((value.mode << 16) >>> 0, 38);
    c.writeUInt32LE(offset, 42);
    central.push(c, filename);
    offset += h.length + filename.length + data.length;
  }
  const body = Buffer.concat(local),
    dir = Buffer.concat(central),
    end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(body.length, 16);
  return Buffer.concat([body, dir, end]);
}
