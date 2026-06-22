FROM node:20-alpine AS build
WORKDIR /app
COPY frontend/package*.json ./frontend/
COPY backend/package*.json ./backend/
RUN npm ci --prefix frontend && npm ci --prefix backend
COPY frontend ./frontend
COPY backend ./backend
RUN npm run build --prefix frontend && npm run build:rides --prefix backend

FROM node:20-alpine
WORKDIR /app
COPY backend/package*.json ./backend/
RUN npm ci --omit=dev --prefix backend
COPY backend ./backend
COPY --from=build /app/frontend/dist ./frontend/dist
COPY --from=build /app/backend/dist ./backend/dist
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "backend/src/server.js"]
