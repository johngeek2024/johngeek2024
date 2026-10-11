// scripts/neo/build.mjs
// Genera todos los SVG del README "Neon Neofetch" en assets/neo/.
// Uso local:   node scripts/neo/build.mjs
// En Actions:  lo corre .github/workflows/neo-readme.yml (con GITHUB_TOKEN para las stats).
// Sin dependencias: Node 20+.

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const OUT = join(ROOT, 'assets', 'neo');
const USER = process.env.GH_USER || 'johngeek2024';
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';

// ───────────────────────── paleta ─────────────────────────
const C = {
  bg: '#05060A',
  panel: '#0A101C',
  cyan: '#22E6FF',
  mag: '#FF3DCB',
  white: '#FFFFFF',
  text: '#DCE7F7',
  soft: '#9FB0CB',
  mute: '#6F86A8',
  green: '#7CFFB2',
  line: '#2A3A55',
};
const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
const DISP = "'Chakra Petch', 'JetBrains Mono', ui-monospace, monospace";

// ───────────────────────── utilidades ─────────────────────────
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// ancho aproximado de texto monoespaciado (CJK cuenta doble)
const mw = (s, fs, ls = 0) => [...String(s)].reduce((a, ch) => a + (/[　-鿿]/.test(ch) ? fs * 1.0 : fs * 0.6) + ls, 0);
const dw = (s, fs, ls = 0) => [...String(s)].length * (fs * 0.62 + ls); // Chakra Petch aprox.

function wrap(text, max) {
  const out = [];
  let line = '';
  for (const w of text.split(' ')) {
    if ((line + ' ' + w).trim().length > max) { out.push(line.trim()); line = w; }
    else line += ' ' + w;
  }
  if (line.trim()) out.push(line.trim());
  return out;
}

// ───────────────────────── fuentes embebidas ─────────────────────────
// GitHub muestra los SVG como <img>: no carga fuentes externas. Por eso
// bajamos de Google Fonts solo los glifos usados y los metemos en base64.
const GLYPHS =
  " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~" +
  'áéíóúñÁÉÍÓÚÑü·→✓●↗—…™«»¿¡−×°';
let FONT_CSS = '';
async function loadFonts() {
  const url =
    'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Chakra+Petch:wght@700&display=swap&text=' +
    encodeURIComponent(GLYPHS);
  try {
    const css = await (await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36' },
    })).text();
    const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]))];
    let out = css;
    for (const u of urls) {
      const buf = Buffer.from(await (await fetch(u)).arrayBuffer());
      out = out.split(u).join('data:font/woff2;base64,' + buf.toString('base64'));
    }
    FONT_CSS = out.replace(/\/\*[^*]*\*\//g, '').replace(/\s+/g, ' ');
    console.log('✓ fuentes embebidas');
  } catch (e) {
    console.warn('! no se pudieron bajar las fuentes, uso las del sistema:', e.message);
  }
}

const style = (extra = '') => `<style>${FONT_CSS}
text{font-family:${MONO}}
.d{font-family:${DISP};font-weight:700}
.blink{animation:blink 1s steps(1) infinite}
@keyframes blink{50%{opacity:0}}
${extra}</style>`;

const gridDefs = (id = 'grid', size = 28, a = 0.045) => `
<pattern id="${id}" width="${size}" height="${size}" patternUnits="userSpaceOnUse">
  <path d="M ${size} 0 L 0 0 0 ${size}" fill="none" stroke="rgba(34,230,255,${a})" stroke-width="1"/>
</pattern>`;

const svg = (w, h, label, body, extraCss = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">
${style(extraCss)}
${body}
</svg>
`;

// esquinas tipo mira
const brackets = (x, y, w, h, s, c1, c2, sw = 3) => `
<path d="M${x} ${y + s}V${y}H${x + s}" fill="none" stroke="${c1}" stroke-width="${sw}"/>
<path d="M${x + w - s} ${y}H${x + w}V${y + s}" fill="none" stroke="${c1}" stroke-width="${sw}"/>
<path d="M${x} ${y + h - s}V${y + h}H${x + s}" fill="none" stroke="${c2}" stroke-width="${sw}"/>
<path d="M${x + w - s} ${y + h}H${x + w}V${y + h - s}" fill="none" stroke="${c2}" stroke-width="${sw}"/>`;

// ───────────────────────── stats de GitHub ─────────────────────────
async function getStats() {
  const empty = { repos: '—', stars: '—', commits: '—', followers: '—' };
  if (!TOKEN) { console.warn('! sin GITHUB_TOKEN: stats en blanco'); return empty; }
  const query = `query($login:String!){ user(login:$login){
    followers{ totalCount }
    repositories(ownerAffiliations:OWNER, privacy:PUBLIC, first:100){ totalCount nodes{ stargazerCount } }
    contributionsCollection{ totalCommitContributions restrictedContributionsCount }
  } }`;
  try {
    const r = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: { Authorization: `bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { login: USER } }),
    });
    const u = (await r.json()).data.user;
    const n = (x) => Number(x).toLocaleString('es-VE');
    return {
      repos: n(u.repositories.totalCount),
      stars: n(u.repositories.nodes.reduce((a, x) => a + x.stargazerCount, 0)),
      commits: n(u.contributionsCollection.totalCommitContributions + u.contributionsCollection.restrictedContributionsCount),
      followers: n(u.followers.totalCount),
    };
  } catch (e) {
    console.warn('! error leyendo stats:', e.message);
    return empty;
  }
}

// ───────────────────────── HERO (neofetch + retrato) ─────────────────────────
async function hero(stats) {
  const ascii = (await readFile(join(HERE, 'portrait.txt'), 'utf8')).replace(/\r/g, '').split('\n').filter((l, i, a) => !(i === a.length - 1 && l === ''));
  const W = 900, H = 812;
  const P = { x: 40, y: 56, w: 820, h: 736 };
  const FS = 9.6, LH = 11.52;
  const ax = 68, ay = 117;

  const asciiText = ascii
    .map((l, i) => `<tspan x="${ax}" y="${(ay + i * LH).toFixed(2)}">${esc(l)}</tspan>`)
    .join('');

  // panel derecho
  const x0 = 464, xR = 834;
  const today = new Date().toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Caracas' });
  const rows = [
    ['h', 'SYS', 'SISTEMA', C.cyan],
    ['r', 'OS', 'Venezuela · Valencia'],
    ['r', 'Uptime', 'construyendo desde 2025'],
    ['r', 'Host', 'BaratongoVzla'],
    ['r', 'Kernel', 'Chief Tinkering Officer'],
    ['r', 'IDE', 'VS Code + Claude Code'],
    ['r', 'Shell', 'café → código → deploy'],
    ['h', 'DEV', 'STACK', C.mag],
    ['r', 'Lang', 'TypeScript · JavaScript'],
    ['r', 'Frontend', 'Astro · Next.js · React · Angular'],
    ['r', 'Styling', 'Tailwind CSS v4 · Vite'],
    ['r', 'Backend', 'Node · Express · Firebase'],
    ['r', 'Infra', 'Vercel · Cloudflare · Actions'],
    ['r', 'Sites', 'ES · EN · 中文'],
    ['h', 'NET', 'CONTACTO', C.cyan],
    ['r', 'Web', 'baratongovzla.com'],
    ['r', 'Social', '@SoyJohnMoreno'],
    ['r', 'Amazon', 'Influencer @BaratongoVzla'],
    ['h', 'GIT', 'GITHUB STATS', C.mag],
    ['r', 'Repos', `${stats.repos} · Stars ${stats.stars}`],
    ['r', 'Commits', `${stats.commits} (últimos 12 meses)`],
    ['r', 'Followers', `${stats.followers} · sync ${today}`],
    ['r', 'Status', 'desplegando algo ahora mismo', C.green],
  ];
  let y = 262;
  let info = '';
  rows.forEach((r, i) => {
    if (r[0] === 'h') {
      if (i) y += 10;
      const [, n, k, bg] = r;
      const bw = dw(n, 10) + 12;
      const tx = x0 + bw + 8;
      const tEnd = tx + mw(k, 11.5, 2) + 10;
      info += `<rect x="${x0}" y="${y - 11}" width="${bw}" height="15" fill="${bg}"/>
<text x="${x0 + bw / 2}" y="${y}" class="d" font-size="10" fill="${C.bg}" text-anchor="middle">${n}</text>
<text x="${tx}" y="${y}" font-size="11.5" font-weight="600" letter-spacing="2" fill="${C.white}">${esc(k)}</text>
<line x1="${tEnd}" y1="${y - 4}" x2="${xR}" y2="${y - 4}" stroke="url(#fade)" stroke-width="1"/>`;
      y += 20;
    } else {
      const [, k, v, vc = '#E6F1FF'] = r;
      const kEnd = x0 + mw(k, 11.5) + 6;
      const vStart = xR - mw(v, 11.5) - 6;
      info += `<text x="${x0}" y="${y}" font-size="11.5" fill="${C.cyan}">${esc(k)}</text>
<line x1="${kEnd}" y1="${y - 3}" x2="${vStart}" y2="${y - 3}" stroke="${C.line}" stroke-width="1.2" stroke-dasharray="1.2 3.6" stroke-linecap="round"/>
<text x="${xR}" y="${y}" font-size="11.5" fill="${vc}" text-anchor="end">${esc(v)}</text>`;
      y += 17.5;
    }
  });
  const palette = ['#05060A', '#FF5577', C.green, '#FFC857', C.cyan, C.mag, '#A78BFA', '#E6F1FF']
    .map((c, i) => `<rect x="${x0 + i * 22}" y="${y + 2}" width="22" height="10" fill="${c}"${i === 0 ? ` stroke="${C.line}"` : ''}/>`)
    .join('');

  // chips
  const chips = [
    ['FUNCIONA EN MI MÁQUINA™', C.cyan],
    ['… Y EN PRODUCCIÓN', C.cyan],
    ['CASI SIEMPRE', C.mag],
  ];
  let cx = 66;
  const cy = 742;
  let chipSvg = '';
  for (const [t, c] of chips) {
    const w = mw(t, 11) + 24;
    chipSvg += `<rect x="${cx}" y="${cy}" width="${w}" height="26" fill="none" stroke="${c}" stroke-opacity="${c === C.mag ? 1 : 0.45}"/>
<text x="${cx + 12}" y="${cy + 17}" font-size="11" fill="${c}">${esc(t)}</text>`;
    cx += w + 10;
  }

  const css = `
.scan{animation:scan 4.5s linear infinite}
@keyframes scan{from{transform:translateY(-40px)}to{transform:translateY(600px)}}
.flick{animation:flick 6s infinite}
@keyframes flick{0%,91%,100%{opacity:1}92%{opacity:.55}93%{opacity:1}96%{opacity:.78}97%{opacity:1}}`;

  const body = `
<defs>
  ${gridDefs()}
  <linearGradient id="panelBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0A101C" stop-opacity=".95"/><stop offset="1" stop-color="#05060A" stop-opacity=".95"/></linearGradient>
  <linearGradient id="asciiG" gradientUnits="userSpaceOnUse" x1="0" y1="${ay - 10}" x2="0" y2="${ay + ascii.length * LH}">
    <stop offset="0" stop-color="${C.cyan}"/><stop offset=".38" stop-color="${C.cyan}"/><stop offset="1" stop-color="${C.mag}"/>
  </linearGradient>
  <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.cyan}" stop-opacity=".55"/><stop offset="1" stop-color="${C.cyan}" stop-opacity="0"/></linearGradient>
  <linearGradient id="scanG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.cyan}" stop-opacity="0"/><stop offset=".85" stop-color="${C.cyan}" stop-opacity=".2"/><stop offset="1" stop-color="${C.cyan}" stop-opacity=".7"/></linearGradient>
  <pattern id="crt" width="4" height="3" patternUnits="userSpaceOnUse"><rect y="2" width="4" height="1" fill="rgba(5,6,10,.38)"/></pattern>
  <filter id="glow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <filter id="nameGlow" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="7" result="b"/><feFlood flood-color="${C.cyan}" flood-opacity=".55"/><feComposite in2="b" operator="in"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <clipPath id="pClip"><rect x="66" y="104" width="372" height="586"/></clipPath>
</defs>

<rect width="${W}" height="${H}" fill="${C.bg}"/>
<rect width="${W}" height="${H}" fill="url(#grid)"/>

<!-- barra superior -->
<text x="40" y="18" font-size="11" letter-spacing="3" fill="${C.mute}">SYS://JOHNGEEK2024</text>
<text x="450" y="18" font-size="11" letter-spacing="3" fill="${C.mute}" text-anchor="middle">VALENCIA, VE · 10.16°N 68.00°W</text>
<circle cx="790" cy="14" r="4" fill="${C.cyan}"/>
<circle cx="790" cy="14" r="4" fill="none" stroke="${C.cyan}" stroke-width="2"><animate attributeName="r" values="4;11" dur="1.6s" repeatCount="indefinite"/><animate attributeName="opacity" values=".8;0" dur="1.6s" repeatCount="indefinite"/></circle>
<text x="860" y="18" font-size="11" letter-spacing="3" fill="${C.cyan}" text-anchor="end">ONLINE</text>
<line x1="40" y1="32" x2="860" y2="32" stroke="${C.cyan}" stroke-opacity=".2"/>

<!-- panel -->
<rect x="${P.x}" y="${P.y}" width="${P.w}" height="${P.h}" fill="url(#panelBg)" stroke="${C.cyan}" stroke-opacity=".35"/>
${brackets(P.x - 1, P.y - 1, P.w + 2, P.h + 2, 30, C.cyan, C.mag)}
<rect x="80" y="${P.y - 8}" width="330" height="16" fill="${C.bg}"/>
<text x="90" y="${P.y + 4}" font-size="11" letter-spacing="1.5" fill="${C.cyan}">jonathan@baratongovzla:~$ neofetch --neon</text>

<!-- retrato -->
${brackets(66, 84, 372, 630, 22, 'rgba(34,230,255,.7)', 'rgba(255,61,203,.7)', 1)}
<text x="94" y="96" font-size="9" letter-spacing="2" fill="${C.mute}">TARGET: J.MORENO</text>
<text x="410" y="96" font-size="9" letter-spacing="2" fill="${C.green}" text-anchor="end">ID ✓ MATCH</text>
<g class="flick" filter="url(#glow)">
  <text font-size="${FS}" fill="url(#asciiG)" xml:space="preserve" style="white-space:pre">${asciiText}</text>
</g>
<g clip-path="url(#pClip)">
  <rect x="66" y="104" width="372" height="586" fill="url(#crt)"/>
  <g class="scan"><rect x="66" y="104" width="372" height="40" fill="url(#scanG)"/></g>
</g>
<text x="66" y="706" font-size="9" letter-spacing="2" fill="${C.mute}">IMG2ASCII · 64×50</text>
<text x="438" y="706" font-size="9" letter-spacing="2" fill="${C.mute}" text-anchor="end">RENDER: OK</text>

<!-- info -->
<text x="${x0}" y="100" font-size="11" letter-spacing="4" fill="${C.mag}">CTO · BARATONGOVZLA</text>
<g filter="url(#nameGlow)">
  <text x="${x0 - 2}" y="150" class="d" font-size="46" fill="${C.white}">JONATHAN</text>
  <text x="${x0 - 2}" y="194" class="d" font-size="46" fill="${C.cyan}">MORENO</text>
</g>
<text x="${x0}" y="222" font-size="12" fill="${C.soft}">Tiendas, blogs y paneles que cargan</text>
<text x="${x0}" y="239" font-size="12" fill="${C.soft}">rápido y se pagan solos<tspan class="blink" fill="${C.cyan}">_</tspan></text>
${info}
${palette}

<!-- chips -->
${chipSvg}
<text x="834" y="${cy + 17}" font-size="10.5" fill="${C.mute}" text-anchor="end">[warn] si hoy no rompí nada, no lo probé</text>
`;
  return svg(W, H, 'Jonathan Moreno — CTO de BaratongoVzla. Retrato ASCII y ficha estilo neofetch.', body, css);
}

// ───────────────────────── redes ─────────────────────────
function social(label, handle, c) {
  const W = 210, H = 62;
  return svg(W, H, `${label} ${handle}`, `
<polygon points="0.5,0.5 209.5,0.5 209.5,43 185,61.5 0.5,61.5" fill="#0A101C" stroke="${c}" stroke-opacity=".45"/>
<text x="16" y="24" font-size="10" letter-spacing="3" fill="${C.mute}">[ ${esc(label.toUpperCase())} ]</text>
<text x="16" y="46" font-size="13" font-weight="600" fill="${C.white}">${esc(handle)}</text>
<text x="192" y="24" font-size="12" fill="${c}" text-anchor="end">↗</text>`);
}

// ───────────────────────── encabezado de sección ─────────────────────────
function header(n, title) {
  const W = 900, H = 56;
  const tEnd = 52 + dw(title, 28, 2) + 14;
  return svg(W, H, title, `
<defs><linearGradient id="hl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${C.cyan}" stop-opacity=".6"/><stop offset="1" stop-color="${C.cyan}" stop-opacity="0"/></linearGradient></defs>
<rect x="0" y="15" width="38" height="24" fill="${C.cyan}"/>
<text x="19" y="32" class="d" font-size="13" fill="${C.bg}" text-anchor="middle">${n}</text>
<text x="52" y="37" class="d" font-size="28" letter-spacing="2" fill="${C.white}">${esc(title)}</text>
<rect x="${tEnd}" y="27" width="${W - tEnd}" height="1" fill="url(#hl)"/>`);
}

// ───────────────────────── módulos (cómo trabajo) ─────────────────────────
function modules() {
  const items = [
    ['MOD_01', 'Primero rápido', 'Estático cuando se puede, imágenes optimizadas, nada de más.'],
    ['MOD_02', 'SEO técnico de serie', 'Sitemap, datos estructurados, RSS y llms.txt para buscadores con IA.'],
    ['MOD_03', 'Pensado para Venezuela', 'Pago Móvil, Binance Pay y cierre del pedido por WhatsApp.'],
    ['MOD_04', 'Bilingüe por defecto', 'Español, inglés y chino en los sitios que lo necesitan.'],
    ['MOD_05', 'Cada proyecto con panel', 'Pedidos, ventas, invitados o contenido, según el caso.'],
    ['MOD_06', 'Seguridad primero', 'Reglas con pruebas y demos con datos ficticios.'],
  ];
  const W = 900, cw = 292, ch = 118, g = 12;
  let body = '';
  items.forEach(([n, t, d], i) => {
    const x = (i % 3) * (cw + g), y = Math.floor(i / 3) * (ch + g);
    const c = i % 2 ? C.mag : C.cyan;
    const lines = wrap(d, 34).slice(0, 2);
    body += `<rect x="${x + 0.5}" y="${y + 0.5}" width="${cw - 1}" height="${ch - 1}" fill="#0A101C" stroke="${C.cyan}" stroke-opacity=".22"/>
<rect x="${x}" y="${y}" width="3" height="${ch}" fill="${c}" opacity=".0"/>
<text x="${x + 16}" y="${y + 26}" font-size="10" letter-spacing="3" fill="${c}">${n}</text>
<text x="${x + 16}" y="${y + 50}" class="d" font-size="15" fill="${C.white}">${esc(t)}</text>
${lines.map((l, k) => `<text x="${x + 16}" y="${y + 74 + k * 18}" font-size="12" fill="${C.soft}">${esc(l)}</text>`).join('')}`;
  });
  return svg(W, ch * 2 + g, 'Cómo trabajo', body);
}

// ───────────────────────── tarjetas de proyecto ─────────────────────────
function card(p, img = '') {
  const W = 440, H = 368;
  const lines = wrap(p.desc, 54).slice(0, 3);
  return svg(W, H, `${p.name}: ${p.desc}`, `
<defs>
  ${gridDefs('cg', 20, 0.12)}
  <radialGradient id="glow" cx=".7" cy=".3" r=".6"><stop offset="0" stop-color="${p.glow}" stop-opacity=".4"/><stop offset="1" stop-color="${p.glow}" stop-opacity="0"/></radialGradient>
  <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#05060A" stop-opacity=".15"/><stop offset=".55" stop-color="#05060A" stop-opacity=".35"/><stop offset="1" stop-color="#05060A" stop-opacity=".92"/></linearGradient>
</defs>
<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" fill="#070B14" stroke="${C.cyan}" stroke-opacity=".3"/>
<rect x="1" y="1" width="${W - 2}" height="190" fill="#0A1020"/>
${img ? `<clipPath id="pv"><rect x="1" y="1" width="${W - 2}" height="190"/></clipPath>
<g clip-path="url(#pv)"><image x="1" y="1" width="${W - 2}" height="190" preserveAspectRatio="xMidYMin slice" href="data:image/jpeg;base64,${img}"/></g>
<rect x="1" y="1" width="${W - 2}" height="190" fill="url(#shade)"/>` : ''}
<rect x="1" y="1" width="${W - 2}" height="190" fill="url(#glow)" opacity="${img ? 0.5 : 1}"/>
<rect x="1" y="1" width="${W - 2}" height="190" fill="url(#cg)" opacity="${img ? 0.55 : 1}"/>
<line x1="1" y1="191.5" x2="${W - 1}" y2="191.5" stroke="${C.cyan}" stroke-opacity=".25"/>
<text x="18" y="172" class="d" font-size="34" fill="${C.white}" fill-opacity=".92">${esc(p.code)}</text>
<text x="${W - 16}" y="24" font-size="10" letter-spacing="2" fill="${p.tag === 'LIVE' ? C.green : C.mute}" text-anchor="end">${p.tag === 'LIVE' ? '● ' : ''}${p.tag}</text>
<text x="18" y="222" font-size="10" letter-spacing="3" fill="${C.mag}">${esc(p.kind)}</text>
<text x="18" y="250" class="d" font-size="20" fill="${C.white}">${esc(p.name)}</text>
${lines.map((l, k) => `<text x="18" y="${274 + k * 18}" font-size="12" fill="${C.soft}">${esc(l)}</text>`).join('')}
<text x="18" y="346" font-size="12" fill="${C.cyan}">${esc(p.cta)} ↗</text>`);
}

// ───────────────────────── pie ─────────────────────────
function footer() {
  return svg(900, 60, 'Gracias por pasar. Si algo falla, fue el caché.', `
<line x1="0" y1="10.5" x2="900" y2="10.5" stroke="${C.cyan}" stroke-opacity=".3"/>
<text x="0" y="44" font-size="12" fill="${C.mute}"><tspan fill="${C.cyan}">EOF</tspan> — Gracias por pasar. Si algo falla, fue el caché.<tspan class="blink" fill="${C.cyan}"> █</tspan></text>
<text x="900" y="44" font-size="12" letter-spacing="3" fill="${C.mute}" text-anchor="end">// johngeek2024</text>`);
}

// ───────────────────────── main ─────────────────────────
const PROJECTS = [
  { file: 'card-baratongovzla', code: 'BVZ', tag: 'LIVE', kind: 'TIENDA · BLOG · PANEL', name: 'BaratongoVzla', desc: 'Tecnología y gadgets desde Valencia. Carrito, combos, Pago Móvil, Binance Pay y pedido por WhatsApp.', cta: 'baratongovzla.com', glow: C.cyan },
  { file: 'card-brokebutfancy', code: 'BBF', tag: 'LIVE', kind: 'AFILIADOS', name: 'Broke But Fancy', desc: 'Sitio de afiliados con lo mejor de tech y hogar.', cta: 'brokebutfancy.web.app', glow: C.mag },
  { file: 'card-boda', code: 'BODA', tag: 'DEMO', kind: 'INVITACIÓN', name: 'Boda bilingüe', desc: 'Sello de lacre, cuenta regresiva y confirmación de invitados.', cta: 'Ver demo (datos ficticios)', glow: '#A78BFA' },
  { file: 'card-quince', code: 'XV', tag: 'DEMO', kind: 'INVITACIÓN', name: 'Quince años', desc: 'Invitación de 15 años con panel de invitados.', cta: 'Ver demo (datos ficticios)', glow: C.cyan },
];

await mkdir(OUT, { recursive: true });
await loadFonts();
const stats = await getStats();

const files = {
  'hero.svg': await hero(stats),
  'social-instagram.svg': social('Instagram', '@SoyJohnMoreno', C.cyan),
  'social-tiktok.svg': social('TikTok', '@SoyJohnMoreno', C.cyan),
  'social-youtube.svg': social('YouTube', '@SoyJohnMoreno', C.mag),
  'social-linkedin.svg': social('LinkedIn', 'Jonathan Moreno', C.mag),
  'h-01.svg': header('01', 'SOBRE MÍ'),
  'h-02.svg': header('02', 'PROYECTOS'),
  'h-03.svg': header('03', 'EN VIVO'),
  'modules.svg': modules(),
  'footer.svg': footer(),
};
for (const p of PROJECTS) {
  // Vista previa opcional: assets/neo/previews/<file>.jpg se incrusta en la franja superior.
  const img = await readFile(join(OUT, 'previews', p.file + '.jpg')).then((b) => b.toString('base64')).catch(() => '');
  files[p.file + '.svg'] = card(p, img);
}

for (const [name, content] of Object.entries(files)) {
  await writeFile(join(OUT, name), content);
  console.log('  →', 'assets/neo/' + name);
}
console.log(`✓ ${Object.keys(files).length} SVG generados`);
