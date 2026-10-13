import { state } from './state.js';
import { api } from './api.js';
import { HeaderComponent } from './components/header.js';
import { SidebarComponent } from './components/sidebar.js';
import { OptionsBarComponent } from './components/optionsBar.js';
import { ChatViewComponent } from './components/chatView.js';
import { AuthModalComponent } from './components/authModal.js';

class App {
  constructor() {
    this.headerEl = document.getElementById('app-header');
    this.sidebarEl = document.getElementById('app-sidebar');
    this.optionsBarEl = document.getElementById('app-options-bar');
    this.chatViewEl = document.getElementById('view-chat');
    this.ideViewEl = document.getElementById('view-ide');
    this.ideFrameEl = document.getElementById('ide-frame');
    this.authModalEl = document.getElementById('modal-auth');

    this.ideUrl = `http://${window.location.hostname}:8089/?folder=/workspace`;

    this.initComponents();
    this.loadInitialData();
    this.setupViewModeWatcher();
  }

  initComponents() {
    this.authModal = new AuthModalComponent(this.authModalEl);

    this.header = new HeaderComponent(this.headerEl, {
      onOpenAuth: () => this.authModal.open(),
      onOpenIdeExternal: () => window.open(this.ideUrl, '_blank'),
      onNewSession: () => this.handleNewConversation()
    });

    this.sidebar = new SidebarComponent(
      this.sidebarEl,
      (convId) => this.handleSelectConversation(convId),
      () => this.handleNewConversation()
    );

    this.optionsBar = new OptionsBarComponent(this.optionsBarEl);

    this.chatView = new ChatViewComponent(
      this.chatViewEl,
      () => this.sidebar.loadConversations()
    );
  }

  async loadInitialData() {
    try {
      const [config, projects, models, auth] = await Promise.all([
        api.getConfig(),
        api.getProjects(),
        api.getModels(),
        api.getAuthStatus()
      ]);

      state.set('config', config);
      state.set('projects', projects.projects || []);
      state.set('models', models || {});
      state.set('authStatus', auth || {});

      if (config.codeServerPort) {
        this.ideUrl = `http://${window.location.hostname}:${config.codeServerPort}/?folder=/workspace`;
      }
    } catch (err) {
      console.warn('[App] Erro ao carregar dados iniciais:', err);
    }
  }

  setupViewModeWatcher() {
    state.subscribe((key, value) => {
      if (key === 'viewMode') {
        if (value === 'ide') {
          this.chatViewEl.classList.add('hidden');
          this.optionsBarEl.classList.add('hidden');
          this.ideViewEl.classList.remove('hidden');
          this.ideViewEl.classList.add('flex');

          if (this.ideFrameEl.src === 'about:blank' || !this.ideFrameEl.getAttribute('data-loaded')) {
            this.ideFrameEl.src = this.ideUrl;
            this.ideFrameEl.setAttribute('data-loaded', 'true');
          }
        } else {
          this.ideViewEl.classList.add('hidden');
          this.ideViewEl.classList.remove('flex');
          this.optionsBarEl.classList.remove('hidden');
          this.chatViewEl.classList.remove('hidden');
        }
      }
    });
  }

  handleSelectConversation(convId) {
    state.set('activeConversationId', convId);
    state.set('viewMode', 'agent');
  }

  handleNewConversation() {
    state.set('activeConversationId', null);
    state.set('viewMode', 'agent');
    this.chatView.loadActiveConversation();
  }
}

// Inicializar aplicativo no carregamento do DOM
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
