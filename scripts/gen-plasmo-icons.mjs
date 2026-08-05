#!/usr/bin/env node
// Generate Plasmo's gen-assets/icon*.plasmo.png files from a source PNG.
// Auto-detects source color format (RGB vs RGBA) and emits matching output.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { deflateSync, inflateSync } from "node:zlib";
import { Buffer } from "node:buffer";

const [SRC, OUT_DIR] = process.argv.slice(2);
if (!SRC || !OUT_DIR) {
  console.error("usage: gen-plasmo-icons.mjs <source.png> <out-dir>");
  process.exit(1);
}
mkdirSync(OUT_DIR, { recursive: true });

const SIZES = [16, 32, 48, 64, 128];
const T = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  T[n] = c >>> 0;
}
const crc32 = (b) => {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = T[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const l = Buffer.alloc(4); l.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const cr = Buffer.alloc(4); cr.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([l, t, data, cr]);
}

// Parse PNG
const png = readFileSync(SRC);
let pos = 8, w, h, colorType = 6; // default RGBA
const idat = [];
while (pos < png.length) {
  const len = png.readUInt32BE(pos); pos += 4;
  const type = png.slice(pos, pos + 4).toString("ascii"); pos += 4;
  const data = png.slice(pos, pos + len); pos += len; pos += 4;
  if (type === "IHDR") {
    w = data.readUInt32BE(0);
    h = data.readUInt32BE(4);
    colorType = data[9]; // 2=RGB, 6=RGBA
  } else if (type === "IDAT") idat.push(data);
  else if (type === "IEND") break;
}
const channels = colorType === 6 ? 4 : 3;
const raw = inflateSync(Buffer.concat(idat));
console.log(`source: ${w}x${h}, colorType=${colorType} (${channels}ch)`);

// Bilinear downsample
function downscale(sw, sh, sr, dw, dh, ch) {
  const dst = Buffer.alloc(dw * dh * ch);
  const stride = sw * ch;
  for (let y = 0; y < dh; y++) {
    const sy = (y + 0.5) * sh / dh - 0.5;
    const y0 = Math.max(0, Math.floor(sy));
    const y1 = Math.min(sh - 1, y0 + 1);
    const fy = sy - y0;
    for (let x = 0; x < dw; x++) {
      const sx = (x + 0.5) * sw / dw - 0.5;
      const x0 = Math.max(0, Math.floor(sx));
      const x1 = Math.min(sw - 1, x0 + 1);
      const fx = sx - x0;
      const i00 = (y0 * sw + x0) * ch;
      const i10 = (y0 * sw + x1) * ch;
      const i01 = (y1 * sw + x0) * ch;
      const i11 = (y1 * sw + x1) * ch;
      const di = (y * dw + x) * ch;
      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;
      for (let c = 0; c < ch; c++) {
        dst[di + c] = Math.round(
          sr[i00 + c] * w00 + sr[i10 + c] * w10 + sr[i01 + c] * w01 + sr[i11 + c] * w11
        );
      }
      // If RGBA, force alpha to opaque (handles transparent sources too)
      if (ch === 4) dst[di + 3] = 255;
    }
  }
  return dst;
}

function writePNG(w, h, px, ct) {
  const ch = ct === 6 ? 4 : 3;
  const raw = Buffer.alloc(h * (w * ch + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * ch + 1)] = 0;
    px.copy(raw, y * (w * ch + 1) + 1, y * w * ch, (y + 1) * w * ch);
  }
  const compressed = deflateSync(raw);
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = ct; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", compressed), chunk("IEND", Buffer.alloc(0))]);
}

for (const sz of SIZES) {
  const px = sz === w ? Buffer.from(raw) : Buffer.from(downscale(w, h, raw, sz, sz, channels));
  const out = writePNG(sz, sz, px, colorType);
  const path = `${OUT_DIR}/icon${sz}.plasmo.png`;
  writeFileSync(path, out);
  console.log(`  wrote ${path} (${colorType === 6 ? "RGBA" : "RGB"}, ${out.length} bytes)`);
}
