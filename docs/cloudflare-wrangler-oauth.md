# Autenticação OAuth no Cloudflare Wrangler CLI

Este guia documenta a arquitetura, comandos e cenários de autenticação OAuth no Cloudflare Wrangler CLI no âmbito do KrakenBridge-Web e do Homelab.

---

## 1. Visão Geral: OAuth vs API Token

O Wrangler v3+ e v4+ adota o **OAuth 2.0** como método oficial e nativo de autenticação (`wrangler login`).

| Característica | OAuth 2.0 (`wrangler login`) | API Token Manual (`CLOUDFLARE_API_TOKEN`) |
| :--- | :--- | :--- |
| **Configuração** | Automática com 1 clique ou Device Code | Geração manual no dashboard Cloudflare |
| **Escopos** | Concedidos dinamicamente sob demanda | Configurados manualmente por token |
| **Renovação** | Automática via `refresh_token` | Token expira ou precisa ser recriado |
| **Armazenamento** | `default.toml` ou OS Keyring (`--use-keyring`) | Variável de ambiente ou `.env` |
| **Prioridade** | Usado quando `CLOUDFLARE_API_TOKEN` está ausente | Sobrescreve o OAuth se estiver definido no ambiente |

> **IMPORTANTE**: Se a variável de ambiente `CLOUDFLARE_API_TOKEN` estiver definida, o Wrangler priorizará o token em detrimento das credenciais OAuth. Para ativar o OAuth, a variável deve ser desativada (`unset CLOUDFLARE_API_TOKEN` ou via interface do KrakenBridge).

---

## 2. Cenários de Uso e Comandos

### Cenário A: Máquina Remota / SSH / Headless (Sem Navegador Local)
Em servidores remotos ou conexões SSH sem encaminhamento de portas, o fluxo de callback padrão falha porque a Cloudflare tenta redirecionar o navegador local para `http://localhost:8976/oauth/callback`, resultando no erro:
> *"This site can't be reached" (`ERR_CONNECTION_REFUSED`)*

**Solução:** Utilize o **OAuth 2.0 Device Authorization Grant (RFC 8628)**:

```bash
wrangler login --device
```

1. O Wrangler exibirá a URL de verificação e um código único:
   ```text
   To authorize Wrangler, please visit:
     https://dash.cloudflare.com/oauth2/device/verify
   and enter the code:
     ABCD-1234
   ```
2. Abra a URL em qualquer navegador (celular, desktop, laptop).
3. Insira o código e clique em **Aprovar**.
4. O Wrangler detecta a autorização via polling e salva as credenciais localmente com sucesso, sem precisar de servidor web local.

---

### Cenário B: Container Docker com Callback Local (Porta 8976)
Se o container Docker estiver rodando na máquina onde o desenvolvedor possui navegador:

1. **Mapeamento de Porta no Docker**:
   A porta `8976` é exposta e mapeada no `docker-compose.yml` e `Dockerfile`:
   ```yaml
   ports:
     - target: 8088
       published: "${WEB_PORT:-8088}"
       protocol: tcp
     - target: 8976
       published: "${WRANGLER_PORT:-8976}"
       protocol: tcp
   ```
2. **Execução no Container**:
   ```bash
   wrangler login --callback-port 8976 --callback-host 0.0.0.0
   ```
   Ou, alternativamente:
   ```bash
   wrangler login --device
   ```

---

### Cenário C: Armazenamento Seguro via OS Keyring (`--use-keyring`)
Por padrão, o Wrangler armazena o access token e o refresh token em texto simples em `~/.config/.wrangler/config/default.toml`. Para persistir as credenciais criptografadas no chaveiro do sistema operacional (GNOME Keyring / `secret-service` no Linux, Keychain no macOS, Windows Credential Manager):

```bash
# Login utilizando o keyring
wrangler login --use-keyring

# Combinado com Device Flow em ambientes remotos
wrangler login --device --use-keyring

# Desativar preferência de keyring
wrangler login --no-use-keyring
```

Quando ativado, o arquivo `preferences.json` registra `"keyring_enabled": true` e as credenciais são salvas no arquivo cifrado `default.toml.encrypted`.

---

### Cenário D: Alternando de Token Manual para OAuth
Se o ambiente possuía um `CLOUDFLARE_API_TOKEN` prévio:

```bash
# 1. Remover variável da sessão ativa
unset CLOUDFLARE_API_TOKEN
unset CLOUDFLARE_ACCOUNT_ID

# 2. Remover de arquivos locais (.env / profile.d)
# Ou utilizar o botão "Usar OAuth" no AuthModal do KrakenBridge-Web

# 3. Realizar login OAuth
wrangler login --device
```

---

## 3. Verificação do Status da Autenticação

Para inspecionar o status e tipo de autenticação ativa no Wrangler:

```bash
# Saída legível para humanos
wrangler whoami

# Saída estruturada em JSON (utilizada pelo KrakenBridge)
wrangler whoami --json
```

**Exemplo de saída com OAuth ativo:**
```json
{
  "loggedIn": true,
  "authType": "OAuth Token",
  "email": "dev@example.com",
  "accounts": [
    {
      "id": "1234567890abcdef1234567890abcdef",
      "name": "Minha Organização"
    }
  ]
}
```

---

## 4. Integração no KrakenBridge-Web

O KrakenBridge-Web expõe a gestão de OAuth tanto na interface gráfica quanto via API REST:

- **Interface Gráfica (`AuthModal`)**:
  - Aba **Cloudflare**: Botão *Conectar Cloudflare via OAuth* com Device Code Flow nativo e cópia rápida de código.
  - Indicador visual dinâmico do tipo de autenticação ativo (`OAuth 2.0` vs `API Token`).
  - Botão de transição suave *Usar OAuth* para limpar tokens legados.
  - Checkbox para ativação do *Keyring*.
- **Endpoints de Backend (`/api/auth/cloudflare`)**:
  - `GET /status`: Detecção de `authMethod` (`'oauth' | 'token' | 'none'`), dados de conta e estado do keyring.
  - `POST /device/start`: Dispara `wrangler login --device` e devolve código/URL.
  - `GET /device/poll`: Consulta andamento da autorização.
  - `POST /mode`: Alterna modo para OAuth e limpa variáveis de ambiente.
  - `POST /keyring`: Habilita/desabilita persistência em chaveiro.
  - `POST /logout`: Encerra a sessão e revoga tokens no Cloudflare.
