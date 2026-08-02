const fs = require("fs");
const path = require("path");

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A layered fir: three tiers of drooping branches per side rather than a plain
// triangle. Flat triangles read as mountains or clip-art; the tier overhangs
// are what make a silhouette legible as a conifer at small scale.
function fir(cx, baseline, w, h, tiers = 3) {
  const half = w / 2;
  const left = [];
  const right = [];
  for (let i = 0; i < tiers; i++) {
    const yB = baseline - (h * i) / tiers;
    const yT = baseline - (h * (i + 1)) / tiers;
    const wB = half * (1 - 0.68 * (i / tiers));
    const wT = half * (1 - 0.68 * ((i + 1) / tiers));
    left.push(`L${(cx - wB).toFixed(1)} ${yB.toFixed(1)}`, `L${(cx - wT * 1.18).toFixed(1)} ${yT.toFixed(1)}`);
    right.unshift(`L${(cx + wB).toFixed(1)} ${yB.toFixed(1)}`, `L${(cx + wT * 1.18).toFixed(1)} ${yT.toFixed(1)}`);
  }
  return [...left, `L${cx.toFixed(1)} ${(baseline - h).toFixed(1)}`, ...right].join("");
}

function treeline({ seed, baseline, minH, maxH, minW, maxW }) {
  const rand = mulberry32(seed);
  const segs = [];
  let x = -80;
  while (x < 1520) {
    const w = minW + rand() * (maxW - minW);
    const h = minH + rand() * (maxH - minH);
    segs.push(fir(x + w / 2, baseline, w, h));
    // Heavy overlap so the canopy closes into a mass instead of reading as a
    // row of separate spikes with sky between them.
    x += w * (0.42 + rand() * 0.22);
  }
  return `M-80 900L-80 ${baseline}${segs.join("")}L1520 ${baseline}L1520 900Z`;
}

const LAYERS = [
  { seed: 11, baseline: 585, minH: 50, maxH: 100, minW: 40, maxW: 78, fill: "#B6D5C4", opacity: 0.45 },
  { seed: 27, baseline: 660, minH: 75, maxH: 150, minW: 52, maxW: 98, fill: "#87BBA1", opacity: 0.55 },
  { seed: 43, baseline: 745, minH: 100, maxH: 195, minW: 64, maxW: 118, fill: "#48926F", opacity: 0.68 },
  { seed: 61, baseline: 840, minH: 125, maxH: 240, minW: 78, maxW: 142, fill: "#0B6E4F", opacity: 0.85 },
];

// A fog band drawn after each layer is what separates them into receding planes.
const body = LAYERS.map((l, i) => {
  const path = `<path d="${treeline(l)}" fill="${l.fill}" opacity="${l.opacity}"/>`;
  if (i === LAYERS.length - 1) return path;
  const fogTop = l.baseline - 120;
  return `${path}\n  <rect x="0" y="${fogTop}" width="1440" height="230" fill="url(#haze)" opacity="${0.72 - i * 0.14}"/>`;
}).join("\n  ");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMax slice" role="img" aria-label="Illustrated misty forest canopy">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#F8FAF8"/>
      <stop offset="50%" stop-color="#EDF6F1"/>
      <stop offset="100%" stop-color="#DCEEE4"/>
    </linearGradient>
    <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#F4F9F6" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#F4F9F6" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#F7F9F7" stop-opacity="0"/>
      <stop offset="78%" stop-color="#F7F9F7" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#F7F9F7" stop-opacity="1"/>
    </linearGradient>
    <linearGradient id="shaft" x1="0.3" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="1440" height="900" fill="url(#sky)"/>

  <g opacity="0.55">
    <polygon points="250,-40 400,-40 235,700 130,700" fill="url(#shaft)"/>
    <polygon points="655,-40 745,-40 590,660 520,660" fill="url(#shaft)"/>
    <polygon points="1030,-40 1195,-40 1010,720 900,720" fill="url(#shaft)"/>
  </g>

  ${body}

  <rect x="0" y="620" width="1440" height="280" fill="url(#floor)"/>
</svg>
`;

const out = path.join(__dirname, "..", "public", "images", "landing", "forest-canopy.svg");
fs.writeFileSync(out, svg);
console.log("written:", out, svg.length, "bytes");
