# ---- deps stage ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# ---- final stage ----
FROM node:20-alpine AS final

# Cria usuário sem privilégios
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copia dependências instaladas
COPY --from=deps /app/backend/node_modules ./backend/node_modules

# Copia código-fonte
COPY backend ./backend
COPY frontend ./frontend

# Diretório para fallback JSON persistente
RUN mkdir -p /data && chown appuser:appgroup /data

WORKDIR /app/backend

USER appuser

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
