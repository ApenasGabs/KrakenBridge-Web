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

# Copiar manifesto de dependências
COPY package.json ./

# Instalar dependências de produção
RUN npm install --omit=dev

# Copiar código-fonte
COPY server.js ./
COPY public ./public
COPY entrypoint.sh ./

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
