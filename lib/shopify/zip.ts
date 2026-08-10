import type { ThemeFile } from './types';

/**
 * Minimal, dependency-free ZIP writer (STORE / no compression). A stored ZIP is
 * a fully standard archive that Shopify's theme importer accepts, so we avoid
 * pulling in a compression library and keep the export self-contained. Runs in
 * the browser; returns the archive bytes ready to wrap in a Blob for upload +
 * download.
 *
 * Only the features a theme ZIP needs are implemented: local file headers, a
 * central directory, and the end-of-central-directory record, with the UTF-8
 * filename flag set (bit 11).
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toBytes(contents: string | Uint8Array): Uint8Array {
  return typeof contents === 'string' ? new TextEncoder().encode(contents) : contents;
}

interface Entry {
  nameBytes: Uint8Array;
  data: Uint8Array;
  crc: number;
  offset: number;
}

/** Build a STORE-method ZIP archive from the theme's files. */
export function createZip(files: ThemeFile[]): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const entries: Entry[] = [];
  let offset = 0;

  const push = (bytes: Uint8Array) => {
    chunks.push(bytes);
    offset += bytes.length;
  };

  const localHeader = (nameBytes: Uint8Array, crc: number, size: number): Uint8Array => {
    const h = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(h.buffer);
    view.setUint32(0, 0x04034b50, true); // local file header signature
    view.setUint16(4, 20, true); // version needed
    view.setUint16(6, 0x0800, true); // flags: UTF-8 filename
    view.setUint16(8, 0, true); // method: store
    view.setUint16(10, 0, true); // mod time
    view.setUint16(12, 0, true); // mod date
    view.setUint32(14, crc, true);
    view.setUint32(18, size, true); // compressed size
    view.setUint32(22, size, true); // uncompressed size
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true); // extra length
    h.set(nameBytes, 30);
    return h;
  };

  // Local file headers + data.
  for (const file of files) {
    const nameBytes = encoder.encode(file.path);
    const data = toBytes(file.contents);
    const crc = crc32(data);
    const entryOffset = offset;
    push(localHeader(nameBytes, crc, data.length));
    push(data);
    entries.push({ nameBytes, data, crc, offset: entryOffset });
  }

  // Central directory.
  const cdStart = offset;
  for (const entry of entries) {
    const c = new Uint8Array(46 + entry.nameBytes.length);
    const view = new DataView(c.buffer);
    view.setUint32(0, 0x02014b50, true); // central dir header signature
    view.setUint16(4, 20, true); // version made by
    view.setUint16(6, 20, true); // version needed
    view.setUint16(8, 0x0800, true); // flags: UTF-8
    view.setUint16(10, 0, true); // method: store
    view.setUint16(12, 0, true); // mod time
    view.setUint16(14, 0, true); // mod date
    view.setUint32(16, entry.crc, true);
    view.setUint32(20, entry.data.length, true); // compressed size
    view.setUint32(24, entry.data.length, true); // uncompressed size
    view.setUint16(28, entry.nameBytes.length, true);
    view.setUint16(30, 0, true); // extra length
    view.setUint16(32, 0, true); // comment length
    view.setUint16(34, 0, true); // disk number start
    view.setUint16(36, 0, true); // internal attrs
    view.setUint32(38, 0, true); // external attrs
    view.setUint32(42, entry.offset, true); // local header offset
    c.set(entry.nameBytes, 46);
    push(c);
  }
  const cdSize = offset - cdStart;

  // End of central directory record.
  const eocd = new Uint8Array(22);
  const view = new DataView(eocd.buffer);
  view.setUint32(0, 0x06054b50, true); // EOCD signature
  view.setUint16(4, 0, true); // disk number
  view.setUint16(6, 0, true); // disk with central dir
  view.setUint16(8, entries.length, true); // entries on this disk
  view.setUint16(10, entries.length, true); // total entries
  view.setUint32(12, cdSize, true);
  view.setUint32(16, cdStart, true);
  view.setUint16(20, 0, true); // comment length
  push(eocd);

  // Concatenate all chunks into one buffer.
  const out = new Uint8Array(offset);
  let pos = 0;
  for (const chunk of chunks) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out;
}
