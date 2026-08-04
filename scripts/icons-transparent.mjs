// Knocks the white background out of the drawn button icons.
//
// ─────────────────────────────────────────────────────────────────────────────
//  REPLACING AN ICON  (the whole workflow, in three steps)
//
//    1. Drop the artist's new PNG into  img/icons/  , keeping the SAME
//       filename (kamo-collection.png / kamogawa-log.png).
//    2. Run:  npm run icons
//    3. Commit. That's it — nothing in the app needs editing, because the
//       components import the generated file, not the original.
//
//  TOO THIN / TOO FAT?  Change one number: the icon's entry in LINE_TARGET
//  below. It's the finished line thickness as a fraction of the image's width,
//  and the script works out how much to thicken by to get there. 0.065 is a
//  line that reads clearly on the button; 0.03 is faint. Re-run npm run icons.
//
//  Because the target is a fraction rather than a pixel count, it keeps
//  meaning the same thing if the artist redraws at a different size.
// ─────────────────────────────────────────────────────────────────────────────
//
// Why this exists: the drawings arrive as black line art on an OPAQUE white
// background. Dropped into the app as-is that's a white tile sitting on the
// button, so the white has to become transparency first.
//
// It isn't a threshold. Every edge pixel in these drawings is a blend of ink
// and white, so thresholding gives jagged lines and throws away the
// antialiasing the drawing was made with. Instead each pixel is treated as
// exactly what it is — ink composited over white at some coverage — and that
// composite is undone:
//
//     observed = ink·coverage + white·(1 − coverage)
//
// Coverage comes from the darkest channel (so colour, if the art ever has
// any, survives rather than being flattened to grey), and the ink colour is
// recovered by dividing it back out. Grey edge pixels come back as black ink
// at partial alpha, which is what keeps the curves smooth.
//
// Reads  img/icons/*.png  ->  writes  img/icons/transparent/*.png
//
// No dependencies: Node's zlib does the PNG compression, and the rest is a
// minimal encoder/decoder for the one format these files use (8-bit RGBA,
// non-interlaced). It fails loudly on anything else rather than quietly
// producing a mangled file.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SRC_DIR = path.join(rootDir, 'img/icons');
const OUT_DIR = path.join(SRC_DIR, 'transparent');

/** The size the icons are actually drawn at in the app (MapControls). */
const BUTTON_PX = 22;

/**
 * How thick each icon's lines should END UP, as a fraction of the image width.
 * This is the knob — see the note at the top of the file.
 *
 * ~0.067 is the weight this UI is built around: the hand-drawn SVG icons in
 * `components/icons.tsx` use a 1.6 stroke on a 24 grid. Below about 0.045 a
 * line is under a pixel on the button and fades into the background.
 *
 * The two differ because the drawings do. The duck's lines sit far apart, so
 * it can be thickened to full weight and still read as a duck. The book draws
 * its pages about 1% of the image apart, and thickening lines toward 6.7%
 * closes gaps narrower than the lines themselves — every page merges and it
 * becomes a solid slab. 0.045 is roughly as far as it goes while its pages
 * are still separate marks; past that you're choosing a bold blob over a book.
 */
const LINE_TARGET = {
  'kamo-collection.png': 0.050,
  'kamogawa-log.png': 0.030,
  default: 0.06,
};

function crc32(buf) {
  let c;
  const table = crc32.table ?? (crc32.table = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c;
    }
    return t;
  })());
  c = -1;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Decode 8-bit RGBA, non-interlaced PNG into a flat Uint8Array. */
function decodePng(file) {
  const data = fs.readFileSync(file);
  if (data.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file}: not a PNG`);

  let pos = 8;
  let ihdr = null;
  const idat = [];
  while (pos < data.length) {
    const len = data.readUInt32BE(pos);
    const type = data.toString('latin1', pos + 4, pos + 8);
    const body = data.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      ihdr = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        depth: body[8],
        colorType: body[9],
        interlace: body[12],
      };
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (!ihdr) throw new Error(`${file}: no IHDR`);
  const { width, height, depth, colorType, interlace } = ihdr;
  if (depth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(
      `${path.basename(file)}: need 8-bit RGBA, non-interlaced ` +
        `(got depth ${depth}, colour type ${colorType}, interlace ${interlace}). ` +
        `Re-export it as RGBA PNG.`,
    );
  }

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const out = Buffer.alloc(height * stride);
  let p = 0;
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[p++];
    const line = Buffer.from(raw.subarray(p, p + stride));
    p += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? line[i - 4] : 0;
      const b = prev[i];
      const c = i >= 4 ? prev[i - 4] : 0;
      if (filter === 1) line[i] = (line[i] + a) & 0xff;
      else if (filter === 2) line[i] = (line[i] + b) & 0xff;
      else if (filter === 3) line[i] = (line[i] + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        line[i] = (line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      }
    }
    line.copy(out, y * stride);
    prev = line;
  }
  return { width, height, pixels: out };
}

function encodePng(width, height, pixels) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Undo "ink over white", per pixel. */
function keyOutWhite(width, height, px) {
  const out = Buffer.alloc(px.length);
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    // The darkest channel says how much ink covered this pixel; using min
    // rather than luminance keeps a coloured line coloured instead of grey.
    const coverage = 1 - Math.min(r, g, b) / 255;
    if (coverage <= 0.002) continue; // leave fully transparent
    const white = 255 * (1 - coverage);
    out[i] = Math.max(0, Math.min(255, Math.round((r - white) / coverage)));
    out[i + 1] = Math.max(0, Math.min(255, Math.round((g - white) / coverage)));
    out[i + 2] = Math.max(0, Math.min(255, Math.round((b - white) / coverage)));
    out[i + 3] = Math.round(coverage * 255);
  }
  return out;
}

/**
 * Exact squared Euclidean distance transform, one dimension (Felzenszwalb &
 * Huttenlocher). Run down the columns and then across the rows and you get,
 * for every pixel, the squared distance to the nearest ink pixel — in time
 * proportional to the image rather than to the radius, which matters when the
 * radius is sixty-odd pixels on a four-megapixel drawing.
 */
function edt1d(f, n) {
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
  return d;
}

/**
 * Thicken the ink by `radius` pixels — the drawing redrawn with a fatter pen,
 * rather than scaled up.
 *
 * Every pixel within `radius` of ink becomes ink, with a one-pixel ramp at the
 * new edge so the result stays antialiased instead of turning into stairsteps.
 * The ink colour is carried outward too, so a coloured drawing keeps its
 * colour in the grown region.
 */
function thicken(width, height, px, radius, inkRGB) {
  if (radius <= 0) return px;
  const INF = 1e12;
  const f = new Float64Array(width * height);
  for (let i = 0; i < width * height; i++) f[i] = px[i * 4 + 3] > 128 ? 0 : INF;

  const col = new Float64Array(height);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) col[y] = f[y * width + x];
    const d = edt1d(col, height);
    for (let y = 0; y < height; y++) f[y * width + x] = d[y];
  }
  const row = new Float64Array(width);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) row[x] = f[y * width + x];
    const d = edt1d(row, width);
    for (let x = 0; x < width; x++) f[y * width + x] = d[x];
  }

  const out = Buffer.from(px);
  for (let i = 0; i < width * height; i++) {
    const dist = Math.sqrt(f[i]);
    let a;
    if (dist <= radius) a = 255;
    else if (dist <= radius + 1) a = Math.round(255 * (1 - (dist - radius)));
    else a = 0;
    if (a > out[i * 4 + 3]) {
      out[i * 4] = inkRGB[0];
      out[i * 4 + 1] = inkRGB[1];
      out[i * 4 + 2] = inkRGB[2];
      out[i * 4 + 3] = a;
    }
  }
  return out;
}

/**
 * Trim the empty margin around the drawing.
 *
 * The originals are exported with whitespace around the subject, and that
 * whitespace is not free: the button scales the whole image down to 22px, so
 * padding inside the file comes straight off the size of the thing you're
 * trying to see. Cropping to the ink and letting the button do the framing
 * makes the drawing noticeably bigger for nothing.
 *
 * A little padding is kept so the thickened edge isn't clipped, and the result
 * is squared off so `object-fit: contain` centres it rather than pinning a
 * wide drawing to the top of a square box.
 */
function cropToInk(width, height, px, padPx = null) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (px[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { width, height, pixels: px };

  const pad =
    padPx !== null ? padPx : Math.round(Math.max(maxX - minX, maxY - minY) * 0.02);
  const side = Math.max(maxX - minX + 1, maxY - minY + 1) + pad * 2;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const left = Math.round(cx - side / 2);
  const top = Math.round(cy - side / 2);

  const out = Buffer.alloc(side * side * 4); // transparent
  for (let y = 0; y < side; y++) {
    const sy = top + y;
    if (sy < 0 || sy >= height) continue;
    for (let x = 0; x < side; x++) {
      const sx = left + x;
      if (sx < 0 || sx >= width) continue;
      px.copy(out, (y * side + x) * 4, (sy * width + sx) * 4, (sy * width + sx) * 4 + 4);
    }
  }
  return { width: side, height: side, pixels: out };
}

/** Median horizontal run of solid ink — i.e. how thick the pen was. */
function measureLine(width, height, px) {
  const runs = [];
  for (let y = 0; y < height; y += 7) {
    let run = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (px[i + 3] > 127) run++;
      else if (run) {
        runs.push(run);
        run = 0;
      }
    }
    if (run) runs.push(run);
  }
  if (!runs.length) return 0;
  runs.sort((a, b) => a - b);
  return runs[runs.length >> 1];
}

const files = fs
  .readdirSync(SRC_DIR)
  .filter((f) => f.toLowerCase().endsWith('.png'))
  .sort();
if (!files.length) {
  console.error(`No PNGs in ${SRC_DIR}`);
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const file of files) {
  const { width, height, pixels } = decodePng(path.join(SRC_DIR, file));
  const keyed = keyOutWhite(width, height, pixels);

  const target = LINE_TARGET[file] ?? LINE_TARGET.default;

  // Crop before sizing, not after. The button scales whatever the file
  // contains, so the line's thickness only means anything relative to the
  // CROPPED drawing -- measuring against the original canvas (most of which is
  // empty margin) asks for a radius far bigger than it looks.
  const tight = cropToInk(width, height, keyed, 0);
  const drawnLine = measureLine(tight.width, tight.height, tight.pixels);

  // Thickening grows a line by `r` on each side and the canvas by `r` too, so
  // solving (line + 2r) / (side + 2r) = target for r:
  const side = tight.width;
  const radius = Math.max(0, Math.round((target * side - drawnLine) / (2 * (1 - target))));

  const inkRGB = [0, 0, 0];
  for (let i = 0; i < keyed.length; i += 4) {
    if (keyed[i + 3] > 200) {
      inkRGB[0] = keyed[i];
      inkRGB[1] = keyed[i + 1];
      inkRGB[2] = keyed[i + 2];
      break;
    }
  }

  // Re-crop from the original with room for the growth, so the fattened edge
  // isn't clipped at the border.
  const framed = cropToInk(width, height, keyed, radius);
  const grown = thicken(framed.width, framed.height, framed.pixels, radius, inkRGB);
  fs.writeFileSync(path.join(OUT_DIR, file), encodePng(framed.width, framed.height, grown));

  // Predicted rather than re-measured: once lines are thick enough to touch,
  // a run of ink spans several of them and the measurement reads high.
  const after = (drawnLine + 2 * radius) / framed.width;
  console.log(
    `${file}\n` +
      `   drawn ${width}x${height}, ink crops to ${side}x${side}\n` +
      `   line ${(100 * (drawnLine / side)).toFixed(2)}% -> ` +
      `${(before(drawnLine, side) * BUTTON_PX).toFixed(2)}px on the button\n` +
      `   thickened by ${radius}px -> ${(after * 100).toFixed(2)}% ` +
      `= ~${(after * BUTTON_PX).toFixed(2)}px on the button (target ${(target * 100).toFixed(1)}%)`,
  );
}

function before(line, side) {
  return line / side;
}

console.log(`\nwrote ${files.length} file(s) to img/icons/transparent/`);
console.log('Too thin or too heavy? Change LINE_TARGET near the top of this file and re-run.');
