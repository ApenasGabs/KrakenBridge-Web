# 🌌 Antigravity Studio for ZimaOS & Docker

<div align="center">

![Antigravity Studio Banner](https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/google-gemini.png)

### Plataforma Unificada de Desenvolvimento Autônomo com IA na Web
**Google Antigravity (`agy`) + Logs de Terminal em Tempo Real + VS Code Web Integrado**

[![ZimaOS Compatible](https://img.shields.io/badge/ZimaOS-App%20Compatible-blue?style=for-the-badge&logo=linux)](https://www.zimaspace.com/zimaos)
[![CasaOS Compatible](https://img.shields.io/badge/CasaOS-App%20Compatible-orange?style=for-the-badge&logo=docker)](https://casaos.io/)
[![Docker](https://img.shields.io/badge/Docker-Compose%20v2-2496ED?style=for-the-badge&logo=docker)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

</div>

---

## 💡 O que é o Antigravity Studio?

O **Antigravity Studio** transforma o poder do **Google Antigravity** em um ambiente web completo, ideal para **Homelabs, ZimaOS, CasaOS, VPS ou servidores locais**.

Diferente de interfaces de chat genéricas que escondem o que a IA está fazendo no servidor, o Antigravity Studio foi projetado por e para desenvolvedores:
1. **🤖 Modo Agente com Logs Reais de Terminal:** Acompanhe a execução do agente em tempo real com streaming SSE, contadores de *thinking tokens* e **cartões interativos de terminal** mostrando cada comando executado e sua saída (`stdout`/`stderr`) real.
2. **💻 Modo IDE Embutido:** O **VS Code Web oficial (`code-server`)** roda diretamente na aplicação. Com apenas um clique no botão **[IDE]**, o editor carrega instantaneamente, permitindo inspecionar arquivos gerados, debugar e analisar *git diffs* sem sair do navegador.
3. **🔄 Sincronização em Tempo Real:** Agente e IDE compartilham o mesmo volume (`/workspace`). Se a IA cria ou modifica um arquivo, ele já está aberto na sua árvore do VS Code no mesmo segundo.

---

## 🏗️ Arquitetura

```mermaid
flowchart TD
    subgraph Dispositivos["Dispositivos (Celular / Tablet / Desktop)"]
        Browser["Navegador Web (Rede Local ou Tailscale)"]
    end

    subgraph Servidor["Servidor ZimaOS / CasaOS / Linux"]
        subgraph Port8088["Antigravity Web Studio (Porta 8088)"]
            UI["Interface Web (Tema Gemini Dark #131314)"]
            API["Backend Node.js Express (SSE Stream)"]
            Agy["Antigravity CLI (agy)"]
        end

        subgraph Port8089["VS Code Web (Porta 8089)"]
            CodeServer["code-server (LinuxServer.io)"]
            Ext["Extensão Oficial Google Antigravity"]
        end

        Workspace["Volume Compartilhado (/workspace)"]
    end

    Browser -->|HTTP :8088| UI
    UI -->|POST /api/chat| API
    API -->|spawn --dangerously-skip-permissions| Agy
    Agy -->|Lê e Modifica Código| Workspace
    
    UI -.->|Aba [IDE] Iframe :8089| CodeServer
    CodeServer -->|Visualização de Diffs e Edição| Workspace
```

---

## 🚀 Instalação Rápida no ZimaOS / CasaOS (1 Clique)

O arquivo `docker-compose.yml` deste repositório já inclui as extensões oficiais **`x-casaos`**, permitindo instalação direta na interface do ZimaOS.

### Passo a Passo:
1. Acesse o painel do seu **ZimaOS** (`http://zimaos.local` ou IP do servidor).
2. Clique no ícone **"+"** (Instalar App) no canto superior da App Store.
3. Selecione **"Custom Install"** (Instalação Personalizada).
4. Clique no botão de importar no canto superior direito (**Import Compose**).
5. Cole o conteúdo de [`docker-compose.yml`](docker-compose.yml) deste repositório.
6. Ajuste os caminhos dos volumes se desejar:
   * **Workspace:** Altere para a pasta dos seus projetos no ZimaOS (ex: `/DATA/Projetos`).
   * **Web Port:** `8088` (Interface do Studio).
   * **IDE Port:** `8089` (VS Code Web).
7. Clique em **Install**.

Pronto! Os ícones oficiais do **Antigravity Studio** e do **VS Code** aparecerão na sua tela inicial do ZimaOS.

---

## 🐳 Instalação Manual com Docker Compose (Qualquer Linux / VPS)

Se você estiver em um servidor Ubuntu, Debian ou VPS tradicional:

```bash
# 1. Clone o repositório
git clone https://github.com/SEU-USUARIO/zimaos-antigravity-studio.git
cd zimaos-antigravity-studio

# 2. Configure as variáveis de ambiente
cp .env.example .env
nano .env

# 3. Execute o setup automático de permissões e pastas
chmod +x scripts/*.sh entrypoint.sh
./scripts/setup.sh

# 4. Inicie os contêineres
docker compose up -d
```

Acesse no seu navegador:
* **Antigravity Studio (Agente & IDE):** `http://IP-DO-SERVIDOR:8088`
* **VS Code Web direto:** `http://IP-DO-SERVIDOR:8089/?folder=/workspace`

---

## ⚙️ Variáveis de Ambiente (`.env`)

| Variável | Padrão | Descrição |
|:---|:---|:---|
| `WORKSPACE_PATH` | `/DATA/Projetos` | Caminho no host onde ficam seus repositórios de código. |
| `CODE_SERVER_CONFIG` | `/DATA/AppData/code-server-config` | Pasta onde as configurações e extensões do VS Code ficam salvas. |
| `ANTIGRAVITY_CLI_CONFIG` | `/DATA/AppData/antigravity/config` | Configuração persistente e credenciais do Antigravity CLI. |
| `WEB_PORT` | `8088` | Porta da interface web do Antigravity Studio. |
| `IDE_PORT` | `8089` | Porta do VS Code Web (`code-server`). |
| `PUID` | `1000` | ID do usuário no host (garante que arquivos criados não fiquem bloqueados como root). |
| `PGID` | `1000` | ID do grupo no host. |
| `IDE_PASSWORD` | *(vazio)* | Senha de login no VS Code. Deixe vazio para dispensar senha na rede local. |
| `GEMINI_API_KEY` | *(opcional)* | Chave de API Google Gemini (caso utilize autenticação direta por chave). |

---

## 🧩 Instalando a Extensão Antigravity no VS Code Web

Para que a barra lateral do VS Code Web também tenha o assistente do Google Antigravity ativo:

1. Baixe ou copie o arquivo `.vsix` da extensão (`google.google-antigravity-1.6.0.vsix`) para o servidor.
2. Execute o script auxiliar:
   ```bash
   ./scripts/install-extension.sh code-server /caminho/para/google-antigravity.vsix
   ```
3. O script injetará a extensão e reiniciará o contêiner automaticamente.

---

## 🛠️ Resolução de Problemas Comuns (*Gotchas*)

### 1. "Meus repositórios em subpastas não aparecem no painel de Git do VS Code"
* **Motivo:** O VS Code por padrão escaneia repositórios apenas com profundidade 1 (`git.repositoryScanMaxDepth: 1`). Se seus projetos ficam agrupados em categorias como `/workspace/empresa/app`, o Git não os detecta automaticamente.
* **Solução:** Este repositório já inclui um template pronto em `config/vscode-settings.json`. O script `./scripts/setup.sh` copia este arquivo para `/workspace/.vscode/settings.json`, definindo `"git.repositoryScanMaxDepth": 5`.
* **Dica Adicional:** Crie symlinks na raiz do workspace para acesso rápido:
  ```bash
  cd /DATA/Projetos
  ln -s empresa/app app
  ```

### 2. Erro de `dubious ownership` do Git
* **Motivo:** Ocorre quando o contêiner executa comandos em uma pasta pertencente a outro usuário ou grupo do host.
* **Solução:** Execute no host do servidor e os contêineres já têm configurado por padrão:
  ```bash
  git config --global --add safe.directory "*"
  ```

### 3. Agente travando esperando confirmação de comando
* **Solução:** O backend executa o Antigravity com a flag `--dangerously-skip-permissions`, garantindo autonomia total para o agente criar arquivos, rodar migrações e executar testes sem bloquear a requisição HTTP.

---

## 📱 Acesso Remoto via Tailscale

Se você utiliza o **Tailscale** no seu ZimaOS ou servidor:
* A aplicação funcionará perfeitamente em qualquer lugar pelo IP da Tailscale:
  * `http://100.x.y.z:8088`
* No celular, adicione à tela inicial para ter um **Progressive Web App (PWA)** com acesso ao seu servidor de desenvolvimento 24/7!

---

## 📄 Licença

Distribuído sob a licença **MIT**. Veja `LICENSE` para mais informações.
Desenvolvido com carinho para a comunidade Homelab, ZimaOS e desenvolvedores que amam produtividade com IA.
