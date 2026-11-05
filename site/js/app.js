import * as G from './game.js';
import { t, setLang, lang, LANGS, detectLang, formatDate } from './i18n.js';
import { load, save } from './storage.js';
import { drawChart, playerStyle, isAlt } from './chart.js';
import { icon, logo } from './icons.js';

const data = load();
setLang(data.settings.lang || detectLang());
applyTheme();

const $app = document.getElementById('app');
const $dlg = document.getElementById('dlg');
const $toast = document.getElementById('toast');

let draft = null; // setup form state
let chartFocus = null; // highlighted player in the chart
let lastRouteKey = '';
let pendingFocus = null;
let dlg = null; // open dialog spec

// ---------- helpers ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (n) => new Intl.NumberFormat(lang()).format(n).replace('-', '−');
const signed = (n) => (n > 0 ? `+${fmt(n)}` : n < 0 ? `−${fmt(Math.abs(n))}` : '0');
const sum = (xs) => xs.reduce((a, b) => a + (b ?? 0), 0);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const swatch = (p) => `<span class="swatch${isAlt(p) ? ' alt' : ''}" style="${playerStyle(p)}" aria-hidden="true"></span>`;

let warnedStorage = false;
function persist() {
  if (!save(data) && !warnedStorage) {
    warnedStorage = true;
    toast('Storage unavailable: this game will not be kept after closing.', { error: true });
  }
}

function findGame(id) {
  if (data.current && data.current.id === id) return data.current;
  return data.history.find((g) => g.id === id) || null;
}

function rankMap(scores) {
  const out = [];
  for (const e of G.ranking(scores)) out[e.player] = e.rank;
  return out;
}

function recentPlayers() {
  const seen = new Map();
  for (const g of [data.current, ...data.history]) {
    if (!g) continue;
    for (const p of g.players) {
      const k = p.name.toLocaleLowerCase();
      if (!seen.has(k)) seen.set(k, p.name);
    }
  }
  return [...seen.values()];
}

function applyTheme() {
  const th = data.settings.theme;
  const root = document.documentElement;
  if (th === 'light' || th === 'dark') root.dataset.theme = th;
  else delete root.dataset.theme;
}

// ---------- routing ----------

function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'setup') return { name: 'setup' };
  if (parts[0] === 'play') return { name: 'play', tab: parts[1] || 'round' };
  if (parts[0] === 'game' && parts[1]) return { name: 'result', id: parts[1], tab: parts[2] || 'board' };
  return { name: 'home' };
}

function go(path, replace = false) {
  const h = `#/${path}`;
  if (replace) {
    history.replaceState(null, '', h);
    render();
  } else if (location.hash !== h) {
    location.hash = h;
  } else {
    render();
  }
}

function render() {
  const route = parseRoute();
  if (route.name === 'play' && !data.current) return go('', true);
  if (route.name === 'play' && G.isFinished(data.current)) return finishGame(data.current, { silent: true });
  if (route.name === 'result' && !data.history.some((g) => g.id === route.id)) return go('', true);
  if (route.name === 'setup' && !draft) draft = newDraft();

  const views = { home: viewHome, setup: viewSetup, play: viewPlay, result: viewResult };
  const active = document.activeElement;
  const key = pendingFocus || (active && $app.contains(active) ? active.dataset.key : null);
  pendingFocus = null;

  document.body.dataset.view = route.name;
  $app.innerHTML = views[route.name](route);

  const routeKey = `${route.name}/${route.tab || ''}/${route.id || ''}`;
  if (routeKey !== lastRouteKey) {
    window.scrollTo(0, 0);
    if (lastRouteKey) hideToast();
    lastRouteKey = routeKey;
  } else if (key) {
    const el = $app.querySelector(`[data-key="${CSS.escape(key)}"]`);
    if (el && !el.disabled) el.focus({ preventScroll: true });
  }
  drawCharts();
  updateTitle(route);
  updateWakeLock();
}

function drawCharts() {
  $app.querySelectorAll('[data-chart]').forEach((el) => {
    const g = findGame(el.dataset.chart);
    if (g) drawChart(el, g, { focus: chartFocus });
  });
}

function updateTitle(route) {
  let title = 'Wizz · Wizard score keeper';
  if (route.name === 'play' && data.current) {
    title = `${t('roundOfShort', { r: data.current.rounds.length + 1, n: G.totalRounds(data.current) })} · Wizz`;
  } else if (route.name === 'setup') title = `${t('setupTitle')} · Wizz`;
  else if (route.name === 'result') title = `${t('gameOver')} · Wizz`;
  document.title = title;
}

// ---------- shared components ----------

function topbar({ title, sub = '', menu = '' }) {
  return `<header class="topbar">
    <a class="icon-btn" href="#/" aria-label="${esc(t('home'))}">${icon('back')}</a>
    <div class="topbar-title"><h1>${esc(title)}</h1>${sub}</div>
    ${menu || '<span class="icon-btn-spacer"></span>'}
  </header>`;
}

function stepper({ action, value, min, max, label, key, display, attrs = '' }) {
  return `<div class="stepper" role="group" aria-label="${esc(label)}">
    <button type="button" class="step-btn" data-action="${action}" data-d="-1" ${attrs} ${value == null || value <= min ? 'disabled' : ''} aria-label="${esc(label)} −1" data-key="${key}-dec">${icon('minus')}</button>
    <output class="step-val">${display ?? (value == null ? '–' : value)}</output>
    <button type="button" class="step-btn" data-action="${action}" data-d="1" ${attrs} ${value != null && value >= max ? 'disabled' : ''} aria-label="${esc(label)} +1" data-key="${key}-inc">${icon('plus')}</button>
  </div>`;
}

/** Number chips 0..max for quick taps; falls back to a stepper for big hands. */
function numberPicker(kind, p, value, max, { forbidden = null, label }) {
  if (max > 12) {
    return stepper({ action: kind, value, min: 0, max, label, key: `${kind}-${p}`, attrs: `data-p="${p}"` });
  }
  let s = `<div class="chips" role="group" aria-label="${esc(label)}">`;
  for (let v = 0; v <= max; v++) {
    const on = value === v;
    const no = forbidden === v;
    s += `<button type="button" class="chip${on ? ' on' : ''}${no ? ' forbidden' : ''}" aria-pressed="${on}" ${no ? 'disabled' : ''} data-action="${kind}" data-p="${p}" data-v="${v}" data-key="${kind}-${p}-${v}">${v}</button>`;
  }
  return `${s}</div>`;
}

function cloudButton(action, p, adj, name) {
  return `<button type="button" class="cloud-btn${adj ? ' on' : ''}" data-action="${action}" data-p="${p}" aria-pressed="${!!adj}" aria-label="${esc(t('cloudLabel', { name }))}" data-key="${action}-${p}">${icon('cloud')}<span>${adj > 0 ? '+1' : adj < 0 ? '−1' : '±1'}</span></button>`;
}

// ---------- home ----------

function viewHome() {
  const cur = data.current;
  let resume = '';
  if (cur) {
    const total = G.totalRounds(cur);
    resume = `<section class="card resume">
      <div class="resume-main">
        <p class="eyebrow">${t('inProgress')}</p>
        <p class="resume-title">${t('roundOfShort', { r: Math.min(cur.rounds.length + 1, total), n: total })}</p>
        <p class="muted small clamp">${esc(cur.players.map((p) => p.name).join(', '))}</p>
      </div>
      <button class="btn primary" data-action="continue">${t('continueGame')}</button>
    </section>`;
  }
  const hist = data.history.length
    ? `<ul class="hist-list">${data.history.map(histItem).join('')}</ul>`
    : `<p class="empty">${t('noHistory')}</p>`;
  const langOpts = Object.entries(LANGS)
    .map(([code, d]) => `<option value="${code}"${code === lang() ? ' selected' : ''}>${d.langName}</option>`)
    .join('');
  const themeOpts = ['auto', 'light', 'dark']
    .map((v) => `<option value="${v}"${data.settings.theme === v ? ' selected' : ''}>${t(`theme${cap(v)}`)}</option>`)
    .join('');
  return `<div class="page home">
    <header class="hero">
      ${logo}
      <h1 class="brand">Wizz</h1>
      <p class="tagline">${t('appTagline')}</p>
    </header>
    <main class="stack">
      ${resume}
      <button class="btn ${cur ? 'secondary' : 'primary'} big block" data-action="new-game">${icon('plus')}<span>${t('newGame')}</span></button>
      <section class="stack-sm">
        <h2 class="section-title">${t('history')}</h2>
        ${hist}
      </section>
      <section class="card prefs">
        <label class="pref"><span>${t('language')}</span><select class="select" data-setting="lang">${langOpts}</select></label>
        <label class="pref"><span>${t('theme')}</span><select class="select" data-setting="theme">${themeOpts}</select></label>
      </section>
      <p class="foot muted small">${t('offline')}</p>
    </main>
  </div>`;
}

function histItem(g) {
  const { final } = G.scoreTable(g);
  const winners = G.ranking(final).filter((e) => e.rank === 1);
  const names = winners.map((w) => g.players[w.player].name).join(' & ');
  return `<li><a class="hist" href="#/game/${esc(g.id)}">
    <span class="hist-icon">${icon('trophy')}</span>
    <span class="hist-main">
      <span class="hist-title"><span class="clamp">${esc(names)}</span><span class="hist-score">${fmt(winners[0]?.score ?? 0)}</span></span>
      <span class="hist-sub muted small">${formatDate(g.finishedAt || g.updatedAt)} · ${t('roundsPlayed', { n: g.rounds.length })}</span>
      <span class="hist-sub muted small clamp">${esc(g.players.map((p) => p.name).join(', '))}</span>
    </span>
  </a></li>`;
}

// ---------- setup ----------

function newDraft(from) {
  const base = from ? from.rules : data.settings.lastRules || G.DEFAULT_RULES;
  const rules = JSON.parse(JSON.stringify(base));
  if (!from) rules.rounds = null;
  return {
    names: from ? from.players.map((p) => p.name) : ['', '', ''],
    firstDealer: from ? (from.firstDealer + 1) % from.players.length : 0,
    rules,
    showScoring: false,
  };
}

const draftNames = () => draft.names.map((s, i) => s.trim() || t('playerN', { n: i + 1 }));

function setupProblem() {
  const names = draftNames();
  if (names.length < G.MIN_PLAYERS) return t('needPlayers', { min: G.MIN_PLAYERS });
  const lower = names.map((s) => s.toLocaleLowerCase());
  if (new Set(lower).size !== lower.length) return t('duplicateNames');
  return '';
}

function viewSetup() {
  const d = draft;
  const n = d.names.length;
  const names = draftNames();
  const rules = d.rules;
  const max = G.maxRounds(n, rules.deckSize);
  const rounds = rules.rounds ? Math.min(rules.rounds, max) : max;
  const used = new Set(names.map((s) => s.toLocaleLowerCase()));
  const recent = n < G.MAX_PLAYERS ? recentPlayers().filter((nm) => !used.has(nm.toLocaleLowerCase())).slice(0, 12) : [];
  const problem = setupProblem();
  const sc = rules.scoring;

  const rows = d.names
    .map(
      (name, i) => `<li class="pedit">
      ${swatch(i)}
      <input class="input" type="text" value="${esc(name)}" placeholder="${esc(t('playerN', { n: i + 1 }))}" maxlength="24" autocomplete="off" autocapitalize="words" spellcheck="false" enterkeyhint="${i === n - 1 ? 'done' : 'next'}" data-input="name" data-i="${i}" data-key="name-${i}" aria-label="${esc(t('playerN', { n: i + 1 }))}">
      <button type="button" class="icon-btn sm" data-action="move" data-i="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="${esc(t('moveUp', { name: names[i] }))}" data-key="up-${i}">${icon('up')}</button>
      <button type="button" class="icon-btn sm" data-action="move" data-i="${i}" data-dir="1" ${i === n - 1 ? 'disabled' : ''} aria-label="${esc(t('moveDown', { name: names[i] }))}" data-key="down-${i}">${icon('down')}</button>
      <button type="button" class="icon-btn sm danger" data-action="remove" data-i="${i}" ${n <= G.MIN_PLAYERS ? 'disabled' : ''} aria-label="${esc(t('removePlayer', { name: names[i] }))}" data-key="rm-${i}">${icon('trash')}</button>
    </li>`
    )
    .join('');

  const recentHtml = recent.length
    ? `<div class="recent"><p class="label">${t('recentPlayers')}</p><div class="chip-row">${recent
        .map((nm) => `<button type="button" class="chip wide ghost" data-action="add-recent" data-name="${esc(nm)}">${icon('plus')}<span>${esc(nm)}</span></button>`)
        .join('')}</div></div>`
    : '';

  const dealerChips =
    names
      .map(
        (nm, i) => `<button type="button" class="chip wide${d.firstDealer === i ? ' on' : ''}" aria-pressed="${d.firstDealer === i}" data-action="dealer" data-i="${i}" data-key="dealer-${i}">${swatch(i)}<span data-dealer-label="${i}">${esc(nm)}</span></button>`
      )
      .join('') +
    `<button type="button" class="chip wide ghost" data-action="random-dealer" data-key="random-dealer">${icon('shuffle')}<span>${t('random')}</span></button>`;

  const toggle = (key, title, desc) => `<label class="toggle">
      <span class="toggle-text"><span class="toggle-title">${title}</span><span class="toggle-desc">${desc}</span></span>
      <input type="checkbox" class="switch" data-rule="${key}" ${rules[key] ? 'checked' : ''}>
    </label>`;

  const scoreField = (field, label) => `<div class="field-row"><span>${label}</span>${stepper({ action: 'score', value: sc[field], min: 0, max: 995, label, key: `score-${field}`, attrs: `data-field="${field}"` })}</div>`;

  return `<div class="page setup">
    ${topbar({ title: t('setupTitle') })}
    <main class="stack">
      <section class="card">
        <div class="card-head"><h2 class="card-title">${t('players')}</h2><span class="count">${t('playerCount', { n, max: G.MAX_PLAYERS })}</span></div>
        <p class="hint">${t('seatingHint')}</p>
        <ol class="plist">${rows}</ol>
        <button type="button" class="btn secondary block" data-action="add-player" ${n >= G.MAX_PLAYERS ? 'disabled' : ''} data-key="add-player">${icon('plus')}<span>${t('addPlayer')}</span></button>
        ${recentHtml}
      </section>

      <section class="card">
        <h2 class="card-title">${t('firstDealer')}</h2>
        <div class="chip-row">${dealerChips}</div>
      </section>

      <section class="card">
        <h2 class="card-title">${t('rounds')}</h2>
        <div class="field-row">
          <span>${t('deck')}</span>
          ${stepper({ action: 'deck', value: rules.deckSize, min: n, max: 200, label: t('deck'), key: 'deck' })}
        </div>
        <div class="chip-row end">
          <button type="button" class="chip wide${rules.deckSize === 60 ? ' on' : ''}" aria-pressed="${rules.deckSize === 60}" data-action="deck-set" data-v="60">60 · ${t('deckStandard')}</button>
          <button type="button" class="chip wide${rules.deckSize === 120 ? ' on' : ''}" aria-pressed="${rules.deckSize === 120}" data-action="deck-set" data-v="120">120 · ${t('deckDouble')}</button>
        </div>
        <div class="field-row">
          <span>${t('rounds')}</span>
          ${stepper({ action: 'rounds', value: rounds, min: 1, max, label: t('rounds'), key: 'rounds' })}
        </div>
        <p class="hint">${t('roundsHint', { players: n, deck: rules.deckSize, max })}${rounds < max ? ` <button type="button" class="link" data-action="rounds-all">${t('roundsAll')}: ${max}</button>` : ''}</p>
      </section>

      <section class="card">
        <h2 class="card-title">${t('rules')}</h2>
        <div class="toggles">
          ${toggle('noEvenBids', t('ruleNoEven'), t('ruleNoEvenDesc'))}
          ${toggle('bomb', t('ruleBomb'), t('ruleBombDesc'))}
          ${toggle('cloud', t('ruleCloud'), t('ruleCloudDesc'))}
        </div>
      </section>

      <section class="card">
        <button type="button" class="collapse" data-action="toggle-scoring" aria-expanded="${d.showScoring}">
          <span><span class="card-title">${t('scoring')}</span><span class="hint block">${t('scoringSummary', sc)}</span></span>
          ${icon(d.showScoring ? 'up' : 'down')}
        </button>
        ${
          d.showScoring
            ? `<div class="collapse-body">
            ${scoreField('base', t('scoreBase'))}
            ${scoreField('perTrick', t('scorePerTrick'))}
            ${scoreField('penalty', t('scorePenalty'))}
            <button type="button" class="link" data-action="score-reset">${t('resetDefaults')}</button>
          </div>`
            : ''
        }
      </section>

      <div class="actionbar solo">
        <p class="error" id="setup-error" role="alert">${esc(problem)}</p>
        <button type="button" class="btn primary big block" data-action="start" ${problem ? 'disabled' : ''}>${t('startGame')}</button>
      </div>
    </main>
  </div>`;
}

function refreshSetupStatus() {
  const problem = setupProblem();
  const err = document.getElementById('setup-error');
  if (err) err.textContent = problem;
  const btn = $app.querySelector('[data-action="start"]');
  if (btn) btn.disabled = !!problem;
  draftNames().forEach((nm, i) => {
    const el = $app.querySelector(`[data-dealer-label="${i}"]`);
    if (el) el.textContent = nm;
  });
}

async function startGame() {
  const problem = setupProblem();
  if (problem) return toast(problem, { error: true });
  if (data.current && !(await confirmDialog(t('replaceGameConfirm'), { okLabel: t('startGame'), danger: true }))) return;
  const names = draftNames();
  const game = G.createGame({ names, firstDealer: draft.firstDealer, rules: draft.rules });
  game.live = G.newLiveRound(names.length);
  data.current = game;
  data.settings.lastRules = { ...game.rules, rounds: null };
  persist();
  draft = null;
  chartFocus = null;
  go('play', true);
}

// ---------- play ----------

function viewPlay(route) {
  const game = data.current;
  const total = G.totalRounds(game);
  const r = game.rounds.length;
  const tab = ['round', 'board', 'chart'].includes(route.tab) ? route.tab : 'round';
  const body = tab === 'board' ? viewBoardSection(game, true) : tab === 'chart' ? viewChartSection(game) : viewRound(game);
  const pct = Math.round((r / total) * 100);
  const sub = `<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${r}"><span style="width:${pct}%"></span></div>`;
  const menu = `<button type="button" class="icon-btn" data-action="menu" aria-label="${esc(t('menu'))}">${icon('more')}</button>`;
  const tabBtn = (id, path, ic, label) =>
    `<button type="button" class="tab${tab === id ? ' on' : ''}" data-action="tab" data-to="${path}" ${tab === id ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></button>`;
  return `<div class="page play">
    ${topbar({ title: t('roundOf', { r: r + 1, n: total }), sub, menu })}
    <main class="stack">${body}</main>
    <nav class="tabbar">
      ${tabBtn('round', 'play', 'cards', t('tabRound'))}
      ${tabBtn('board', 'play/board', 'table', t('tabBoard'))}
      ${tabBtn('chart', 'play/chart', 'chart', t('tabChart'))}
    </nav>
  </div>`;
}

function viewRound(game) {
  const n = game.players.length;
  const r = game.rounds.length;
  const cards = G.cardsInRound(r);
  if (!game.live) game.live = G.newLiveRound(n);
  const live = game.live;
  const bidPhase = live.phase !== 'play';
  const order = G.biddingOrder(game, r);
  const dealer = G.dealerIndex(game, r);
  const { final } = G.scoreTable(game);
  const ranks = rankMap(final);
  const forbidden = bidPhase ? G.forbiddenBid(game, r, live.bids) : null;

  const meta = `<div class="round-meta">
      <span class="pill">${icon('cards')}${t('cards', { n: cards })}</span>
      <span class="pill">${swatch(dealer)}${esc(t('dealerIs', { name: game.players[dealer].name }))}</span>
      ${G.allCardsDealt(game, r) ? `<span class="pill warn">${t('noTrump')}</span>` : ''}
    </div>
    <ol class="steps">
      <li class="${bidPhase ? 'on' : 'done'}"><span class="step-n">${bidPhase ? '1' : icon('check')}</span>${t('stepBids')}</li>
      <li class="${bidPhase ? '' : 'on'}"><span class="step-n">2</span>${t('stepTricks')}</li>
    </ol>`;

  const rows = order
    .map((p) => {
      const name = game.players[p].name;
      const bid = live.bids[p];
      const tr = live.tricks[p];
      const adj = live.adjust[p] || 0;
      const eb = bid == null ? null : bid + adj;
      let mid = '';
      if (!bidPhase) {
        const preview = tr == null ? '' : `<span class="delta ${eb === tr ? 'pos' : 'neg'}">${signed(G.roundScore(eb, tr, game.rules.scoring))}</span>`;
        mid = `<span class="bid-pill">${t('bidN', { n: adj ? `${bid}→${eb}` : bid })}</span>${preview}`;
        if (game.rules.cloud) mid += cloudButton('cloud', p, adj, name);
      }
      const picker = bidPhase
        ? numberPicker('bid', p, bid, cards, { forbidden: p === dealer ? forbidden : null, label: t('bidLabel', { name }) })
        : numberPicker('tricks', p, tr, cards, { label: t('tricksLabel', { name }) });
      return `<li class="prow">
        <div class="prow-head">
          ${swatch(p)}
          <span class="pname">${esc(name)}</span>
          ${p === dealer ? `<span class="tag">${t('dealer')}</span>` : ''}
          <span class="grow"></span>
          <span class="ptotal">${r ? `<span class="rank">#${ranks[p]}</span>` : ''}${fmt(final[p])}</span>
        </div>
        ${mid ? `<div class="prow-mid">${mid}</div>` : ''}
        <div class="prow-pick">${picker}</div>
      </li>`;
    })
    .join('');

  let status;
  let note = '';
  let actions;
  if (bidPhase) {
    const s = sum(live.bids);
    const diff = s - cards;
    status = `${t('bidsSum', { sum: s, cards })} · ${diff > 0 ? t('over', { n: diff }) : diff < 0 ? t('under', { n: -diff }) : t('even')}`;
    const v = G.validateBids(game, r, live.bids);
    if (!v.ok && v.code !== 'errBidsMissing') note = `<p class="error" role="alert">${esc(t(v.code, v.params))}</p>`;
    else if (forbidden != null && live.bids[dealer] == null) note = `<p class="note">${esc(t('forbiddenHint', { name: game.players[dealer].name, n: forbidden }))}</p>`;
    actions = `<button type="button" class="btn primary" data-action="play-round" ${v.ok ? '' : 'disabled'}>${t('playRound')}</button>`;
  } else {
    status = t('tricksSum', { sum: sum(live.tricks), cards });
    const v = G.validateTricks(game, r, live);
    if (!v.ok && v.code !== 'errTricksMissing') note = `<p class="error" role="alert">${esc(t(v.code, v.params))}</p>`;
    actions = `<button type="button" class="btn ghost" data-action="back-bids">${t('backToBids')}</button>
      <button type="button" class="btn primary" data-action="score-round" ${v.ok ? '' : 'disabled'}>${t('scoreRound')}</button>`;
  }

  return `${meta}
    <ul class="plist-play">${rows}</ul>
    <div class="actionbar">
      <div class="actionbar-info"><p class="status">${status}</p>${note}</div>
      <div class="actionbar-btns">${actions}</div>
    </div>`;
}

function setLiveValue(kind, el) {
  const game = data.current;
  const live = game.live;
  const r = game.rounds.length;
  const cards = G.cardsInRound(r);
  const p = Number(el.dataset.p);
  const arr = kind === 'bid' ? live.bids : live.tricks;
  let v;
  if (el.dataset.v != null) v = Number(el.dataset.v);
  else {
    const d = Number(el.dataset.d);
    v = arr[p] == null ? (d > 0 ? 0 : null) : arr[p] + d;
    if (v == null) return;
    if (kind === 'bid' && p === G.dealerIndex(game, r) && v === G.forbiddenBid(game, r, live.bids)) v += d;
    if (v < 0 || v > cards) return;
  }
  arr[p] = v;
  persist();
  render();
}

function scoreRound() {
  const game = data.current;
  const r = game.rounds.length;
  const res = G.commitLiveRound(game);
  if (!res.ok) return toast(t(res.code, res.params), { error: true });
  if (G.isFinished(game)) return finishGame(game);
  game.live = G.newLiveRound(game.players.length);
  persist();
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  toast(t('roundScored', { r: r + 1 }), {
    action: {
      label: t('undo'),
      fn: () => {
        if (data.current !== game || game.rounds.length !== r + 1) return;
        G.undoLastRound(game);
        persist();
        render();
      },
    },
  });
}

function finishGame(game, { silent = false, undoRound = true } = {}) {
  game.finishedAt = game.finishedAt || Date.now();
  game.live = null;
  data.history = [game, ...data.history.filter((g) => g.id !== game.id)];
  if (data.current && data.current.id === game.id) data.current = null;
  chartFocus = null;
  persist();
  go(`game/${game.id}`, true);
  if (!silent) {
    toast(t('gameOver'), { action: { label: t('undo'), fn: () => reopenGame(game.id, undoRound) } });
  }
}

function reopenGame(id, undoRound) {
  const g = data.history.find((x) => x.id === id);
  if (!g || data.current) return;
  data.history = data.history.filter((x) => x.id !== id);
  if (undoRound) G.undoLastRound(g);
  else g.finishedAt = null;
  if (!g.live) g.live = G.newLiveRound(g.players.length);
  data.current = g;
  persist();
  go('play', true);
}

// ---------- scoreboard & chart ----------

function viewStandings(game) {
  const { final, hits } = G.scoreTable(game);
  const R = game.rounds.length;
  const rows = G.ranking(final)
    .map(
      (e) => `<li class="stand">
      <span class="stand-rank${R && e.rank <= 3 ? ` r${e.rank}` : ''}">${e.rank}</span>
      ${swatch(e.player)}
      <span class="stand-name"><span class="clamp">${esc(game.players[e.player].name)}</span>${R ? `<span class="muted small">${t('hits', { hits: hits[e.player], rounds: R })}</span>` : ''}</span>
      <span class="stand-score">${fmt(e.score)}</span>
    </li>`
    )
    .join('');
  return `<section class="card"><h2 class="card-title">${t('standings')}</h2><ol class="standings">${rows}</ol></section>`;
}

function boardTable(game, isLive) {
  const n = game.players.length;
  const R = game.rounds.length;
  const total = G.totalRounds(game);
  const { deltas, totals, final } = G.scoreTable(game);
  const best = R ? Math.max(...final) : null;
  const head = game.players
    .map((pl, p) => `<th scope="col"><span class="th-inner">${swatch(p)}<span class="th-name">${esc(pl.name)}</span></span></th>`)
    .join('');
  let body = '';
  for (let r = 0; r < R; r++) {
    const round = game.rounds[r];
    const cells = game.players
      .map((_, p) => {
        const eb = G.effectiveBid(round, p);
        const tr = round.tricks[p];
        const adj = (round.adjust && round.adjust[p]) || 0;
        return `<td class="${eb === tr ? 'hit' : 'miss'}"><span class="cum">${fmt(totals[r][p])}</span><span class="meta"><span class="bt" title="${esc(`${t('bid')} ${eb} · ${t('won')} ${tr}`)}">${eb}${adj ? icon('cloud') : ''}/${tr}</span><span class="d">${signed(deltas[r][p])}</span></span></td>`;
      })
      .join('');
    body += `<tr><th scope="row" class="rc"><button type="button" class="rbtn" data-action="edit-round" data-g="${esc(game.id)}" data-r="${r}" aria-label="${esc(t('editRound', { r: r + 1 }))}"><span>${r + 1}</span>${icon('edit')}</button></th>${cells}</tr>`;
  }
  if (isLive && R < total) {
    const live = game.live;
    const cells = game.players
      .map((_, p) => `<td class="pending">${live && live.bids[p] != null ? `<span class="meta"><span class="bt">${esc(t('bidN', { n: live.bids[p] }))}</span></span>` : ''}</td>`)
      .join('');
    body += `<tr class="current"><th scope="row" class="rc"><span class="rnum">${R + 1}</span></th>${cells}</tr>`;
    for (let r = R + 1; r < total; r++) {
      body += `<tr class="future"><th scope="row" class="rc"><span class="rnum">${r + 1}</span></th>${'<td></td>'.repeat(n)}</tr>`;
    }
  }
  const foot = final
    .map((s, p) => {
      const lead = R && s === best;
      return `<td class="${lead ? 'lead' : ''}">${lead ? icon('crown') : ''}${fmt(s)}</td>`;
    })
    .join('');
  return `<table class="board">
    <thead><tr><th scope="col" class="rc">#</th>${head}</tr></thead>
    <tbody>${body}</tbody>
    <tfoot><tr><th scope="row" class="rc" aria-label="${esc(t('total'))}">Σ</th>${foot}</tr></tfoot>
  </table>`;
}

function viewBoardSection(game, isLive) {
  return `${viewStandings(game)}
    <section class="card board-card">
      <div class="board-scroll">${boardTable(game, isLive)}</div>
      ${game.rounds.length ? `<p class="hint">${t('editHint')}</p>` : ''}
    </section>`;
}

function viewChartSection(game) {
  return `<section class="card">
    <h2 class="card-title">${t('chartLabel')}</h2>
    <div class="chart" data-chart="${esc(game.id)}"></div>
  </section>`;
}

// ---------- result ----------

function viewResult(route) {
  const game = findGame(route.id);
  const tab = route.tab === 'chart' ? 'chart' : 'board';
  const R = game.rounds.length;
  const { final } = G.scoreTable(game);
  const winners = G.ranking(final).filter((e) => e.rank === 1);
  const tie = winners.length > 1;
  const title = tie ? t('tieWin') : t('wins', { name: game.players[winners[0].player].name });
  const sub = `<p class="sub">${formatDate(game.finishedAt || game.updatedAt)} · ${t('roundsPlayed', { n: R })}</p>`;
  const segBtn = (id, path, ic, label) =>
    `<button type="button" class="seg-btn${tab === id ? ' on' : ''}" aria-pressed="${tab === id}" data-action="tab" data-to="${path}">${icon(ic)}<span>${label}</span></button>`;
  return `<div class="page result">
    ${topbar({ title: t('gameOver'), sub })}
    <main class="stack">
      <section class="card winner">
        <div class="winner-icon">${icon('trophy')}</div>
        <p class="winner-title">${esc(title)}</p>
        ${tie ? `<p class="winner-names">${esc(winners.map((w) => game.players[w.player].name).join(' & '))}</p>` : ''}
        <p class="winner-score">${t('points', { n: fmt(winners[0].score) })}</p>
      </section>
      ${viewStandings(game)}
      <div class="seg">
        ${segBtn('board', `game/${game.id}`, 'table', t('tabBoard'))}
        ${segBtn('chart', `game/${game.id}/chart`, 'chart', t('tabChart'))}
      </div>
      ${
        tab === 'chart'
          ? viewChartSection(game)
          : `<section class="card board-card"><div class="board-scroll">${boardTable(game, false)}</div><p class="hint">${t('editHint')}</p></section>`
      }
      <div class="row-actions">
        <button type="button" class="btn primary" data-action="play-again" data-g="${esc(game.id)}">${t('playAgain')}</button>
        <button type="button" class="btn ghost danger" data-action="delete-game" data-g="${esc(game.id)}">${icon('trash')}<span>${t('deleteGame')}</span></button>
      </div>
    </main>
  </div>`;
}

// ---------- dialogs ----------

function openDialog(spec) {
  dlg = spec;
  renderDialog();
  if (!$dlg.open) $dlg.showModal();
}

function renderDialog() {
  if (!dlg) return;
  const active = document.activeElement;
  const key = active && $dlg.contains(active) ? active.dataset.key : null;
  $dlg.className = dlg.className || '';
  $dlg.innerHTML = `<div class="dlg-inner">
    ${dlg.title ? `<h2 class="dlg-title">${esc(dlg.title)}</h2>` : ''}
    <div class="dlg-body">${dlg.body()}</div>
    ${dlg.footer ? `<div class="dlg-foot">${dlg.footer()}</div>` : ''}
  </div>`;
  if (key) $dlg.querySelector(`[data-key="${CSS.escape(key)}"]`)?.focus();
}

function closeDialog() {
  if (!dlg) return;
  const d = dlg;
  dlg = null;
  if ($dlg.open) $dlg.close();
  $dlg.innerHTML = '';
  d.onClose?.();
}

$dlg.addEventListener('close', () => {
  // Fired after Escape, or late after a programmatic close (ignore if reopened meanwhile).
  if (dlg && !$dlg.open) {
    const d = dlg;
    dlg = null;
    $dlg.innerHTML = '';
    d.onClose?.();
  }
});
$dlg.addEventListener('click', (e) => {
  if (e.target === $dlg) closeDialog(); // backdrop
});

const dlgButtons = (okLabel, { danger = false } = {}) =>
  `<button type="button" class="btn ghost" data-action="dlg-cancel">${t('cancel')}</button>
   <button type="button" class="btn ${danger ? 'danger-solid' : 'primary'}" data-action="dlg-ok">${esc(okLabel)}</button>`;

function confirmDialog(message, { okLabel = t('confirm'), danger = false } = {}) {
  return new Promise((resolve) => {
    let result = false;
    openDialog({
      className: 'narrow',
      body: () => `<p class="dlg-msg">${esc(message)}</p>`,
      footer: () => dlgButtons(okLabel, { danger }),
      onAction(a) {
        if (a === 'dlg-ok') {
          result = true;
          closeDialog();
        }
      },
      onClose: () => resolve(result),
    });
  });
}

function openMenu() {
  const game = data.current;
  const R = game.rounds.length;
  openDialog({
    className: 'sheet',
    title: t('menu'),
    body: () => `<div class="menu">
      <button type="button" class="menu-item" data-action="m-rename">${icon('user')}<span>${t('renamePlayers')}</span></button>
      ${R ? `<button type="button" class="menu-item" data-action="m-undo">${icon('undo')}<span>${t('undoLastRound')}</span></button>` : ''}
      <button type="button" class="menu-item" data-action="m-rules">${icon('rules')}<span>${t('activeRules')}</span></button>
      ${
        'wakeLock' in navigator
          ? `<label class="menu-item">${icon('sun')}<span class="grow">${t('keepAwake')}</span><input type="checkbox" class="switch" data-dlg-setting="keepAwake" ${data.settings.keepAwake ? 'checked' : ''}></label>`
          : ''
      }
      ${R ? `<button type="button" class="menu-item" data-action="m-finish">${icon('flag')}<span>${t('finishNow')}</span></button>` : ''}
      <button type="button" class="menu-item danger" data-action="m-abandon">${icon('trash')}<span>${t('abandon')}</span></button>
    </div>`,
    footer: () => `<button type="button" class="btn ghost block" data-action="dlg-cancel">${t('close')}</button>`,
    async onAction(a) {
      if (a === 'm-rename') {
        closeDialog();
        openRename(game);
      } else if (a === 'm-undo') {
        closeDialog();
        G.undoLastRound(game);
        persist();
        go('play', true);
      } else if (a === 'm-rules') {
        closeDialog();
        openRules(game);
      } else if (a === 'm-finish') {
        closeDialog();
        if (await confirmDialog(t('finishNowConfirm', { r: R }), { okLabel: t('finishNow') })) {
          game.finishedAt = Date.now();
          finishGame(game, { undoRound: false });
        }
      } else if (a === 'm-abandon') {
        closeDialog();
        if (await confirmDialog(t('abandonConfirm'), { okLabel: t('abandon'), danger: true })) {
          data.current = null;
          persist();
          go('', true);
        }
      }
    },
  });
}

function openRename(game) {
  let error = '';
  openDialog({
    title: t('renamePlayers'),
    body: () =>
      game.players
        .map((pl, p) => `<label class="field">${swatch(p)}<input class="input" type="text" data-rename="${p}" value="${esc(pl.name)}" maxlength="24" autocomplete="off" aria-label="${esc(t('playerN', { n: p + 1 }))}"></label>`)
        .join('') + `<p class="error" role="alert">${esc(error)}</p>`,
    footer: () => dlgButtons(t('save')),
    onAction(a) {
      if (a !== 'dlg-ok') return;
      const names = [...$dlg.querySelectorAll('[data-rename]')].map((el, p) => el.value.trim() || game.players[p].name);
      const lower = names.map((s) => s.toLocaleLowerCase());
      if (new Set(lower).size !== lower.length) {
        error = t('duplicateNames');
        renderDialog();
        return;
      }
      names.forEach((nm, p) => (game.players[p].name = nm));
      game.updatedAt = Date.now();
      persist();
      closeDialog();
      render();
    },
  });
}

function openRules(game) {
  const r = game.rules;
  const line = (on, label, desc) =>
    `<li class="rule${on ? ' on' : ''}"><span class="rule-mark">${on ? icon('check') : icon('minus')}</span><span><strong>${label}</strong><span class="muted small block">${desc}</span></span></li>`;
  openDialog({
    title: t('activeRules'),
    body: () => `<ul class="rule-list">
      ${line(true, t('rounds'), `${G.totalRounds(game)} · ${t('deck')}: ${r.deckSize}`)}
      ${line(r.noEvenBids, t('ruleNoEven'), t('ruleNoEvenDesc'))}
      ${line(r.bomb, t('ruleBomb'), t('ruleBombDesc'))}
      ${line(r.cloud, t('ruleCloud'), t('ruleCloudDesc'))}
      ${line(true, t('scoring'), t('scoringSummary', r.scoring))}
    </ul>`,
    footer: () => `<button type="button" class="btn ghost block" data-action="dlg-cancel">${t('close')}</button>`,
  });
}

function openEditRound(game, r) {
  const n = game.players.length;
  const src = game.rounds[r];
  const work = { bids: src.bids.slice(), tricks: src.tricks.slice(), adjust: src.adjust ? src.adjust.slice() : Array(n).fill(0) };
  const cards = G.cardsInRound(r);
  let error = '';
  openDialog({
    title: t('editRound', { r: r + 1 }),
    body: () => {
      const rows = G.biddingOrder(game, r)
        .map((p) => {
          const name = game.players[p].name;
          return `<li class="edit-row">
          <div class="edit-name">${swatch(p)}<span class="clamp">${esc(name)}</span>${game.rules.cloud ? cloudButton('e-cloud', p, work.adjust[p] || 0, name) : ''}</div>
          <div class="edit-fields">
            <div class="edit-field"><span class="edit-label">${t('bid')}</span>${stepper({ action: 'e-bid', value: work.bids[p], min: 0, max: cards, label: t('bidLabel', { name }), key: `e-bid-${p}`, attrs: `data-p="${p}"` })}</div>
            <div class="edit-field"><span class="edit-label">${t('won')}</span>${stepper({ action: 'e-tricks', value: work.tricks[p], min: 0, max: cards, label: t('tricksLabel', { name }), key: `e-tricks-${p}`, attrs: `data-p="${p}"` })}</div>
          </div>
        </li>`;
        })
        .join('');
      const dealer = game.players[G.dealerIndex(game, r)].name;
      return `<p class="muted small">${t('cards', { n: cards })} · ${esc(t('dealerIs', { name: dealer }))}</p>
        <ul class="edit-list">${rows}</ul>
        <p class="error" role="alert">${esc(error)}</p>`;
    },
    footer: () => dlgButtons(t('save')),
    onAction(a, el) {
      const p = Number(el.dataset.p);
      if (a === 'e-bid' || a === 'e-tricks') {
        const arr = a === 'e-bid' ? work.bids : work.tricks;
        arr[p] = clamp(arr[p] + Number(el.dataset.d), 0, cards);
        error = '';
        renderDialog();
      } else if (a === 'e-cloud') {
        const opts = G.cloudOptions(game, r, work, p);
        const next = opts[(opts.indexOf(work.adjust[p] || 0) + 1) % opts.length];
        work.adjust = work.adjust.map(() => 0);
        work.adjust[p] = next;
        error = '';
        renderDialog();
      } else if (a === 'dlg-ok') {
        const v = G.validateRound(game, r, work);
        if (!v.ok) {
          error = t(v.code, v.params);
          renderDialog();
          return;
        }
        game.rounds[r] = work;
        game.updatedAt = Date.now();
        persist();
        closeDialog();
        render();
      }
    },
  });
}

// ---------- toast ----------

let toastTimer;
function toast(msg, { action, error = false } = {}) {
  clearTimeout(toastTimer);
  $toast.className = `toast${error ? ' error' : ''}`;
  $toast.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button" class="toast-btn">${esc(action.label)}</button>` : ''}`;
  $toast.hidden = false;
  if (action) {
    $toast.querySelector('button').addEventListener('click', () => {
      hideToast();
      action.fn();
    });
  }
  toastTimer = setTimeout(hideToast, action ? 6000 : 3500);
}
function hideToast() {
  clearTimeout(toastTimer);
  $toast.hidden = true;
}

// ---------- wake lock ----------

let wakeLock = null;
let wakePending = false;
async function updateWakeLock() {
  if (!('wakeLock' in navigator)) return;
  const want = data.settings.keepAwake && parseRoute().name === 'play' && document.visibilityState === 'visible';
  if (want && !wakeLock && !wakePending) {
    wakePending = true;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => (wakeLock = null));
    } catch {
      wakeLock = null;
    }
    wakePending = false;
  } else if (!want && wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

// ---------- events ----------

const actions = {
  'new-game': () => {
    draft = newDraft();
    go('setup');
  },
  continue: () => go('play'),
  tab: (el) => go(el.dataset.to, true),
  menu: () => openMenu(),

  // setup
  'add-player': () => {
    if (draft.names.length >= G.MAX_PLAYERS) return;
    draft.names.push('');
    pendingFocus = `name-${draft.names.length - 1}`;
    render();
  },
  'add-recent': (el) => {
    const empty = draft.names.findIndex((s) => !s.trim());
    if (empty >= 0) draft.names[empty] = el.dataset.name;
    else if (draft.names.length < G.MAX_PLAYERS) draft.names.push(el.dataset.name);
    render();
  },
  remove: (el) => {
    const i = Number(el.dataset.i);
    if (draft.names.length <= G.MIN_PLAYERS) return;
    draft.names.splice(i, 1);
    if (draft.firstDealer === i) draft.firstDealer = 0;
    else if (draft.firstDealer > i) draft.firstDealer--;
    render();
  },
  move: (el) => {
    const i = Number(el.dataset.i);
    const j = i + Number(el.dataset.dir);
    if (j < 0 || j >= draft.names.length) return;
    [draft.names[i], draft.names[j]] = [draft.names[j], draft.names[i]];
    if (draft.firstDealer === i) draft.firstDealer = j;
    else if (draft.firstDealer === j) draft.firstDealer = i;
    pendingFocus = `${Number(el.dataset.dir) < 0 ? 'up' : 'down'}-${j}`;
    render();
  },
  dealer: (el) => {
    draft.firstDealer = Number(el.dataset.i);
    render();
  },
  'random-dealer': () => {
    draft.firstDealer = Math.floor(Math.random() * draft.names.length);
    render();
    toast(`${t('firstDealer')}: ${draftNames()[draft.firstDealer]}`);
  },
  deck: (el) => {
    draft.rules.deckSize = clamp(draft.rules.deckSize + Number(el.dataset.d), draft.names.length, 200);
    render();
  },
  'deck-set': (el) => {
    draft.rules.deckSize = Math.max(Number(el.dataset.v), draft.names.length);
    render();
  },
  rounds: (el) => {
    const max = G.maxRounds(draft.names.length, draft.rules.deckSize);
    const cur = draft.rules.rounds ? Math.min(draft.rules.rounds, max) : max;
    const next = clamp(cur + Number(el.dataset.d), 1, max);
    draft.rules.rounds = next === max ? null : next;
    render();
  },
  'rounds-all': () => {
    draft.rules.rounds = null;
    render();
  },
  'toggle-scoring': () => {
    draft.showScoring = !draft.showScoring;
    render();
  },
  score: (el) => {
    const f = el.dataset.field;
    draft.rules.scoring = { ...draft.rules.scoring, [f]: clamp(draft.rules.scoring[f] + Number(el.dataset.d) * 5, 0, 995) };
    render();
  },
  'score-reset': () => {
    draft.rules.scoring = { ...G.DEFAULT_SCORING };
    render();
  },
  start: () => startGame(),

  // play
  bid: (el) => setLiveValue('bid', el),
  tricks: (el) => setLiveValue('tricks', el),
  cloud: (el) => {
    const game = data.current;
    const live = game.live;
    const p = Number(el.dataset.p);
    const opts = G.cloudOptions(game, game.rounds.length, live, p);
    const next = opts[(opts.indexOf(live.adjust[p] || 0) + 1) % opts.length];
    live.adjust = live.adjust.map(() => 0);
    live.adjust[p] = next;
    persist();
    render();
  },
  'play-round': () => {
    const game = data.current;
    const v = G.validateBids(game, game.rounds.length, game.live.bids);
    if (!v.ok) return toast(t(v.code, v.params), { error: true });
    game.live.phase = 'play';
    persist();
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  'back-bids': () => {
    data.current.live.phase = 'bid';
    persist();
    render();
  },
  'score-round': () => scoreRound(),

  // scoreboard / result
  'edit-round': (el) => {
    const g = findGame(el.dataset.g);
    if (g) openEditRound(g, Number(el.dataset.r));
  },
  'chart-focus': (el) => {
    const p = Number(el.dataset.p);
    chartFocus = chartFocus === p ? null : p;
    drawCharts();
    $app.querySelector(`[data-action="chart-focus"][data-p="${p}"]`)?.focus({ preventScroll: true });
  },
  'play-again': (el) => {
    const g = findGame(el.dataset.g);
    draft = newDraft(g);
    go('setup');
  },
  'delete-game': async (el) => {
    const id = el.dataset.g;
    if (!(await confirmDialog(t('deleteConfirm'), { okLabel: t('deleteGame'), danger: true }))) return;
    data.history = data.history.filter((g) => g.id !== id);
    persist();
    go('', true);
  },
};

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const a = el.dataset.action;
  if (dlg && $dlg.contains(el)) {
    e.preventDefault();
    if (a === 'dlg-cancel') closeDialog();
    else if (dlg.onAction) await dlg.onAction(a, el);
    // Shared actions inside dialogs (none needed beyond onAction).
    return;
  }
  const fn = actions[a];
  if (fn) {
    e.preventDefault();
    await fn(el, e);
  }
});

document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.input === 'name' && draft) {
    draft.names[Number(el.dataset.i)] = el.value;
    refreshSetupStatus();
  }
});

document.addEventListener('keydown', (e) => {
  const el = e.target;
  if (e.key === 'Enter' && el.dataset && el.dataset.input === 'name') {
    e.preventDefault();
    const next = $app.querySelector(`[data-key="name-${Number(el.dataset.i) + 1}"]`);
    if (next) next.focus();
    else el.blur();
  }
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset.setting === 'lang') {
    data.settings.lang = el.value;
    setLang(el.value);
    persist();
    render();
  } else if (el.dataset.setting === 'theme') {
    data.settings.theme = el.value;
    applyTheme();
    persist();
  } else if (el.dataset.rule && draft) {
    draft.rules[el.dataset.rule] = el.checked;
  } else if (el.dataset.dlgSetting === 'keepAwake') {
    data.settings.keepAwake = el.checked;
    persist();
    updateWakeLock();
  }
});

window.addEventListener('hashchange', render);
document.addEventListener('visibilitychange', updateWakeLock);

let resizeTimer;
let lastWidth = window.innerWidth;
window.addEventListener('resize', () => {
  if (window.innerWidth === lastWidth) return; // ignore mobile URL-bar height changes
  lastWidth = window.innerWidth;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(drawCharts, 150);
});

// Keep tabs in sync if the game is changed in another tab.
window.addEventListener('storage', (e) => {
  if (e.key !== 'wizz:v1') return;
  const fresh = load();
  data.current = fresh.current;
  data.history = fresh.history;
  data.settings = fresh.settings;
  render();
});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

render();
