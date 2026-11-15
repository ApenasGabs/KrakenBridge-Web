import React from 'react';
import { Bot, Compass, Activity, Database } from 'lucide-react';

export type MobileEssentialTab = 'chat' | 'whatsnext' | 'status' | 'memory';

interface BottomNavProps {
  activeTab: 'status' | 'whatsnext' | 'chat' | 'ide' | 'memory' | 'office';
  onTabChange: (tab: MobileEssentialTab) => void;
}

interface NavItem {
  id: MobileEssentialTab;
  label: string;
  testId: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
}

const MOBILE_NAV_ITEMS: NavItem[] = [
  {
    id: 'chat',
    label: 'Chat',
    testId: 'tab-chat',
    title: 'Conversar com o Kraken',
    icon: Bot
  },
  {
    id: 'whatsnext',
    label: "What's Next",
    testId: 'tab-whatsnext',
    title: 'Backlog de Issues e Revisão de PRs',
    icon: Compass
  },
  {
    id: 'status',
    label: 'Status',
    testId: 'tab-status',
    title: 'Status Operacional e Paperclip',
    icon: Activity
  },
  {
    id: 'memory',
    label: 'Memória',
    testId: 'tab-memory',
    title: 'Base de Conhecimento (ai-memory)',
    icon: Database
  }
];

/**
 * Barra de navegação inferior fixa para viewports Mobile (< 768px)
 * com as 4 visões essenciais e alvos de toque >= 44x44px (WCAG/HIG).
 */
export const BottomNav: React.FC<BottomNavProps> = ({ activeTab, onTabChange }) => {
  return (
    <nav
      data-testid="bottom-nav"
      aria-label="Navegação principal mobile"
      className="md:hidden shrink-0 w-full bg-base-100/95 backdrop-blur-md border-t border-base-300 flex items-stretch justify-around px-1 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] z-30 shadow-[0_-2px_10px_rgba(0,0,0,0.06)]"
    >
      {MOBILE_NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            data-testid={item.testId}
            onClick={() => onTabChange(item.id)}
            aria-current={isActive ? 'page' : undefined}
            title={item.title}
            className={`relative flex-1 min-h-[48px] min-w-[44px] flex flex-col items-center justify-center gap-0.5 px-1 py-1 rounded-xl transition-all active:scale-95 ${
              isActive
                ? 'text-primary bg-primary/10 font-semibold'
                : 'text-base-content/65 hover:text-base-content hover:bg-base-200/60 font-medium'
            }`}
          >
            {isActive && (
              <span
                aria-hidden="true"
                className="absolute top-0.5 w-6 h-0.5 rounded-full bg-primary"
              />
            )}
            <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-primary' : ''}`} />
            <span className="text-[11px] leading-tight truncate max-w-full">
              {item.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};
