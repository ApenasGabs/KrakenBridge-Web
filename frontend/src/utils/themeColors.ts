/**
 * Mapeamento de cores da barra de status (theme-color) para os 33 temas do DaisyUI
 * suportados no KrakenBridge Web.
 */

export const DEFAULT_THEME = "light";

export const DAISYUI_THEME_COLORS: Record<string, string> = {
  light: "#ffffff",
  dark: "#1d232a",
  cupcake: "#faf7f5",
  bumblebee: "#ffffff",
  emerald: "#ffffff",
  corporate: "#ffffff",
  synthwave: "#1a103c",
  retro: "#ece3ca",
  cyberpunk: "#ffee00",
  valentine: "#f0d6e8",
  halloween: "#212121",
  garden: "#e9e7e7",
  forest: "#171212",
  aqua: "#3b82f6",
  lofi: "#ffffff",
  pastel: "#ffffff",
  fantasy: "#ffffff",
  wireframe: "#ffffff",
  black: "#000000",
  luxury: "#09090b",
  dracula: "#282a36",
  cmyk: "#ffffff",
  autumn: "#f1f1f1",
  business: "#202020",
  acid: "#fafafa",
  lemonade: "#fefcbf",
  night: "#0f172a",
  coffee: "#20161f",
  winter: "#ffffff",
  dim: "#2a303c",
  nord: "#2e3440",
  sunset: "#121c22",
  purplewind: "#f3e8ff",
};

/**
 * Temas caracterizados por fundo escuro (para estilização de status bar e ícones)
 */
export const DARK_THEMES = new Set<string>([
  "dark",
  "synthwave",
  "halloween",
  "forest",
  "black",
  "luxury",
  "dracula",
  "business",
  "night",
  "coffee",
  "dim",
  "sunset",
]);

/**
 * Resolve a cor exata para a barra de status do Android baseada no tema ativo.
 */
export function resolveThemeColor(theme?: string): string {
  if (!theme) return DAISYUI_THEME_COLORS[DEFAULT_THEME];
  const normalized = theme.toLowerCase().trim();
  return DAISYUI_THEME_COLORS[normalized] || DAISYUI_THEME_COLORS[DEFAULT_THEME];
}

/**
 * Determina se o tema é escuro para ajustar o estilo da barra de status (ex: iOS e contrastes).
 */
export function isDarkTheme(theme?: string): boolean {
  if (!theme) return false;
  return DARK_THEMES.has(theme.toLowerCase().trim());
}
