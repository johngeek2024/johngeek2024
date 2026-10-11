// Genera dist/status.svg: estado en vivo de los sitios públicos de Jonathan + datos públicos de su cuenta.
// Sin dependencias: solo Node 22 (fetch nativo). Solo hace peticiones GET a una lista fija de URLs públicas.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITES = [
  { name: 'BaratongoVzla', url: 'https://baratongovzla.com', label: 'baratongovzla.com' },
  { name: 'Broke But Fancy', url: 'https://brokebutfancy.web.app', label: 'brokebutfancy.web.app' },
];
const USER = 'johngeek2024';
const SLOW_MS = 2500;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function probeOnce(url) {
  const t = performance.now();
  try {
    const r = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(10_000),
      headers: { 'user-agent': 'johngeek2024-profile-status/1.0 (+https://github.com/johngeek2024)' },
    });
    await r.arrayBuffer();
    return { code: r.status, ms: Math.round(performance.now() - t) };
  } catch {
    return { code: 0, ms: null };
  }
}

/** Dos mediciones; se queda con la mejor para no penalizar un arranque en frío puntual. */
export async function probe(url) {
  const a = await probeOnce(url);
  const b = await probeOnce(url);
  const ok = [a, b].filter((x) => x.code >= 200 && x.code < 400);
  if (!ok.length) return b.code ? b : a;
  return ok.reduce((m, x) => (x.ms < m.ms ? x : m));
}

export async function collect() {
  const sites = [];
  for (const s of SITES) sites.push({ ...s, ...(await probe(s.url)) });
  let gh = { repos: null, followers: null };
  try {
    const headers = { 'user-agent': 'johngeek2024-profile-status', accept: 'application/vnd.github+json' };
    if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const r = await fetch(`https://api.github.com/users/${USER}`, { headers, signal: AbortSignal.timeout(10_000) });
    if (r.ok) {
      const j = await r.json();
      gh = { repos: Number(j.public_repos), followers: Number(j.followers) };
    }
  } catch {
    /* sin datos de GitHub: se muestran guiones */
  }
  return { sites, gh, at: new Date() };
}

const font = (family, file, weight = 400, style = 'normal') =>
  `@font-face{font-family:'${family}';font-style:${style};font-weight:${weight};src:url(data:font/woff2;base64,${readFileSync(
    join(HERE, 'fonts', file),
  ).toString('base64')}) format('woff2')}`;

function state(s) {
  if (!s.code || s.code >= 400) return { txt: 'Sin respuesta', c: '#ff5d6c' };
  if (s.ms > SLOW_MS) return { txt: 'Lento', c: '#ffb020' };
  return { txt: 'Operativo', c: '#3ddc97' };
}

export function renderStatus({ sites, gh, at }) {
  const W = 1200;
  const rowH = 96;
  const top = 28;
  const H = top + sites.length * rowH + 150;
  const rows = sites
    .map((s, i) => {
      const y = top + i * rowH;
      const st = state(s);
      const bar = s.ms ? Math.max(8, Math.min(300, Math.round(300 * Math.min(s.ms, 3000) / 3000))) : 8;
      return `<g transform="translate(0 ${y})">
  <rect x="40" y="0" width="1120" height="80" rx="14" fill="#0c1224" stroke="#1f2a4a"/>
  <circle cx="76" cy="40" r="7" fill="${st.c}"><animate attributeName="opacity" values="1;.35;1" dur="2.4s" repeatCount="indefinite"/></circle>
  <circle cx="76" cy="40" r="13" fill="none" stroke="${st.c}" stroke-opacity=".35"/>
  <text x="108" y="36" font-family="IN,sans-serif" font-weight="600" font-size="22" fill="#e9edf7">${esc(s.name)}</text>
  <text x="108" y="60" font-family="JB,monospace" font-size="13" fill="#8b96b0">${esc(s.label)}</text>
  <text x="520" y="36" font-family="JB,monospace" font-weight="700" font-size="13" letter-spacing="2" fill="${st.c}">${esc(st.txt.toUpperCase())}</text>
  <text x="520" y="60" font-family="JB,monospace" font-size="13" fill="#8b96b0">HTTP ${s.code || '---'}</text>
  <rect x="700" y="34" width="300" height="6" rx="3" fill="#162040"/>
  <rect x="700" y="34" width="${bar}" height="6" rx="3" fill="${st.c}"/>
  <text x="1130" y="50" text-anchor="end" font-family="IS,serif" font-size="40" fill="#f2d58a">${s.ms ? s.ms : '—'}<tspan font-family="JB,monospace" font-size="14" fill="#8b96b0" dx="6">ms</tspan></text>
</g>`;
    })
    .join('\n');
  const y2 = top + sites.length * rowH + 4;
  const stamp = at.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  const n = (v) => (Number.isFinite(v) ? v : '—');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Estado en vivo de los sitios de Jonathan Moreno">
<style>${font('IN', 'in400-ascii.woff2')}${font('IN', 'in600-ascii.woff2', 600)}${font('JB', 'jb400-ascii.woff2')}${font('JB', 'jb700-ascii.woff2', 700)}${font('IS', 'is400-ascii.woff2')}</style>
<rect width="${W}" height="${H}" rx="22" fill="#070b17"/>
${rows}
<g transform="translate(0 ${y2})">
  <line x1="40" y1="14" x2="1160" y2="14" stroke="#1f2a4a"/>
  <text x="40" y="52" font-family="JB,monospace" font-size="12" letter-spacing="2" fill="#8b96b0">CUENTA PUBLICA</text>
  <text x="40" y="100" font-family="IS,serif" font-size="46" fill="#e9edf7">${n(gh.repos)}<tspan font-family="IN,sans-serif" font-size="15" fill="#8b96b0" dx="8">repos públicos</tspan></text>
  <text x="330" y="100" font-family="IS,serif" font-size="46" fill="#e9edf7">${n(gh.followers)}<tspan font-family="IN,sans-serif" font-size="15" fill="#8b96b0" dx="8">seguidores</tspan></text>
  <text x="1160" y="52" text-anchor="end" font-family="JB,monospace" font-size="12" letter-spacing="2" fill="#8b96b0">MEDIDO ${esc(stamp)}</text>
  <text x="1160" y="76" text-anchor="end" font-family="JB,monospace" font-size="12" fill="#5d6a8a">desde GitHub Actions · se actualiza cada 6 h</text>
</g>
</svg>`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = process.argv[2] || 'dist';
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'status.svg'), renderStatus(await collect()));
  console.log('status.svg generado');
}
