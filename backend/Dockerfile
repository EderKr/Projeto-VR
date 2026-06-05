FROM node:20-alpine

WORKDIR /app

# Instala somente as dependências do back-end.
COPY backend/package*.json ./backend/
RUN cd backend && (npm ci --omit=dev || npm install --omit=dev)

# Copia back-end e front-end para que o servidor consiga servir ../frontend.
COPY backend ./backend
COPY frontend ./frontend

WORKDIR /app/backend
ENV NODE_ENV=production
ENV HOST=0.0.0.0
EXPOSE 3000
CMD ["npm", "start"]
