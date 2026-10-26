---
name: skill-scout
description: >-
  Caçador e auto-instalador de skills do ecossistema skills.sh (Vercel Labs / open-source).
  Use quando o usuário perguntar sobre o Skill Scout, pedir para buscar/instalar novas skills para
  tecnologias, bibliotecas, papéis (PO, Scrum, QA, DevOps) ou consultar o status de auto-aquisição de skills.
---

# Skill Scout - Auto-Aquisição e Auto-Configuração de Skills

O **Skill Scout** é o subsistema autônomo de auto-aquisição e auto-configuração de skills do Kraken e do Antigravity.

## 📌 Arquitetura Híbrida de Dois Estágios

O Skill Scout opera via hook `PreInvocation` antes de cada resposta do modelo primário, utilizando uma estratégia em duas etapas para garantir latência ultra-baixa e consumo zero de cota dos modelos pesados (como Claude Opus ou Gemini 4 Argon):

### 1. Estágio 1: Dicionário Léxico Rápido (0ms / 0 tokens)
- Analisa o prompt do usuário contra um vocabulário indexado de termos técnicos, bibliotecas e papéis metodológicos (ex: React, Drizzle, BullMQ, Tailwind, Product Owner, Scrum, QA).
- Se encontrar termos explícitos, resolve a busca imediatamente sem invocar nenhum modelo de linguagem.

### 2. Estágio 2: Roteador Semântico com Gemini Flash Low
- Acionado apenas quando o usuário se comunica por linguagem natural coloquial, comandos vagos ou transcrição de voz com ruídos/erros fonéticos (ex: *"pio"* = Product Owner, *"ixos"* = issues, *"esqui"* = skill, *"mergem"* = git merge).
- Executa o modelo ultraleve e econômico `gemini-3.8-flash-low` em um sandbox isolado (`/tmp/kraken-scout-home`) sem carregar servidores MCP pesados e com trava contra recursão (`SKILL_SCOUT_INTERNAL=1`).
- Mapeia a intenção semântica para 1 ou 2 termos de busca precisos para consulta no catálogo aberto.

### 3. Busca e Download Instantâneo no skills.sh (~1s)
- Consulta a API oficial do skills.sh (`https://skills.sh/api/search?q=<termo>&limit=10`) para selecionar runbooks com alto número de instalações e comunidade ativa.
- Baixa o `SKILL.md` diretamente via API do GitHub (sem necessidade de clonar repositórios inteiros) para:
  - Projeto ativo: `.agents/skills/<skill-id>/SKILL.md`
  - Cache global: `/root/.gemini/config/skills/<skill-id>/SKILL.md`

### 4. Injeção Just-In-Time (`ephemeralMessage`)
- Acopla o runbook especializado no mesmo turno da mensagem através de `injectSteps`, permitindo que o modelo principal atue como especialista desde o primeiro segundo, citando a skill acoplada.

## 🛠️ Comandos de Diagnóstico e Inspeção
- **Ver log de ativações e decisões do roteador em tempo real:**
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
