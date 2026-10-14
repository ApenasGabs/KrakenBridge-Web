# Stage 1: Build do Frontend React (Vite + TypeScript + DaisyUI)
FROM node:22-bookworm-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# Stage 2: Imagem de Produção Final
FROM node:22-bookworm-slim

# Instalar dependências essenciais de desenvolvimento e Git
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    wget \
    ca-certificates \
    procps \
    python3 \
    build-essential \
    bash \
    && rm -rf /var/lib/apt/lists/*

# Configurar Git para aceitar diretórios montados sem erro de dubious ownership
RUN git config --global --add safe.directory "*"

# Diretório da aplicação
WORKDIR /app

# Copiar manifestos de dependências do backend
COPY package*.json tsconfig.json ./

# Instalar dependências completas para viabilizar auto-evolução e build TypeScript
RUN npm install

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
