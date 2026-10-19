// Symbole für Start und Einstellungen – eine Strichstärke, ein Stil (wie die Navigation).
const PATHS = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  net: '<path d="M5 12.55a11 11 0 0 1 14 0M8.5 16.4a6 6 0 0 1 7 0M2 8.8a16 16 0 0 1 20 0"/><circle cx="12" cy="20" r="1"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  pc: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/>',
  people: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M17 3.1a4 4 0 0 1 0 7.8M22 21a7 7 0 0 0-4-6.3"/>',
  voice: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v5"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  paint: '<circle cx="12" cy="12" r="9"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/><path d="M12 21c1 0 1.5-.7 1.5-1.5 0-.9-.6-1.2-.6-2 0-.8.7-1.5 1.5-1.5H17a4 4 0 0 0 4-4"/>',
  tool: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  flow: '<path d="M4 7h11M4 17h7M18 4l3 3-3 3M15 14l3 3-3 3"/>',
  home: '<path d="M4 11 12 4l8 7v9H4z"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  back: '<path d="m15 6-6 6 6 6"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-5A8 8 0 1 1 21 12z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/>',
  hub: '<circle cx="12" cy="12" r="3"/><path d="M12 3v6M12 15v6M3 12h6M15 12h6"/><circle cx="12" cy="3" r="1"/><circle cx="12" cy="21" r="1"/><circle cx="3" cy="12" r="1"/><circle cx="21" cy="12" r="1"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
};

/** Inline-SVG-Symbol (`aria-hidden`), Farbe über currentColor. */
export function icon(name) {
  const t = document.createElement("template");
  t.innerHTML = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${PATHS[name] || ""}</svg>`;
  return t.content.firstElementChild;
}
