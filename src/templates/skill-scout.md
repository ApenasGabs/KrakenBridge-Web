---
name: skill-scout
description: >-
  Caçador e auto-instalador de skills do ecossistema skills.sh (Vercel Labs / open-source).
  Use quando o usuário perguntar sobre o Skill Scout, pedir para buscar/instalar novas skills para
  tecnologias, bibliotecas, papéis (PO, Scrum, QA, DevOps) ou consultar o status de auto-aquisição de skills.
---

# Skill Scout - Auto-Aquisição e Auto-Configuração de Skills

O **Skill Scout** é o subsistema autônomo de auto-aquisição e auto-configuração de skills do Kraken e do Antigravity.

## 📌 Arquitetura e Funcionamento
1. **Hook PreInvocation Silencioso:** Configurado em `/root/.gemini/config/hooks.json`, dispara a cada mensagem do usuário através do script `/root/.gemini/config/skill-scout.cjs`.
2. **Busca Semântica no skills.sh:** Consulta a API oficial Algolia (`https://skills.sh/api/search?q=<termo>&limit=10`) para identificar runbooks de alta relevância e comunidade ativa.
3. **Download Instantâneo (~1s):** Baixa o `SKILL.md` e dependências via API do GitHub (sem necessidade de clonar monorepos pesados) diretamente para:
   - Projeto ativo: `.agents/skills/<skill-id>/SKILL.md`
   - Cache global: `/root/.gemini/config/skills/<skill-id>/SKILL.md`
4. **Injeção Just-In-Time:** Acopla as instruções especializadas no mesmo turno da pergunta do usuário através do `injectSteps` (`ephemeralMessage`), permitindo responder com nível de especialista no primeiro segundo.

## 🛠️ Comandos de Diagnóstico e Inspeção
- **Ver log de ativações em tempo real:**
  ```bash
  cat /root/.gemini/config/skill-scout.log
  ```
- **Pesquisar skills no catálogo aberto:**
  ```bash
  skills find <termo>
  ```
- **Adicionar uma skill manualmente:**
  ```bash
  skills add <source>@<skill> -y
  ```
- **Listar skills instaladas no ambiente:**
  ```bash
  skills list
  ```
