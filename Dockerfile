FROM node:18-alpine

# Adiciona usuário não-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs

# Define diretório de trabalho
WORKDIR /app

# Instala dependências
COPY package*.json ./
RUN npm ci --only=production && \
    npm cache clean --force

# Copia apenas os arquivos necessários
COPY --chown=nodejs:nodejs WAPI.js ./

# Define usuário não-root
USER nodejs

# Expõe porta
EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --spider -q http://localhost:3000/health || exit 1

# Inicia aplicação
CMD ["node", "WAPI.js"]
