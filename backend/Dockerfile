FROM node:20-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY backend ./backend
COPY frontend ./frontend
WORKDIR /app/backend
ENV NODE_ENV=production
ENV HOST=0.0.0.0
EXPOSE 3000
CMD ["npm", "start"]
