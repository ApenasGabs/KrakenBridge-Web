import type { AuthStatus, SessionUsage } from '../../types';
import ThemeSelector from '../ThemeSelector/ThemeSelector';
import { 
  Bot, 
  Code2, 
  Menu, 
  SlidersHorizontal, 
  Coins, 
  KeyRound, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react';

interface HeaderProps {
  activeTab: 'chat' | 'ide';
  onTabChange: (tab: 'chat' | 'ide') => void;
  onToggleSidebar: () => void;
  isOptionsOpen: boolean;
  onToggleOptions: () => void;
  authStatus: AuthStatus | null;
  onOpenAuth: () => void;
  sessionUsage: SessionUsage;
  currentModel: string;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  onTabChange,
  onToggleSidebar,
  isOptionsOpen,
  onToggleOptions,
  authStatus,
  onOpenAuth,
  sessionUsage,
  currentModel
}) => {
  const isAuthOk = authStatus?.authenticated || authStatus?.isKeyValid;

  return (
    <header className="navbar bg-base-100 border-b border-base-300 px-4 min-h-14 gap-2 z-20">
      {/* Lado Esquerdo: Toggle Sidebar + Marca */}
      <div className="flex-1 flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="btn btn-ghost btn-sm btn-square lg:hidden"
          title="Alternar histórico"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary text-primary-content flex items-center justify-center font-bold text-base shadow-sm">
            K
          </div>
          <div className="hidden sm:block">
            <h1 className="text-base font-bold tracking-tight text-base-content leading-none">
              KrakenBridge
            </h1>
            <span className="text-[10px] text-base-content/50 font-medium">
              Multi-Agent Studio
            </span>
          </div>
        </div>

        {/* Tabs Centrais: Chat vs IDE */}
        <div className="tabs tabs-boxed bg-base-200/80 p-0.5 ml-2 sm:ml-4">
          <button
            onClick={() => onTabChange('chat')}
            className={`tab tab-sm gap-1.5 transition-all ${
              activeTab === 'chat' 
                ? 'tab-active !bg-primary !text-primary-content font-medium shadow-sm' 
                : 'text-base-content/70'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>Chat Agente</span>
          </button>
          <button
            onClick={() => onTabChange('ide')}
            className={`tab tab-sm gap-1.5 transition-all ${
              activeTab === 'ide' 
                ? 'tab-active !bg-primary !text-primary-content font-medium shadow-sm' 
                : 'text-base-content/70'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>IDE (VS Code)</span>
          </button>
        </div>
      </div>

      {/* Lado Direito: Quota / Tokens + Opções + Auth + Temas */}
      <div className="flex items-center gap-2">
        {/* Painel de Tokens / Quota */}
        <div 
          className="hidden md:flex items-center gap-2 px-2.5 py-1 rounded-md bg-base-200 border border-base-300 text-xs"
          title="Consumo de tokens na sessão ativa"
        >
          <Coins className="w-3.5 h-3.5 text-warning" />
          <span className="font-mono font-medium">
            {sessionUsage.sessionTotalTokens.toLocaleString()} tokens
          </span>
          <span className="text-base-content/40">|</span>
          <span className="text-[11px] text-base-content/60 truncate max-w-[100px] font-mono">
            {currentModel}
          </span>
        </div>

        {/* Botão de Opções do CLI */}
        <button
          onClick={onToggleOptions}
          className={`btn btn-sm btn-ghost gap-1 text-xs ${
            isOptionsOpen ? 'bg-base-200 text-primary' : 'text-base-content/70'
          }`}
          title="Parâmetros avançados do CLI"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Opções</span>
        </button>

        {/* Botão de Autenticação */}
        <button
          onClick={onOpenAuth}
          className={`btn btn-sm gap-1.5 text-xs ${
            isAuthOk 
              ? 'btn-ghost text-success hover:bg-success/10' 
              : 'btn-outline btn-warning'
          }`}
          title="Gerenciar Autenticação Google / API Key"
        >
          <KeyRound className="w-3.5 h-3.5" />
          {isAuthOk ? (
            <span className="hidden sm:inline flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 inline text-success" />
              Autenticado
            </span>
          ) : (
            <span className="hidden sm:inline flex items-center gap-1">
              <AlertCircle className="w-3 h-3 inline text-warning" />
              Conectar Conta
            </span>
          )}
        </button>

        {/* Seletor de Tema do DaisyUI */}
        <div className="border-l border-base-300 pl-1">
          <ThemeSelector />
        </div>
      </div>
    </header>
  );
};
