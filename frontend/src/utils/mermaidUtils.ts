import mermaid from 'mermaid';

// Mapeia os prefixos do Mermaid para rótulos amigáveis em português
export function getDiagramTypeLabel(rawCode: string): string {
  const trimmed = rawCode.trim();
  if (/^(?:flowchart|graph)\b/i.test(trimmed)) return 'Fluxograma';
  if (/^sequenceDiagram\b/i.test(trimmed)) return 'Diagrama de Sequência';
  if (/^classDiagram\b/i.test(trimmed)) return 'Diagrama de Classes';
  if (/^stateDiagram(?:-v2)?\b/i.test(trimmed)) return 'Máquina de Estados';
  if (/^erDiagram\b/i.test(trimmed)) return 'Entidade-Relacionamento';
  if (/^journey\b/i.test(trimmed)) return 'User Journey';
  if (/^gantt\b/i.test(trimmed)) return 'Gráfico de Gantt';
  if (/^pie\b/i.test(trimmed)) return 'Gráfico de Pizza';
  if (/^gitGraph\b/i.test(trimmed)) return 'Grafo Git';
  if (/^mindmap\b/i.test(trimmed)) return 'Mapa Mental';
  if (/^timeline\b/i.test(trimmed)) return 'Linha do Tempo';
  if (/^quadrantChart\b/i.test(trimmed)) return 'Gráfico de Quadrantes';
  if (/^c4(?:Context|Container|Component)\b/i.test(trimmed)) return 'Modelo C4';
  return 'Diagrama';
}

export const DARK_THEMES = new Set([
  'dark', 'synthwave', 'halloween', 'forest', 'black', 'luxury', 
  'dracula', 'business', 'night', 'coffee', 'dim', 'sunset', 'purplewind'
]);

export function isDarkTheme(): boolean {
  if (typeof document === 'undefined') return true;
  const theme = document.documentElement.getAttribute('data-theme') || 
                document.body.getAttribute('data-theme') || '';
  if (theme && DARK_THEMES.has(theme.toLowerCase())) return true;
  if (theme && theme.toLowerCase() === 'light') return false;
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? true : false;
}

export function initMermaid(isDark: boolean) {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    fontFamily: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    theme: isDark ? 'dark' : 'default',
    themeVariables: isDark ? {
      darkMode: true,
      background: '#0d1117',
      primaryColor: '#1f6feb',
      primaryBorderColor: '#388bfd',
      primaryTextColor: '#c9d1d9',
      lineColor: '#58a6ff',
      secondaryColor: '#238636',
      tertiaryColor: '#161b22',
      mainBkg: '#161b22',
      nodeBorder: '#30363d',
      clusterBkg: '#0d1117',
      clusterBorder: '#30363d',
      titleColor: '#f0f6fc',
      edgeLabelBackground: '#161b22',
    } : {
      darkMode: false,
      background: '#ffffff',
      primaryColor: '#2563eb',
      primaryBorderColor: '#1d4ed8',
      primaryTextColor: '#1f2937',
      lineColor: '#4b5563',
      secondaryColor: '#10b981',
      tertiaryColor: '#f3f4f6',
      mainBkg: '#ffffff',
      nodeBorder: '#d1d5db',
      clusterBkg: '#f9fafb',
      clusterBorder: '#e5e7eb',
      titleColor: '#111827',
      edgeLabelBackground: '#f3f4f6',
    },
  });
}
