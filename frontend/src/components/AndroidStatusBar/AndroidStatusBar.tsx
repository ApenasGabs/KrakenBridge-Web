import React, { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { resolveThemeColor, isDarkTheme, DEFAULT_THEME } from "../../utils/themeColors";

export interface AndroidStatusBarProps {
  /**
   * Cor customizada opcional para sobrepor a cor do tema ativo.
   */
  color?: string;
  /**
   * Tema explícito opcional para sobrepor o tema detectado do documento.
   */
  theme?: string;
}

/**
 * Lê o background-color efetivo do tema ativo e o converte para hex (#rrggbb)
 * via canvas, que normaliza oklch/color() para sRGB. Retorna null se indisponível.
 */
function readThemeBackground(): string | null {
  if (typeof document === "undefined") return null;
  try {
    const raw = getComputedStyle(document.body).backgroundColor;
    if (!raw || raw === "transparent" || raw === "rgba(0, 0, 0, 0)") return null;
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#000000";
    ctx.fillStyle = raw;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  } catch {
    return null;
  }
}

/**
 * Componente AndroidStatusBar para KrakenBridge Web.
 *
 * Utiliza o React Helmet (react-helmet-async) para controlar dinamicamente
 * a cor da barra de status do sistema operacional Android (Chrome, Samsung Internet, WebViews e PWAs)
 * conforme o tema da aplicação se altera.
 */
export const AndroidStatusBar: React.FC<AndroidStatusBarProps> = ({
  color,
  theme: explicitTheme,
}) => {
  const [activeTheme, setActiveTheme] = useState<string>(() => {
    if (explicitTheme) return explicitTheme;
    if (typeof window === "undefined") return DEFAULT_THEME;
    return (
      document.documentElement.getAttribute("data-theme") ||
      localStorage.getItem("theme") ||
      DEFAULT_THEME
    );
  });

  useEffect(() => {
    if (explicitTheme) {
      setActiveTheme(explicitTheme);
      return;
    }

    const updateTheme = () => {
      if (typeof window === "undefined") return;
      const current =
        document.documentElement.getAttribute("data-theme") ||
        localStorage.getItem("theme") ||
        DEFAULT_THEME;
      setActiveTheme(current);
    };

    updateTheme();

    // Observa mudanças de atributos em document.documentElement (ex: data-theme aplicado pelo ThemeSelector)
    let observer: MutationObserver | null = null;
    if (typeof MutationObserver !== "undefined" && typeof document !== "undefined") {
      observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (
            mutation.type === "attributes" &&
            (mutation.attributeName === "data-theme" || mutation.attributeName === "class")
          ) {
            updateTheme();
          }
        }
      });

      observer.observe(document.documentElement, { attributes: true });
    }

    const handleStorage = (e: StorageEvent) => {
      if (e.key === "theme") updateTheme();
    };

    const handleThemeChange = () => {
      updateTheme();
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("theme-change", handleThemeChange);

    return () => {
      observer?.disconnect();
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("theme-change", handleThemeChange);
    };
  }, [explicitTheme]);

  const dark = isDarkTheme(activeTheme);

  // Cor real do fundo do tema (DaisyUI usa oklch, então a tabela fixa pode divergir).
  const [computedColor, setComputedColor] = useState<string | null>(null);

  useEffect(() => {
    if (color) return;
    // Aguarda o navegador aplicar o CSS do novo data-theme antes de ler a cor.
    const frame = requestAnimationFrame(() => setComputedColor(readThemeBackground()));
    return () => cancelAnimationFrame(frame);
  }, [activeTheme, color]);

  const activeColor = color ?? computedColor ?? resolveThemeColor(activeTheme);

  // Sincroniza qualquer meta tag estática preexistente no HTML inicial
  useEffect(() => {
    if (typeof document === "undefined") return;
    const metaTags = document.querySelectorAll('meta[name="theme-color"]');
    metaTags.forEach((el) => {
      el.setAttribute("content", activeColor);
    });
  }, [activeColor]);

  return (
    <Helmet>
      {/* Barra de status no Android Chrome, Samsung Internet, WebViews e PWAs */}
      <meta name="theme-color" content={activeColor} />
      {/* Windows Phone / Edge Mobile */}
      <meta name="msapplication-navbutton-color" content={activeColor} />
      {/* iOS Safari Status Bar Style */}
      <meta
        name="apple-mobile-web-app-status-bar-style"
        content={dark ? "black-translucent" : "default"}
      />
    </Helmet>
  );
};

export default AndroidStatusBar;
