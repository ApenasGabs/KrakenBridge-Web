import { useState } from 'react';
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
  Boxes,
  Network,
  MoreVertical
} from 'lucide-react';

interface HeaderProps {
  activeTab: 'hub' | 'chat' | 'ide';
  onTabChange: (tab: 'hub' | 'chat' | 'ide') => void;
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <header className="navbar bg-base-100 border-b border-base-300 px-2 sm:px-4 min-h-14 gap-1.5 sm:gap-2 z-20">
      {/* Lado Esquerdo: Toggle Sidebar + Marca */}
      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
        <button
          onClick={onToggleSidebar}
          className="btn btn-ghost btn-sm btn-square"
          title="Alternar histórico"
        >
          <Menu className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-1.5">
          <div className="w-7 h-7 rounded-lg bg-primary text-primary-content flex items-center justify-center font-bold text-xs sm:text-sm shadow-sm">
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

        {/* Tabs Centrais: Malha vs Chat vs IDE */}
        <div className="inline-flex items-center bg-base-200/80 rounded-lg p-0.5 ml-0.5 sm:ml-2 shrink-0">
          <button
            onClick={() => onTabChange('hub')}
            className={`px-2 sm:px-2.5 py-1 text-xs rounded-md flex items-center gap-1 sm:gap-1.5 font-medium transition-all ${
              activeTab === 'hub' 
                ? 'bg-primary text-primary-content shadow-sm' 
                : 'text-base-content/70 hover:text-base-content'
            }`}
            title="Visão em Malha de Agentes e Projetos"
          >
            <Network className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Malha</span>
            <span className="sm:hidden">Hub</span>
          </button>

          <button
            onClick={() => onTabChange('chat')}
            className={`px-2 sm:px-2.5 py-1 text-xs rounded-md flex items-center gap-1 sm:gap-1.5 font-medium transition-all ${
              activeTab === 'chat' 
                ? 'bg-primary text-primary-content shadow-sm' 
                : 'text-base-content/70 hover:text-base-content'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>Chat</span>
          </button>

          <button
            onClick={() => onTabChange('ide')}
            className={`px-2 sm:px-2.5 py-1 text-xs rounded-md flex items-center gap-1 sm:gap-1.5 font-medium transition-all ${
              activeTab === 'ide' 
                ? 'bg-primary text-primary-content shadow-sm' 
                : 'text-base-content/70 hover:text-base-content'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">IDE</span>
            <span className="sm:hidden">IDE</span>
          </button>
        </div>
      </div>

      <div className="flex-1" />

      {/* Lado Direito Desktop: Tokens + MCPs + Opções + Auth + Temas */}
      <div className="hidden md:flex items-center gap-1.5 shrink-0">
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

        {/* Botão de Autenticação / Contas */}
        <button
          onClick={onOpenAuth}
          className={`btn btn-sm btn-square sm:btn-auto px-2 gap-1.5 text-xs max-w-[180px] ${
            isAuthOk 
              ? 'btn-ghost text-success hover:bg-success/10' 
              : 'btn-outline btn-warning'
          }`}
          title="Gerenciar Contas Conectadas e Autenticação Google"
        >
          {authStatus?.picture ? (
            <img src={authStatus.picture} alt="" className="w-4 h-4 rounded-full inline shrink-0" />
          ) : (
            <KeyRound className="w-3.5 h-3.5 shrink-0" />
          )}
          {isAuthOk ? (
            <span className="hidden lg:inline flex items-center gap-1 truncate font-mono text-[11px]">
              <CheckCircle2 className="w-3 h-3 inline text-success shrink-0" />
              <span className="truncate">{authStatus?.email ? authStatus.email.split('@')[0] : 'Conectado'}</span>
            </span>
          ) : (
            <span className="hidden lg:inline flex items-center gap-1">
              <AlertCircle className="w-3 h-3 inline text-warning shrink-0" />
              Conectar
            </span>
          )}
        </button>

        {/* Seletor de Tema */}
        <div className="border-l border-base-300 pl-1 shrink-0">
          <ThemeSelector />
        </div>
      </div>

      {/* Lado Direito Mobile: Tokens + Menu Dropdown [...] + Tema */}
      <div className="flex md:hidden items-center gap-1 shrink-0">
        {/* Tokens Compacto */}
        <button 
          onClick={onToggleQuota}
          className="btn btn-ghost btn-xs px-1.5 gap-1 font-mono text-[11px]"
          title="Ver cotas"
        >
          <Coins className="w-3.5 h-3.5 text-warning" />
          <span>{sessionUsage.sessionTotalTokens > 999 ? `${Math.round(sessionUsage.sessionTotalTokens / 1000)}k` : sessionUsage.sessionTotalTokens}</span>
        </button>

        {/* Seletor de Tema compacto */}
        <ThemeSelector />

        {/* Menu Suspenso de Mais Opções para Mobile */}
        <div className="dropdown dropdown-end">
          <button 
            tabIndex={0} 
            className="btn btn-ghost btn-sm btn-square"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          <ul 
            tabIndex={0} 
            className="dropdown-content menu z-50 p-2 shadow-2xl bg-base-100/98 backdrop-blur-md rounded-2xl w-52 border border-base-300 text-xs space-y-1 mt-2"
          >
            <li>
              <button onClick={() => { onOpenMcp?.(); setIsMobileMenuOpen(false); }} className="flex items-center justify-between py-2">
                <span className="flex items-center gap-2">
                  <Boxes className="w-4 h-4 text-emerald-400" />
                  Servidores MCP
                </span>
                {mcpCount !== undefined && mcpCount > 0 && (
                  <span className="badge badge-xs badge-primary font-mono">{mcpCount}</span>
                )}
              </button>
            </li>
            <li>
              <button onClick={() => { onToggleOptions(); setIsMobileMenuOpen(false); }} className="flex items-center gap-2 py-2">
                <SlidersHorizontal className="w-4 h-4 text-primary" />
                Parâmetros do Agente
              </button>
            </li>
            <li>
              <button onClick={() => { onOpenAuth(); setIsMobileMenuOpen(false); }} className="flex items-center justify-between py-2">
                <span className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-warning" />
                  Autenticação
                </span>
                {isAuthOk ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-warning" />
                )}
              </button>
            </li>
            <li>
              <button onClick={() => { onToggleQuota?.(); setIsMobileMenuOpen(false); }} className="flex items-center gap-2 py-2">
                <Coins className="w-4 h-4 text-warning" />
                Painel de Cotas
              </button>
            </li>
          </ul>
        </div>
      </div>
    </header>
  );
};
