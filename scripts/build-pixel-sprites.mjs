/**
 * Single source of truth for the pixel skin's sprites.
 *
 * The sprites are hand-written bitmaps (one character per pixel) rendered to
 * tiny 24x24 PNGs and inlined into octoBeautify.css as base64 data URLs. They
 * total under 1 KB, which is why they are inlined rather than shipped as
 * web-accessible files: a static file would need a new message type, a content
 * script change and a MAIN-world handler just to hand the URL across, and the
 * MAIN world cannot call browser.runtime.getURL() itself.
 *
 * Swapping the character art means editing SPRITES below and re-running this
 * script. It rewrites ONLY the region between the PIXEL-SPRITES markers in
 * octoBeautify.css — every hand-written rule outside them is left alone.
 *
 *   node scripts/build-pixel-sprites.mjs
 *
 * Sprites are emitted at 1x. The stylesheet scales them with
 * `image-rendering: pixelated`, so nearest-neighbour keeps them crisp at any
 * size and we never ship a second resolution.
 */
import { deflateSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';

// NES 2C02 palette picks. Kept to 4 colours + transparent per sprite, which is
// what real NES hardware allowed once two sprites were overlaid.
export const NES = {
  black: [0x00, 0x00, 0x00], white: [0xfc, 0xfc, 0xfc],
  blue: [0x00, 0x70, 0xec], ltblue: [0x3c, 0xbc, 0xfc], dkblue: [0x00, 0x00, 0xa8],
  gold: [0xf8, 0xb8, 0x00], dkgold: [0xc8, 0x78, 0x00], drkgold: [0x88, 0x50, 0x00],
};
export const PAL = {
  K: NES.black, W: NES.white, B: NES.blue, L: NES.ltblue, D: NES.dkblue,
  Y: NES.gold, O: NES.dkgold, X: NES.drkgold,
};

// Shared head + face. Reused verbatim by every character pose: redrawing the
// face per pose is how the jump frame ended up looking like a different
// creature during design.
export const FACE = [
  '.......KKKKKKKKKK.......',
  '.....KKBBBBBBBBBBKK.....',
  '....KBBBBBBBBBBBBBBK....',
  '...KBBBBBBBBBBBBBBDDK...',
  '..KBBBBBBBBBBBBBBBBDDK..',
  '..KBBBBBBBBBBBBBBBBDDK..',
  '..KBBWWWBBBBBBBBWWWBDK..',
  '..KBWWWWWBBBBBBWWWWWDK..',
  '..KBWWKWWBBBBBBWWKWWDK..',
  '..KBWWWWWBBBBBBWWWWWDK..',
  '..KBBWWWBBBBBBBBWWWBDK..',
  '..KBBBBBBBBBBBBBBBBDDK..',
  '..KBBBBBBKBBBBKBBBBDDK..',
  '..KBBBBBBBKKKKBBBBBDDK..',
  '...KBBBBBBBBBBBBBBDDK...',
];

export const SPRITES = {
  stand: [...FACE,
    '...KBBBBBKKBBKKBBBBDK...',
    '..KBBBBBK.KBBK.KBBBDDK..',
    '.KBBBBK...KBBK...KBBDDK.',
    'KBBBBK....KBBK....KBBDDK',
    'KBBBK.....KBBK.....KBDDK',
    'KBBK......KBBK......KBDK',
    '.KBBK.....KBBK.....KBDK.',
    '..KKK......KK......KKK..',
    '........................',
  ],
  // Arms tucked in — reads as "mid-jump" against the splayed standing pose.
  jump: [...FACE,
    '...KBBBBBKKBBKKBBBBDK...',
    '....KBBBK.KBBK.KBBBDK...',
    '.....KBBK.KBBK.KBBDK....',
    '.....KBBK.KBBK.KBBDK....',
    '......KBK.KBBK.KBDK.....',
    '......KBK.KBBK.KBDK.....',
    '.......KK.KBBK.KK.......',
    '..........KBBK..........',
    '..........KKKK..........',
  ],
  crate: [
    'KKKKKKKKKKKKKKKKKKKKKKKK',
    'KYYYYYYYYYYYYYYYYYYYYYYK',
    'KYKKYYYYYYYYYYYYYYYYKKYK',
    'KYKKYYYYYYYYYYYYYYYYKKYK',
    'KYYYYYYYYYYYYYYYYYYYYYYK',
    'KYYYYYYYYYYYYYYYYYYYYYYK',
    'KYYYYYYYYKKKKKKYYYYYYYYK',
    'KYYYYYYYKLLBBBBKYYYYYYYK',
    'KYYYYYYKLLBBBBBBKYYYYYYK',
    'KYYYYYYKLBBBBBBDKYYYYYYK',
    'KYYYYYYKBBBBBBDDKYYYYYYK',
    'KYYYYYYKBBBBBBDDKYYYYYYK',
    'KYYYYYYKBBBBBDDDKYYYYYYK',
    'KYYYYYYKBBBBDDDDKYYYYYYK',
    'KYYYYYYYKBBDDDDKYYYYYYYK',
    'KYYYYYYYYKKKKKKYYYYYYYYK',
    'KYYYYYYYYYYYYYYYYYYYYYYK',
    'KYYYYYYYYYYYYYYYYYYYYYYK',
    'KYYYYYYYYYYYYYYYYYYYYYYK',
    'KYKKYYYYYYYYYYYYYYYYKKYK',
    'KYKKYYYYYYYYYYYYYYYYKKYK',
    'KYYYYYYYYYYYYYYYYYYYYYYK',
    'KOOOOOOOOOOOOOOOOOOOOOOK',
    'KKKKKKKKKKKKKKKKKKKKKKKK',
  ],
  // Spent crate: gem taken, face collapsed to dull metal.
  'crate-used': [
    'KKKKKKKKKKKKKKKKKKKKKKKK',
    'KOOOOOOOOOOOOOOOOOOOOOOK',
    'KOKKOOOOOOOOOOOOOOOOKKOK',
    'KOKKOOOOOOOOOOOOOOOOKKOK',
    'KOOOOOOOOOOOOOOOOOOOOOOK',
    'KOOOOOOOOOOOOOOOOOOOOOOK',
    'KOOOOOOOOKKKKKKOOOOOOOOK',
    'KOOOOOOOKXXXXXXKOOOOOOOK',
    'KOOOOOOKXXXXXXXXKOOOOOOK',
    'KOOOOOOKXXXXXXXXKOOOOOOK',
    'KOOOOOOKXXXXXXXXKOOOOOOK',
    'KOOOOOOKXXXXXXXXKOOOOOOK',
    'KOOOOOOKXXXXXXXXKOOOOOOK',
    'KOOOOOOKXXXXXXXXKOOOOOOK',
    'KOOOOOOOKXXXXXXKOOOOOOOK',
    'KOOOOOOOOKKKKKKOOOOOOOOK',
    'KOOOOOOOOOOOOOOOOOOOOOOK',
    'KOOOOOOOOOOOOOOOOOOOOOOK',
    'KOOOOOOOOOOOOOOOOOOOOOOK',
    'KOKKOOOOOOOOOOOOOOOOKKOK',
    'KOKKOOOOOOOOOOOOOOOOKKOK',
    'KOOOOOOOOOOOOOOOOOOOOOOK',
    'KXXXXXXXXXXXXXXXXXXXXXXK',
    'KKKKKKKKKKKKKKKKKKKKKKKK',
  ],
  coin: [
    '........................',
    '........................',
    '........................',
    '..........KKKK..........',
    '........KKYYYYKK........',
    '.......KYYYYYYYYK.......',
    '......KYYYYYYYYYYK......',
    '......KYYYKOOKYYYK......',
    '......KYYYKOOKYYYK......',
    '......KYYYKOOKYYYK......',
    '......KYYYKOOKYYYK......',
    '......KYYYKOOKYYYK......',
    '......KYYYKOOKYYYK......',
    '......KYYYKOOKYYYK......',
    '......KYYYYYYYYYYK......',
    '.......KYYYYYYYYK.......',
    '........KKYYYYKK........',
    '..........KKKK..........',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
  ],
};

/**
 * Nine-slice dialog frames, one per bubble tier.
 *
 * A real FC dialog box is a tile-built frame, not a CSS line: `border: 2px
 * solid` plus an inset shadow only imitates the look, and it stops being a
 * pixel at all once the browser scales it. These are 12x12 tiles sliced at 4,
 * drawn with border-width 8px so each source pixel lands on exactly 2 screen
 * pixels — the same 2px grid the 48px sprites use.
 *
 * Two details are what make it read as FC rather than as a generic double-lined
 * box: the corners drop their outermost pixel (the stepped "pixel round corner"
 * every NES dialog has), and the inner lining is directional — highlight along
 * the top/left, shade along the bottom/right — so the frame catches light
 * instead of being a flat outline.
 */
export const FRAME_TIERS = {
  'frame-ai':    { H: [0xfc, 0xe8, 0xb0], M: [0xc8, 0x78, 0x00], C: [0xf8, 0xd8, 0x78] },
  'frame-me':    { H: [0xd8, 0xf4, 0xfc], M: [0x00, 0x70, 0xec], C: [0xa8, 0xe4, 0xfc] },
  'frame-other': { H: [0xdc, 0xfc, 0xfc], M: [0x00, 0xa8, 0xa8], C: [0xb0, 0xfc, 0xfc] },
};

export const FRAME = [
  '.KKKKKKKKKK.',
  'KKHHHHHHHHMK',
  'KHCCCCCCCCMK',
  'KHCCCCCCCCMK',
  'KHCCCCCCCCMK',
  'KHCCCCCCCCMK',
  'KHCCCCCCCCMK',
  'KHCCCCCCCCMK',
  'KHCCCCCCCCMK',
  'KHCCCCCCCCMK',
  'KMMMMMMMMMKK',
  '.KKKKKKKKKK.',
];

// ---- PNG encoding (8-bit RGBA) -------------------------------------------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
export function png(rows, palette = PAL) {
  const w = rows[0].length;
  const h = rows.length;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  rows.forEach((row, y) => {
    const off = y * (w * 4 + 1);
    raw[off] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      const col = palette[row[x]];
      const i = off + 1 + x * 4;
      if (!col) continue; // '.' stays transparent
      raw[i] = col[0]; raw[i + 1] = col[1]; raw[i + 2] = col[2]; raw[i + 3] = 255;
    }
  });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- emit ----------------------------------------------------------------
// Guarded so other tooling can import the bitmaps without rewriting the sheet.
if (process.argv[1] && process.argv[1].endsWith('build-pixel-sprites.mjs')) {
  const BEGIN = '            /* PIXEL-SPRITES:BEGIN — 由 scripts/build-pixel-sprites.mjs 生成，勿手改 */';
  const END = '            /* PIXEL-SPRITES:END */';

  let total = 0;
  const frameVars = Object.entries(FRAME_TIERS).map(([name, tier]) => {
    const pal = {
      K: [0x10, 0x10, 0x18],
      H: tier.H,
      M: tier.M,
      C: tier.C,
      D: tier.M.map((v) => Math.round(v * 0.62)),
    };
    const buf = png(FRAME, pal);
    total += buf.length;
    return `                --octo-px-${name}: url("data:image/png;base64,${buf.toString('base64')}");`;
  });

  const vars = Object.entries(SPRITES).map(([name, rows]) => {
    const w = rows[0].length;
    rows.forEach((r, i) => {
      if (r.length !== w) throw new Error(`${name}: row ${i} is ${r.length} wide, expected ${w}`);
    });
    const buf = png(rows);
    total += buf.length;
    return `                --octo-px-${name}: url("data:image/png;base64,${buf.toString('base64')}");`;
  });

  const block = [
    BEGIN,
    '            body[data-octo-skin="pixel"] {',
    ...vars,
    ...frameVars,
    '            }',
    END,
  ].join('\n');

  const cssPath = new URL('../utils/octoBeautify.css', import.meta.url);
  const css = readFileSync(cssPath, 'utf8');
  const marker = new RegExp(`${BEGIN.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${END.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  if (!marker.test(css)) {
    throw new Error('octoBeautify.css 里找不到 PIXEL-SPRITES 标记区，先加上标记再运行');
}
writeFileSync(cssPath, css.replace(marker, block.trim().replace(/^\s+/, '')));
console.log(`${Object.keys(SPRITES).length} sprites + ${Object.keys(FRAME_TIERS).length} frames, ${total} B raw PNG -> inlined into octoBeautify.css`);
}
