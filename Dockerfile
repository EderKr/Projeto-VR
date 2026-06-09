FROM node:20-alpine
WORKDIR /app

# Install backend dependencies first to leverage Docker layer caching.
COPY backend/package*.json /app/backend/
RUN cd /app/backend && npm ci --omit=dev || npm install --omit=dev

COPY backend /app/backend
COPY frontend /app/frontend

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV FRONTEND_DIR=/app/frontend
ENV DB_PATH=/data/db.json
EXPOSE 3000
WORKDIR /app/backend
CMD ["npm", "start"]
