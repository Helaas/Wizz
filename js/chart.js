// Score-progression line chart (inline SVG) with crosshair tooltip and a focusable legend.
import * as G from './game.js';
import { t } from './i18n.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Color slot per seat: 8 hues; seats 9 and 10 reuse hues 1–2 with a dashed line / hollow key. */
export const colorSlot = (p) => p % 8;
export const isAlt = (p) => p >= 8;
export const playerStyle = (p) => `--pc: var(--p${colorSlot(p)})`;

function niceTicks(lo, hi, count = 5) {
  if (lo === hi) {
    lo -= 10;
    hi += 10;
  }
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v));
  return ticks;
}

const fmt = (n) => new Intl.NumberFormat().format(n).replace('-', '−');
const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

export function drawChart(root, game, state = {}) {
  const R = game.rounds.length;
  const n = game.players.length;
  if (!R) {
    root.innerHTML = `<p class="empty">${t('chartEmpty')}</p>`;
    return;
  }
  const { totals, deltas } = G.scoreTable(game);
  const series = game.players.map((_, p) => [0, ...totals.map((row) => row[p])]);
  const focus = state.focus ?? null;

  const W = Math.max(280, Math.floor(root.clientWidth || 600));
  const H = Math.round(Math.min(380, Math.max(240, W * 0.55)));
  const direct = n <= 4; // few series: label line ends directly as well as in the legend
  const m = { t: 14, r: direct ? 84 : 14, b: 30, l: 46 };
  const all = series.flat();
  const ticks = niceTicks(Math.min(0, ...all), Math.max(0, ...all));
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const pw = W - m.l - m.r;
  const ph = H - m.t - m.b;
  const x = (i) => m.l + (pw * i) / R;
  const y = (v) => m.t + ph * (1 - (v - lo) / (hi - lo || 1));

  let svg = `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" tabindex="0" role="img" aria-label="${esc(t('chartLabel'))}">`;

  // Horizontal gridlines + y labels. The zero line reads as the baseline.
  for (const v of ticks) {
    svg += `<line class="${v === 0 ? 'baseline' : 'grid'}" x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/>`;
    svg += `<text class="tick" x="${m.l - 8}" y="${y(v)}" dy="0.32em" text-anchor="end">${fmt(v)}</text>`;
  }
  // X labels: thin them out so they never collide.
  const every = Math.max(1, Math.ceil((R + 1) / Math.max(2, Math.floor(pw / 30))));
  for (let i = 0; i <= R; i++) {
    if (i !== R && (i % every || R - i < every)) continue;
    svg += `<text class="tick" x="${x(i)}" y="${H - 8}" text-anchor="middle">${i}</text>`;
  }

  // Lines: draw the focused one last so it sits on top.
  const order = [...series.keys()].sort((a, b) => (a === focus) - (b === focus));
  for (const p of order) {
    const d = series[p].map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    const cls = ['line', isAlt(p) ? 'alt' : '', focus != null && focus !== p ? 'dim' : ''].join(' ');
    svg += `<path class="${cls}" style="${playerStyle(p)}" d="${d}"/>`;
  }
  for (const p of order) {
    const v = series[p][R];
    const cls = ['dot', isAlt(p) ? 'alt' : '', focus != null && focus !== p ? 'dim' : ''].join(' ');
    svg += `<circle class="${cls}" style="${playerStyle(p)}" cx="${x(R)}" cy="${y(v)}" r="4.5"/>`;
  }

  // Direct end labels when there is room; skip them all if any two would collide.
  if (direct) {
    const ends = series.map((s, p) => ({ p, y: y(s[R]) })).sort((a, b) => a.y - b.y);
    const fits = ends.every((e, i) => i === 0 || e.y - ends[i - 1].y >= 15);
    if (fits) {
      for (const e of ends) {
        svg += `<text class="end-label" x="${x(R) + 10}" y="${e.y}" dy="0.32em">${esc(trim(game.players[e.p].name, 9))}</text>`;
      }
    }
  }

  // Hover layer.
  svg += `<g class="hover" style="display:none"><line class="xhair" y1="${m.t}" y2="${H - m.b}"/>`;
  for (let p = 0; p < n; p++) svg += `<circle class="hdot${isAlt(p) ? ' alt' : ''}" data-p="${p}" style="${playerStyle(p)}" r="4.5"/>`;
  svg += `</g><rect class="hit" x="${m.l - 10}" y="0" width="${pw + 20}" height="${H}" fill="transparent"/></svg>`;

  const legend = game.players
    .map((pl, p) => {
      const on = focus === p;
      return `<button type="button" class="legend-item${on ? ' on' : ''}${focus != null && !on ? ' dim' : ''}" data-action="chart-focus" data-p="${p}" aria-pressed="${on}" style="${playerStyle(p)}">
        <span class="key${isAlt(p) ? ' alt' : ''}" aria-hidden="true"></span><span class="lname">${esc(pl.name)}</span><span class="lval">${fmt(series[p][R])}</span></button>`;
    })
    .join('');

  root.innerHTML = `<div class="chart-plot">${svg}<div class="tip" hidden></div></div>
    <div class="legend" aria-label="${esc(t('chartLegend'))}">${legend}</div>
    <p class="hint">${t('chartLegend')}</p>`;

  const svgEl = root.querySelector('svg');
  const hover = svgEl.querySelector('.hover');
  const xhair = hover.querySelector('.xhair');
  const hdots = [...hover.querySelectorAll('.hdot')];
  const tip = root.querySelector('.tip');
  const plot = root.querySelector('.chart-plot');
  let idx = null;

  function show(i) {
    idx = Math.max(0, Math.min(R, i));
    hover.style.display = '';
    xhair.setAttribute('x1', x(idx));
    xhair.setAttribute('x2', x(idx));
    hdots.forEach((c, p) => {
      c.setAttribute('cx', x(idx));
      c.setAttribute('cy', y(series[p][idx]));
      c.classList.toggle('dim', focus != null && focus !== p);
    });
    const rows = series
      .map((s, p) => ({ p, v: s[idx], d: idx ? deltas[idx - 1][p] : null }))
      .sort((a, b) => b.v - a.v || a.p - b.p);
    tip.innerHTML = `<div class="tip-title">${idx ? t('afterRound', { r: idx }) : t('start')}</div>` +
      rows
        .map(
          (r) => `<div class="tip-row${focus != null && focus !== r.p ? ' dim' : ''}" style="${playerStyle(r.p)}">
            <span class="key${isAlt(r.p) ? ' alt' : ''}"></span><span class="tn">${esc(game.players[r.p].name)}</span>
            <span class="tv">${fmt(r.v)}</span><span class="td">${r.d == null ? '' : signed(r.d)}</span></div>`
        )
        .join('');
    tip.hidden = false;
    // Place the tooltip beside the crosshair, flipping sides near the right edge.
    const scale = plot.clientWidth / W;
    const px = x(idx) * scale;
    const tw = tip.offsetWidth;
    const left = px + 14 + tw > plot.clientWidth ? px - 14 - tw : px + 14;
    tip.style.left = `${Math.max(0, left)}px`;
    tip.style.top = `${m.t * scale}px`;
  }
  function hide() {
    idx = null;
    hover.style.display = 'none';
    tip.hidden = true;
  }
  const fromEvent = (e) => {
    const rect = svgEl.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    return Math.round(((px - m.l) / pw) * R);
  };
  svgEl.addEventListener('pointermove', (e) => show(fromEvent(e)));
  svgEl.addEventListener('pointerdown', (e) => show(fromEvent(e)));
  svgEl.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') hide();
  });
  svgEl.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      show((idx ?? R) + (e.key === 'ArrowLeft' ? -1 : 1));
    } else if (e.key === 'Home') show(0);
    else if (e.key === 'End') show(R);
    else if (e.key === 'Escape') hide();
  });
  svgEl.addEventListener('focus', () => show(idx ?? R));
  svgEl.addEventListener('blur', hide);
}

function trim(s, len) {
  return s.length > len ? `${s.slice(0, len - 1)}…` : s;
}
