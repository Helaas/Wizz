// Inline stroke icons (24×24 grid). Decorative unless a label is passed.

const paths = {
  back: '<path d="M15 18l-6-6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  more: '<circle cx="12" cy="5" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="19" r="1.4" fill="currentColor"/>',
  shuffle: '<path d="M16 4h4v4M4 20L20 4M20 16v4h-4M15 15l5 5M4 4l5 5"/>',
  table: '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M3.5 9.5h17M3.5 15h17M9.5 4v16"/>',
  chart: '<path d="M4 4v16h16"/><path d="M7.5 15l3.5-4 3 2.5L19 7"/>',
  cards: '<rect x="3.5" y="6" width="10" height="14" rx="1.8"/><path d="M8 3.8l9.6 1.7a1.8 1.8 0 0 1 1.5 2.1l-1.8 10.6"/>',
  trophy: '<path d="M8 20h8M12 16v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M17 6h3v1.5A3.5 3.5 0 0 1 16.6 11M7 6H4v1.5A3.5 3.5 0 0 0 7.4 11"/>',
  crown: '<path d="M4 8l4 3.5L12 5l4 6.5L20 8l-1.5 10h-13L4 8z"/>',
  edit: '<path d="M4 20h4L19 9a2.1 2.1 0 0 0-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
  cloud: '<path d="M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6 10.5 3.8 3.8 0 0 0 7 18z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  rules: '<path d="M6 3.5h9l3 3V20.5H6z"/><path d="M9 10h6M9 13.5h6M9 17h4"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
};

export function icon(name, label) {
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${a11y}>${paths[name] || ''}</svg>`;
}

export const logo = `<svg class="logo-mark" viewBox="0 0 64 64" aria-hidden="true">
  <defs><linearGradient id="lg-hat" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7b6cff"/><stop offset="1" stop-color="#3a2a9e"/></linearGradient></defs>
  <path d="M33 6c-3 9-9 24-14 38h28C43 32 39 18 33 6z" fill="url(#lg-hat)"/>
  <path d="M10 46c5-3 13-4 22-4s17 1 22 4c-5 4-13 6-22 6s-17-2-22-6z" fill="#2c2080"/>
  <path d="M19 44h28" stroke="#f2c14e" stroke-width="3" stroke-linecap="round"/>
  <path d="M30 22l1.6 3.6 3.9.4-2.9 2.6.8 3.8L30 30.5l-3.4 1.9.8-3.8-2.9-2.6 3.9-.4z" fill="#f2c14e"/>
  <circle cx="45" cy="16" r="2" fill="#f2c14e"/><circle cx="51" cy="26" r="1.3" fill="#f2c14e"/>
</svg>`;
