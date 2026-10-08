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
  AlertCircle,
  Boxes
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
  onToggleQuota?: () => void;
  onOpenMcp?: () => void;
  mcpCount?: number;
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
  currentModel,
  onToggleQuota,
  onOpenMcp,
  mcpCount
}) => {
  const isAuthOk = authStatus?.authenticated || authStatus?.isKeyValid;

  return (
    <header className="navbar bg-base-100 border-b border-base-300 px-4 min-h-14 gap-2 z-20">
      {/* Lado Esquerdo: Toggle Sidebar + Marca */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onToggleSidebar}
          className="btn btn-ghost btn-sm btn-square"
          title="Alternar histórico"
        >
          <Menu className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary text-primary-content flex items-center justify-center font-bold text-sm shadow-sm">
            K
          </div>
          <div className="hidden md:block">
            <h1 className="text-sm font-bold tracking-tight text-base-content leading-none">
              KrakenBridge
            </h1>
            <span className="text-[10px] text-base-content/50 font-medium">
              Multi-Agent Studio
            </span>
          </div>
        </div>

        {/* Tabs Centrais: Chat vs IDE */}
        <div className="inline-flex items-center bg-base-200/80 rounded-lg p-0.5 ml-1 sm:ml-3 shrink-0">
          <button
            onClick={() => onTabChange('chat')}
            className={`px-2.5 py-1 text-xs rounded-md flex items-center gap-1.5 font-medium transition-all ${
              activeTab === 'chat' 
                ? 'bg-primary text-primary-content shadow-sm' 
                : 'text-base-content/70 hover:text-base-content'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Chat Agente</span>
            <span className="sm:hidden">Chat</span>
          </button>
          <button
            onClick={() => onTabChange('ide')}
            className={`px-2.5 py-1 text-xs rounded-md flex items-center gap-1.5 font-medium transition-all ${
              activeTab === 'ide' 
                ? 'bg-primary text-primary-content shadow-sm' 
                : 'text-base-content/70 hover:text-base-content'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">IDE (VS Code)</span>
            <span className="sm:hidden">IDE</span>
          </button>
        </div>
      </div>

      <div className="flex-1" />

      {/* Lado Direito: Quota / Tokens + Opções + Auth + Temas */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Painel de Tokens Desktop */}
        <div 
          onClick={onToggleQuota}
          className="hidden xl:flex items-center gap-2 px-2.5 py-1 rounded-md bg-base-200 hover:bg-base-300 border border-base-300 text-xs shrink-0 cursor-pointer transition-colors"
          title="Consumo de tokens na sessão ativa (Clique para abrir balão de cotas)"
        >
          <Coins className="w-3.5 h-3.5 text-warning" />
          <span className="font-mono font-medium">
            {sessionUsage.sessionTotalTokens.toLocaleString()} tokens
          </span>
          <span className="text-base-content/40">|</span>
          <span className="text-[11px] text-base-content/60 truncate max-w-[80px] font-mono">
            {currentModel}
          </span>
        </div>

        {/* Painel de Tokens Compacto */}
        <div 
          onClick={onToggleQuota}
          className="flex xl:hidden items-center gap-1 px-2 py-1 rounded-md bg-base-200 hover:bg-base-300 border border-base-300 text-xs shrink-0 cursor-pointer transition-colors"
          title="Consumo de tokens na sessão ativa (Clique para abrir balão de cotas)"
        >
          <Coins className="w-3.5 h-3.5 text-warning" />
          <span className="font-mono font-medium text-[11px]">
            {sessionUsage.sessionTotalTokens.toLocaleString()}
          </span>
        </div>

        {/* Botão de Servidores MCP */}
        <button
          onClick={onOpenMcp}
          className="btn btn-sm btn-ghost btn-square sm:btn-auto px-2 gap-1.5 text-xs text-base-content/70 hover:text-primary transition-colors"
          title="Visualizar servidores MCP (Model Context Protocol)"
        >
          <Boxes className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden lg:inline">MCPs</span>
          {mcpCount !== undefined && mcpCount > 0 && (
            <span className="badge badge-xs badge-primary font-mono">{mcpCount}</span>
          )}
        </button>

        {/* Botão de Opções do CLI */}
        <button
          onClick={onToggleOptions}
          className={`btn btn-sm btn-ghost btn-square sm:btn-auto px-2 gap-1 text-xs ${
            isOptionsOpen ? 'bg-base-200 text-primary' : 'text-base-content/70'
          }`}
          title="Parâmetros avançados do CLI"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">Opções</span>
        </button>

        {/* Botão de Autenticação */}
        <button
          onClick={onOpenAuth}
          className={`btn btn-sm btn-square sm:btn-auto px-2 gap-1.5 text-xs ${
            isAuthOk 
              ? 'btn-ghost text-success hover:bg-success/10' 
              : 'btn-outline btn-warning'
          }`}
          title="Gerenciar Autenticação Google / API Key"
        >
          <KeyRound className="w-3.5 h-3.5" />
          {isAuthOk ? (
            <span className="hidden lg:inline flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 inline text-success" />
              Autenticado
            </span>
          ) : (
            <span className="hidden lg:inline flex items-center gap-1">
              <AlertCircle className="w-3 h-3 inline text-warning" />
              Conectar
            </span>
          )}
        </button>

        {/* Seletor de Tema do DaisyUI */}
        <div className="border-l border-base-300 pl-1 shrink-0">
          <ThemeSelector />
        </div>
      </div>
    </header>
  );
};
