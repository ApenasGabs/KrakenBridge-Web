import { describe, it, expect, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { AndroidStatusBar } from "../AndroidStatusBar";
import { DAISYUI_THEME_COLORS } from "../../../utils/themeColors";

describe("AndroidStatusBar", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.className = "";
  });

  it("deve inicializar a barra de status do Android com a cor do tema light por padrão", async () => {
    const { unmount } = render(
      <HelmetProvider>
        <AndroidStatusBar />
      </HelmetProvider>,
    );

    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    expect(metaThemeColor?.getAttribute("content")).toBe(DAISYUI_THEME_COLORS.light);

    const metaNavbutton = document.querySelector('meta[name="msapplication-navbutton-color"]');
    expect(metaNavbutton?.getAttribute("content")).toBe(DAISYUI_THEME_COLORS.light);

    const metaApple = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    expect(metaApple?.getAttribute("content")).toBe("default");

    unmount();
  });

  it("deve alterar a cor da barra de status quando o tema dark é carregado ou ativado", async () => {
    document.documentElement.setAttribute("data-theme", "dark");

    const { unmount } = render(
      <HelmetProvider>
        <AndroidStatusBar />
      </HelmetProvider>,
    );

    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    expect(metaThemeColor?.getAttribute("content")).toBe(DAISYUI_THEME_COLORS.dark);

    const metaApple = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    expect(metaApple?.getAttribute("content")).toBe("black-translucent");

    unmount();
  });

  it("deve reagir a alterações dinâmicas de data-theme no documentElement", async () => {
    const { unmount } = render(
      <HelmetProvider>
        <AndroidStatusBar />
      </HelmetProvider>,
    );

    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(
      DAISYUI_THEME_COLORS.light,
    );

    await act(async () => {
      document.documentElement.setAttribute("data-theme", "synthwave");
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(
      DAISYUI_THEME_COLORS.synthwave,
    );
    expect(
      document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.getAttribute("content"),
    ).toBe("black-translucent");

    await act(async () => {
      document.documentElement.setAttribute("data-theme", "cyberpunk");
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(
      DAISYUI_THEME_COLORS.cyberpunk,
    );

    unmount();
  });

  it("deve responder a eventos customizados theme-change", async () => {
    const { unmount } = render(
      <HelmetProvider>
        <AndroidStatusBar />
      </HelmetProvider>,
    );

    await act(async () => {
      document.documentElement.setAttribute("data-theme", "dracula");
      window.dispatchEvent(new CustomEvent("theme-change", { detail: { theme: "dracula" } }));
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(
      DAISYUI_THEME_COLORS.dracula,
    );

    unmount();
  });

  it("deve permitir sobreposição pontual de cor através da prop color", async () => {
    const customColor = "#ff0077";

    const { unmount } = render(
      <HelmetProvider>
        <AndroidStatusBar color={customColor} />
      </HelmetProvider>,
    );

    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    expect(metaThemeColor?.getAttribute("content")).toBe(customColor);

    unmount();
  });
});
