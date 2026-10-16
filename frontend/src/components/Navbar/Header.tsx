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
  Activity,
  MoreVertical,
  Palette,
  Compass,
  Database
} from 'lucide-react';

interface HeaderProps {
  activeTab: 'status' | 'whatsnext' | 'chat' | 'ide' | 'memory';
  onTabChange: (tab: 'status' | 'whatsnext' | 'chat' | 'ide' | 'memory') => void;
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

        {/* Tabs Centrais: Status vs What's Next vs Chat vs IDE */}
        <div className="inline-flex items-center bg-base-200/80 rounded-lg p-0.5 ml-0.5 sm:ml-2 shrink-0">
          <button
            data-testid="tab-status"
            onClick={() => onTabChange('status')}
            className={`px-1.5 sm:px-2.5 py-1 text-xs rounded-md flex items-center gap-1 sm:gap-1.5 font-medium transition-all ${
              activeTab === 'status' 
                ? 'bg-primary text-primary-content shadow-sm' 
                : 'text-base-content/70 hover:text-base-content'
            }`}
            title="Status Operacional, Métricas de IA e Malha de Agentes"
          >
            <Activity className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden min-[400px]:inline sm:inline">Status</span>
          </button>

          <button
            data-testid="tab-whatsnext"
            onClick={() => onTabChange('whatsnext')}
            className={`px-1.5 sm:px-2.5 py-1 text-xs rounded-md flex items-center gap-1 sm:gap-1.5 font-medium transition-all ${
              activeTab === 'whatsnext' 
                ? 'bg-primary text-primary-content shadow-sm' 
                : 'text-base-content/70 hover:text-base-content'
            }`}
            title="What's Next (Backlog de Issues) e Central de Revisão de PRs"
          >
            <Compass className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden min-[480px]:inline sm:inline">What's Next</span>
          </button>

          <button
            data-testid="tab-chat"
            onClick={() => onTabChange('chat')}
            className={`px-1.5 sm:px-2.5 py-1 text-xs rounded-md flex items-center gap-1 sm:gap-1.5 font-medium transition-all ${
              activeTab === 'chat' 
                ? 'bg-primary text-primary-content shadow-sm' 
                : 'text-base-content/70 hover:text-base-content'
            }`}
          >
            <Bot className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden min-[400px]:inline sm:inline">Chat</span>
          </button>

          <button
            data-testid="tab-ide"
            onClick={() => onTabChange('ide')}
            className={`px-1.5 sm:px-2.5 py-1 text-xs rounded-md flex items-center gap-1 sm:gap-1.5 font-medium transition-all ${
              activeTab === 'ide' 
                ? 'bg-primary text-primary-content shadow-sm' 
                : 'text-base-content/70 hover:text-base-content'
            }`}
          >
            <Code2 className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden min-[400px]:inline sm:inline">IDE</span>
          </button>

          <button
            data-testid="tab-memory"
            onClick={() => onTabChange('memory')}
            className={`px-1.5 sm:px-2.5 py-1 text-xs rounded-md flex items-center gap-1 sm:gap-1.5 font-medium transition-all ${
              activeTab === 'memory' 
                ? 'bg-primary text-primary-content shadow-sm' 
                : 'text-base-content/70 hover:text-base-content'
            }`}
            title="Memória de Longo Prazo, Wiki em Git e Handoffs (ai-memory)"
          >
            <Database className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden min-[400px]:inline sm:inline">Memória</span>
          </button>
        </div>
      </div>

      <div className="flex-1" />

      {/* Lado Direito Desktop: Tokens + MCPs + Opções + Auth + Temas */}
      <div className="hidden md:flex items-center gap-1.5 shrink-0">
        {/* Painel de Tokens Desktop */}
        <div 
          data-testid="header-quota-btn"
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
          data-testid="header-mcp-btn"
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
          data-testid="header-options-btn"
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
          data-testid="header-auth-btn"
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

        {/* Seletor de Tema Desktop */}
        <div className="border-l border-base-300 pl-1 shrink-0">
          <ThemeSelector drawerId="theme-drawer" />
        </div>
      </div>

      {/* Lado Direito Mobile: Tokens + Tema + Auth + Menu Dropdown [...] */}
      <div className="flex md:hidden items-center gap-1 shrink-0">
        {/* Tokens Compacto */}
        <button 
          onClick={onToggleQuota}
          className="btn btn-ghost btn-xs px-1.5 h-8 gap-1 font-mono text-[11px] rounded-lg"
          title="Ver cotas e telemetria de tokens"
        >
          <Coins className="w-3.5 h-3.5 text-warning shrink-0" />
          <span>{sessionUsage.sessionTotalTokens > 999 ? `${Math.round(sessionUsage.sessionTotalTokens / 1000)}k` : sessionUsage.sessionTotalTokens}</span>
        </button>

        {/* Seletor de Tema compacto no Mobile */}
        <ThemeSelector drawerId="theme-drawer-mobile" compact />

        {/* Botão de Conta / Auth Direto no Mobile */}
        <button
          onClick={onOpenAuth}
          className={`btn btn-ghost btn-xs btn-square h-8 w-8 rounded-lg border transition-all ${
            isAuthOk 
              ? 'bg-success/10 border-success/30 text-success' 
              : 'border-warning/50 text-warning bg-warning/10'
          }`}
          title="Gerenciar Contas e Autenticação"
        >
          {authStatus?.picture ? (
            <img src={authStatus.picture} alt="" className="w-4 h-4 rounded-full shrink-0" />
          ) : (
            <KeyRound className="w-3.5 h-3.5 shrink-0" />
          )}
        </button>

        {/* Menu Suspenso de Mais Opções para Mobile */}
        <div className="dropdown dropdown-end">
          <div 
            tabIndex={0} 
            role="button"
            className="btn btn-ghost btn-xs btn-square h-8 w-8 rounded-lg flex items-center justify-center cursor-pointer"
            title="Mais opções"
          >
            <MoreVertical className="w-4 h-4" />
          </div>
          <ul 
            tabIndex={0} 
            className="dropdown-content menu z-50 p-2 shadow-2xl bg-base-100/98 backdrop-blur-md rounded-2xl w-56 border border-base-300 text-xs space-y-1 mt-2"
          >
            <li>
              <button 
                onClick={() => { onOpenAuth(); (document.activeElement as HTMLElement)?.blur(); }} 
                className="flex items-center justify-between py-2.5 font-medium text-primary"
              >
                <span className="flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-warning" />
                  Trocar de Conta / Auth
                </span>
                {isAuthOk ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-warning" />
                )}
              </button>
            </li>
            <li>
              <button 
                onClick={() => { onOpenMcp?.(); (document.activeElement as HTMLElement)?.blur(); }} 
                className="flex items-center justify-between py-2"
              >
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
              <button 
                onClick={() => { onToggleOptions(); (document.activeElement as HTMLElement)?.blur(); }} 
                className="flex items-center gap-2 py-2"
              >
                <SlidersHorizontal className="w-4 h-4 text-primary" />
                Parâmetros do Agente
              </button>
            </li>
            <li>
              <button 
                onClick={() => { onToggleQuota?.(); (document.activeElement as HTMLElement)?.blur(); }} 
                className="flex items-center gap-2 py-2"
              >
                <Coins className="w-3.5 h-3.5 text-warning" />
                Painel de Cotas
              </button>
            </li>
            <li>
              <label
                htmlFor="theme-drawer-mobile"
                onClick={() => (document.activeElement as HTMLElement)?.blur()}
                className="flex items-center gap-2 py-2 cursor-pointer"
              >
                <Palette className="w-4 h-4 text-secondary" />
                <span>Temas da Interface</span>
              </label>
            </li>
          </ul>
        </div>
      </div>
    </header>
  );
};
