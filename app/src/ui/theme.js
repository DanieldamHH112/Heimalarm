import { settings } from "../core/settings.js";

export function applyTheme() {
  const t = settings().ui.theme;
  if (t === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.dataset.theme = t;
}
