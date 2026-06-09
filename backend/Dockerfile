FROM node:20-alpine
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY backend ./
COPY frontend /app/frontend
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV FRONTEND_DIR=/app/frontend/public
ENV DB_PATH=/data/db.json
EXPOSE 3000
CMD ["npm", "start"]
