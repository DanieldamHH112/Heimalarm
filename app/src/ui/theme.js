// E5 – Hell/Dunkel: System, Hell oder Dunkel. Umschalter in Navigation und Seitenkopf.
import { settings, set } from "../core/settings.js";
import { h } from "./dom.js";

const ORDER = ["system", "light", "dark"];
const LABEL = { system: "Automatisch", light: "Hell", dark: "Dunkel" };
const ICON = {
  system: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4v16a8 8 0 0 0 0-16z" fill="currentColor"/></svg>',
  light: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  dark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
};

export function applyTheme() {
  const t = settings().ui.theme;
  if (t === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  document.querySelectorAll("[data-theme-toggle]").forEach(paint);
}

function paint(btn) {
  const t = settings().ui.theme;
  btn.innerHTML = `${ICON[t]}<span>${LABEL[t]}</span>`;
  btn.title = `Farbschema: ${LABEL[t]} – klicken zum Wechseln`;
  btn.setAttribute("aria-label", btn.title);
}

/** Knopf, der System → Hell → Dunkel durchschaltet. */
export function themeToggle(extraClass = "") {
  const btn = h("button.theme-toggle" + (extraClass ? "." + extraClass : ""), {
    type: "button", "data-theme-toggle": true,
    onclick: () => {
      const t = settings().ui.theme;
      set("ui.theme", ORDER[(ORDER.indexOf(t) + 1) % ORDER.length]);
      applyTheme();
    },
  });
  paint(btn);
  return btn;
}
