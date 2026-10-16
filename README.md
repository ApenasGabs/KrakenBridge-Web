<div align="center">

# 🦑 KRAKENBRIDGE WEB
### 🌉 Multi-Agent Autonomous AI Bridge & Web IDE
**Google Antigravity • Claude Code • OpenAI Codex / Aider • VS Code Web**

[![ZimaOS Compatible](https://img.shields.io/badge/ZimaOS-App%20Compatible-00D2FF?style=for-the-badge&logo=linux)](https://www.zimaspace.com/zimaos)
[![CasaOS Compatible](https://img.shields.io/badge/CasaOS-App%20Compatible-FF7A00?style=for-the-badge&logo=docker)](https://casaos.io/)
[![Docker Compose](https://img.shields.io/badge/Docker-Compose%20v2-2496ED?style=for-the-badge&logo=docker)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

</div>

---

## 💡 O que é o KrakenBridge Web?

O **KrakenBridge Web** é a ponte definitiva que transforma os agentes de programação autônomos de terminal (**Google Antigravity**, **Claude Code**, **OpenAI Codex / Aider**) em uma plataforma de desenvolvimento web completa para **ZimaOS, CasaOS, Homelabs ou VPS**.

Assim como o mítico **Kraken**, a aplicação controla múltiplos motores e ferramentas através de tentáculos sincronizados:
1. **🤖 Modo Agente com Logs Reais de Terminal:** Acompanhe a execução do agente em tempo real via Server-Sent Events (SSE), contadores de *thinking tokens* e **cartões colapsáveis com os comandos de terminal executados e sua saída real (`stdout`/`stderr`)**.
2. **💻 Modo IDE Embutido:** O **VS Code oficial para navegador (`code-server`)** roda no mesmo ambiente. Alterne instantaneamente entre o chat e o editor com um clique na aba **[IDE]**.
3. **🧬 Auto-Evolução Contínua (Pod Drain):** O Kraken possui auto-consciência do seu próprio código em `/app`. Ele é capaz de aprimorar a si mesmo, recompilar seu frontend e reiniciar com o padrão **Pod Drain** (`/api/system/self-reload`), aguardando tarefas em execução sem interromper o fluxo de desenvolvimento.
4. **📊 Status Dashboard & Topology Mesh:** Monitoramento da malha de servidores domésticos (ZimaOS `gabisa`, `servidor` GPU, etc.) e medidores de quotas de tokens em tempo real estilo Orca.
5. **🐙 Suporte Multi-Motor & Multi-Contas:** Selecione o motor de IA ativo (**Google Antigravity**, **Claude Code**, **Codex / Aider**) e autentique rapidamente via **GitHub CLI Device Code Flow** ou PATs isolados por sessão.
6. **🔄 Workspace Unificado & Isolamento Seguro:** Separação estrita entre o código do próprio sistema (`/app`) e os projetos do usuário (`/workspace`), permitindo que a IA edite repositórios com segurança total.
7. **🗣️ Modo Leitura por Voz (Text-to-Speech Nativo):** Ouça a leitura falada das respostas geradas pelo assistente com um clique direto no balão do chat. Conta com sanitização inteligente de Markdown (omite blocos de código/diagramas da voz e limpa links), suporte a português (`pt-BR`) e controle ativo de reprodução/interrupção.

---

## 🏗️ Arquitetura

```mermaid
flowchart TD
    subgraph Dispositivos["📱 Dispositivos (Celular / Tablet / Desktop)"]
        Browser["Navegador Web (Rede Local ou Tailscale)"]
    end

    subgraph Servidor["🏠 Servidor ZimaOS / CasaOS / Homelab"]
        subgraph Port8088["KrakenBridge Web (Porta 8088)"]
            UI["Interface Web (React 19 + TypeScript + DaisyUI 5)"]
            API["Backend Express 4 (ESM + SSE Stream)"]
            SelfEngine["Motor de Auto-Evolução (Pod Drain Controller)"]
            StatusMesh["Status Mesh & Quota Monitor (Orca Metrics)"]
            subgraph Drivers["Tentáculos / Drivers de Execução"]
                DAgy["✨ Google Antigravity (agy)"]
                DClaude["🟣 Claude Code (claude)"]
                DAider["🟢 Codex / Aider (aider)"]
            end
            API --> SelfEngine
            API --> StatusMesh
            API --> Drivers
        end

        subgraph Port8089["VS Code Web (Porta 8089)"]
            CodeServer["code-server (LinuxServer.io)"]
            Ext["Extensões de IA & Git Integrado"]
        end

        subgraph Storage["💾 Armazenamento"]
            AppCode["/app (Código do Kraken)"]
            Workspace["/workspace (Repositórios do Usuário)"]
        end
    end

    Browser -->|HTTP :8088| UI
    UI -->|POST /api/chat| API
    SelfEngine -->|Modifica & Compila| AppCode
    Drivers -->|Executam Comandos & Editam Código| Workspace
    
    UI -.->|"Aba IDE (Iframe :8089)"| CodeServer
    CodeServer -->|Visualização de Diffs e Edição| Workspace
```

---

## 🧬 Ciclo de Auto-Evolução & Pod Drain

O Kraken possui auto-consciência operacional através do arquivo [`.kraken-identity.json`](.kraken-identity.json):
* **Separação de Domínios:**
  * O código-fonte do próprio Kraken reside em `/app` (frontend em `/app/frontend`).
  * Os projetos e aplicações do usuário ficam estritamente em `/workspace`.
* **Fluxo de Auto-Aprimoramento:**
  1. **Modificação:** O Kraken aplica ajustes em seu próprio backend ou na interface React.
  2. **Compilação:** Se o frontend foi alterado, compila os assets: `cd /app/frontend && npm run build`.
  3. **Versionamento Git:** Commita as alterações localmente e sincroniza com o repositório (`git pull --rebase origin main && git push origin main`).
  4. **Pod Drain:** Aciona o endpoint de reinício gracioso:
     ```bash
     curl -s -X POST http://localhost:8088/api/system/self-reload \
       -H "Content-Type: application/json" \
       -d '{"conversationId":"<ID>","taskDescription":"Resumo da melhoria"}'
     ```
     O servidor entra em estado de dreno, aguarda o término seguro de tarefas em andamento, reinicia o processo e reconecta a sessão de chat na nova versão!

---

## 🚀 Instalação com 1 Clique no ZimaOS / CasaOS

O [`docker-compose.yml`](docker-compose.yml) do KrakenBridge Web já conta com os metadados oficiais **`x-casaos`**:

1. Acesse o painel do seu **ZimaOS** (`http://zimaos.local` ou IP do servidor).
2. Na App Store, clique no botão **"+"** (Instalar App) no canto superior.
3. Escolha **"Custom Install"**.
4. Clique no ícone de importar no canto superior direito (**Import Compose**).
5. Cole o conteúdo de [`docker-compose.yml`](docker-compose.yml).
6. Ajuste os caminhos se necessário (ex: seu diretório de projetos em `/DATA/Projetos`).
7. Clique em **Install**.

O app **KrakenBridge Web** e o **VS Code** aparecerão na sua tela inicial!

---

## 🐳 Instalação Manual com Docker Compose (Ubuntu / Debian / VPS)

```bash
# 1. Clone o repositório
git clone https://github.com/SEU-USUARIO/krakenbridge-web.git
cd krakenbridge-web

# 2. Configure suas variáveis de ambiente
cp .env.example .env
nano .env

# 3. Execute o setup de permissões e pastas
chmod +x scripts/*.sh entrypoint.sh
./scripts/setup.sh

# 4. Inicie os serviços
docker compose up -d
```

Acessos:
* **KrakenBridge Web (Agente & IDE):** `http://IP-DO-SERVIDOR:8088`
* **VS Code Web direto:** `http://IP-DO-SERVIDOR:8089/?folder=/workspace`

---

## ⚙️ Variáveis de Ambiente (`.env`)

| Variável | Padrão | Descrição |
|:---|:---|:---|
| `WORKSPACE_PATH` | `/DATA/Projetos` | Caminho no host onde ficam seus repositórios de código. |
| `CODE_SERVER_CONFIG` | `/DATA/AppData/code-server-config` | Pasta onde as configurações e extensões do VS Code ficam salvas. |
| `KRAKEN_CONFIG_PATH` | `/DATA/AppData/krakenbridge/config` | Histórico e credenciais persistentes dos CLIs. |
| `WEB_PORT` | `8088` | Porta da interface web do KrakenBridge. |
| `IDE_PORT` | `8089` | Porta do VS Code Web (`code-server`). |
| `GEMINI_API_KEY` | *(opcional)* | Chave de API Google Gemini (para Antigravity). |
| `ANTHROPIC_API_KEY` | *(opcional)* | Chave de API Anthropic (para Claude Code). |
| `OPENAI_API_KEY` | *(opcional)* | Chave de API OpenAI (para Codex / Aider). |
| `PUID` / `PGID` | `1000` | UID e GID do seu usuário no host. |

---

## 🛠️ Resolução de Problemas Comuns (*Gotchas*)

### 1. Subpastas de Projetos não aparecem no Git do VS Code
* **Motivo:** O VS Code escaneia repositórios com profundidade 1 por padrão (`git.repositoryScanMaxDepth: 1`).
* **Solução:** O script `./scripts/setup.sh` copia automaticamente o arquivo `config/vscode-settings.json` para `/workspace/.vscode/settings.json`, definindo `"git.repositoryScanMaxDepth": 5`.

### 2. Erro de `dubious ownership` do Git
* O contêiner e o script de setup configuram globalmente:
  ```bash
  git config --global --add safe.directory "*"
  ```

---

## 📱 Acesso Remoto com Tailscale

Se você utiliza o **Tailscale** no seu servidor:
* Acesse de qualquer lugar do mundo pelo IP da sua tailnet:
  * `http://100.x.y.z:8088`
* No iPhone ou Android, use a opção **"Adicionar à Tela de Início"** no navegador para ter uma experiência de aplicativo nativo (PWA) conectado direto ao seu homelab!

---

## 📄 Licença

Distribuído sob a licença **MIT**. Veja [`LICENSE`](LICENSE) para mais informações.
Feito com 🦑 pela comunidade de desenvolvedores e entusiastas de Homelab.
