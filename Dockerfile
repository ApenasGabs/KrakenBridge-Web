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

# Copiar manifesto de dependências do backend
COPY package.json ./

# Instalar dependências de produção do Node
RUN npm install --omit=dev

# Copiar código do backend e rotas modulares
COPY server.js ./
COPY routes ./routes
COPY services ./services
COPY public ./public
COPY entrypoint.sh ./

# Copiar bundle de produção gerado pelo Vite
COPY --from=frontend-builder /app/frontend/dist ./dist

RUN chmod +x entrypoint.sh

# Criar ponto de montagem padrão para o workspace
RUN mkdir -p /workspace

ENV NODE_ENV=production
ENV PORT=8088
ENV WORKSPACE_DIR=/workspace
ENV CODE_SERVER_PORT=8089

EXPOSE 8088

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "server.js"]
