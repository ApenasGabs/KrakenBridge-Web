import type { KeyboardEvent } from "react";
import { useCallback, useEffect, useState } from "react";
import { Palette, X } from "lucide-react";

const DEFAULT_THEME = "light";

interface ThemeSelectorProps {
  drawerId?: string;
  compact?: boolean;
  className?: string;
}

const ThemeSelector: React.FC<ThemeSelectorProps> = ({
  drawerId = "theme-drawer",
  compact = false,
  className = ""
}) => {
  const [currentTheme, setCurrentTheme] = useState<string>(() => {
    if (typeof window === "undefined") return DEFAULT_THEME;
    return localStorage.getItem("theme") || DEFAULT_THEME;
  });

  const applyTheme = (theme: string) => {
    // daisyUI aceita tanto data-theme quanto class na raiz
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.className = theme;
    document.body.setAttribute("data-theme", theme);
    document.body.className = theme;
    localStorage.setItem("theme", theme);
  };

  const toggleDrawer = useCallback((): void => {
    const drawerToggle = document.getElementById(
      drawerId,
    ) as HTMLInputElement | null;

    if (!drawerToggle) return;

    drawerToggle.checked = !drawerToggle.checked;
    drawerToggle.dispatchEvent(new Event("change", { bubbles: true }));
  }, [drawerId]);

  useEffect(() => {
    applyTheme(currentTheme);
  }, [currentTheme]);

  const ThemeList = [
    "light",
    "dark",
    "cupcake",
    "bumblebee",
    "emerald",
    "corporate",
    "synthwave",
    "retro",
    "cyberpunk",
    "valentine",
    "halloween",
    "garden",
    "forest",
    "aqua",
    "lofi",
    "pastel",
    "fantasy",
    "wireframe",
    "black",
    "luxury",
    "dracula",
    "cmyk",
    "autumn",
    "business",
    "acid",
    "lemonade",
    "night",
    "coffee",
    "winter",
    "dim",
    "nord",
    "sunset",
    "purplewind",
  ];

  const ThemeOptions = ThemeList.map((theme) => (
    <li key={theme}>
      <input
        type="radio"
        name="theme-dropdown"
        className="theme-controller btn btn-sm btn-block btn-ghost justify-start"
        aria-label={theme.charAt(0).toUpperCase() + theme.slice(1)}
        value={theme}
        checked={currentTheme === theme}
        onChange={() => setCurrentTheme(theme)}
        data-testid={`theme-option-${theme}`}
      />
    </li>
  ));

  return (
    <div className={className} data-testid="theme-selector">
      <div className="drawer drawer-end">
        <input
          id={drawerId}
          type="checkbox"
          className="drawer-toggle"
          data-testid="theme-drawer-toggle"
          tabIndex={-1}
        />
        <div className="drawer-content">
          <label
            htmlFor={drawerId}
            className={`btn btn-ghost btn-sm gap-1.5 ${compact ? 'px-2 text-xs' : 'px-2.5 text-xs sm:text-sm'}`}
            role="button"
            aria-label="Temas"
            data-testid="theme-button"
            tabIndex={0}
            onKeyDown={(event: KeyboardEvent<HTMLLabelElement>) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                toggleDrawer();
              }
            }}
          >
            <Palette className="w-4 h-4 text-base-content/70 shrink-0" />
            <span className={compact ? "sr-only sm:not-sr-only sm:inline" : ""}>Temas</span>
          </label>
        </div>
        <div className="drawer-side z-50">
          <label
            htmlFor={drawerId}
            className="drawer-overlay"
            data-testid="theme-drawer-overlay"
          ></label>
          <div className="menu bg-base-200 text-base-content min-h-full w-80 max-w-[85vw] p-4 pt-6 flex flex-col shadow-2xl">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-base-300">
              <div className="flex items-center gap-2">
                <Palette className="w-4 h-4 text-primary" />
                <span className="font-semibold text-sm">Temas da Interface</span>
              </div>
              <label
                htmlFor={drawerId}
                className="btn btn-ghost btn-xs btn-square cursor-pointer"
                aria-label="Fechar temas"
              >
                <X className="w-4 h-4" />
              </label>
            </div>
            <ul className="space-y-1 flex-1 overflow-y-auto" data-testid="theme-menu">
              {ThemeOptions}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThemeSelector;
