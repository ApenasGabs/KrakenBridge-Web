// Cliente HTTP Unificado para a API do KrakenBridge
export const api = {
  async getConfig() {
    const res = await fetch('/api/config');
    return res.json();
  },

  async getProjects() {
    const res = await fetch('/api/config/projects');
    return res.json();
  },

  async getModels() {
    const res = await fetch('/api/config/models');
    return res.json();
  },

  async getAuthStatus() {
    const res = await fetch('/api/auth/status');
    return res.json();
  },

  async startAntigravityAuth() {
    const res = await fetch('/api/auth/antigravity/start', { method: 'POST' });
    return res.json();
  },

  async submitAntigravityCode(code) {
    const res = await fetch('/api/auth/antigravity/submit-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    return res.json();
  },

  async saveApiKeys(keys) {
    const res = await fetch('/api/auth/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(keys)
    });
    return res.json();
  },

  async getConversations() {
    const res = await fetch('/api/conversations');
    const data = await res.json();
    return data.conversations || [];
  },

  async getConversation(id) {
    const res = await fetch(`/api/conversations/${id}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.session;
  },

  async createConversation(data = {}) {
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  async renameConversation(id, title) {
    const res = await fetch(`/api/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    });
    return res.json();
  },

  async deleteConversation(id) {
    const res = await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
    return res.json();
  },

  async submitInlineAuth(reqId, code) {
    const res = await fetch('/api/chat/submit-auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reqId, code })
    });
    return res.json();
  },

  async stopChat() {
    const res = await fetch('/api/chat/stop', { method: 'POST' });
    return res.json();
  }
};
