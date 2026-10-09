// Gerenciamento de Estado Centralizado Reativo
class StateStore {
  constructor() {
    this.listeners = new Set();
    this.state = {
      viewMode: 'agent', // 'agent' | 'ide'
      currentAgent: localStorage.getItem('kraken_agent') || 'antigravity',
      currentModel: localStorage.getItem('kraken_model') || 'gemini-3.8-flash-high',
      currentEffort: localStorage.getItem('kraken_effort') || 'high',
      currentMode: localStorage.getItem('kraken_mode') || 'default',
      currentSubproject: localStorage.getItem('kraken_subproject') || '',
      skipPermissions: localStorage.getItem('kraken_skip_perm') !== 'false',
      sandbox: localStorage.getItem('kraken_sandbox') === 'true',
      disableSlashCommands: localStorage.getItem('kraken_disable_slash') === 'true',
      
      activeConversationId: localStorage.getItem('kraken_active_conv') || null,
      conversations: [],
      models: { antigravity: [], claude: [], aider: [] },
      projects: [],
      config: null,
      authStatus: { antigravity: { authenticated: false }, claude: { hasKey: false }, aider: { hasKey: false } },
      
      isGenerating: false,
      sidebarOpen: localStorage.getItem('kraken_sidebar') !== 'false',
      optionsOpen: false
    };
  }

  get(key) {
    return this.state[key];
  }

  set(key, value) {
    this.state[key] = value;
    // Persistir preferências básicas
    if (typeof value === 'string' || typeof value === 'boolean') {
      const storageMap = {
        currentAgent: 'kraken_agent',
        currentModel: 'kraken_model',
        currentEffort: 'kraken_effort',
        currentMode: 'kraken_mode',
        currentSubproject: 'kraken_subproject',
        activeConversationId: 'kraken_active_conv',
        skipPermissions: 'kraken_skip_perm',
        sandbox: 'kraken_sandbox',
        disableSlashCommands: 'kraken_disable_slash',
        sidebarOpen: 'kraken_sidebar'
      };
      if (storageMap[key]) {
        localStorage.setItem(storageMap[key], String(value));
      }
    }
    this.notify(key, value);
  }

  update(updates) {
    for (const [key, value] of Object.entries(updates)) {
      this.set(key, value);
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(key, value) {
    for (const listener of this.listeners) {
      try {
        listener(key, value, this.state);
      } catch (err) {
        console.error('[State] Erro no listener:', err);
      }
    }
  }
}

export const state = new StateStore();
