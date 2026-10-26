# Stage 1: Build do Frontend React (Vite + TypeScript + DaisyUI)
FROM node:22-bookworm-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Imagem de Produção Final
FROM node:22-bookworm-slim

# Instalar dependências essenciais de desenvolvimento, Git e GitHub CLI oficial (gh)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    wget \
    ca-certificates \
    procps \
    python3 \
    build-essential \
    bash \
    && mkdir -p -m 755 /etc/apt/keyrings \
    && wget -qO- https://cli.github.com/packages/githubcli-archive-keyring.gpg | tee /etc/apt/keyrings/githubcli-archive-keyring.gpg > /dev/null \
    && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

# Configurar Git para aceitar diretórios montados sem erro de dubious ownership
RUN git config --global --add safe.directory "*"

# Diretório da aplicação
WORKDIR /app

# Copiar manifestos de dependências do backend
COPY package*.json tsconfig.json ./

# Instalar dependências completas e CLI oficial skills (skills.sh da Vercel Labs)
RUN npm install && npm install -g skills

# Copiar código-fonte TypeScript e scripts
COPY src ./src
COPY scripts ./scripts
COPY public ./public
COPY entrypoint.sh ./

# Compilar Backend TypeScript para dist-server
RUN npm run build:server

# Copiar bundle de produção gerado pelo Vite
COPY --from=frontend-builder /app/frontend/dist ./dist

RUN chmod +x entrypoint.sh scripts/*.sh

# Criar ponto de montagem padrão para o workspace
RUN mkdir -p /workspace

ENV NODE_ENV=production
ENV PORT=8088
ENV WORKSPACE_DIR=/workspace
ENV CODE_SERVER_PORT=8089

EXPOSE 8088

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "dist-server/server.js"]
