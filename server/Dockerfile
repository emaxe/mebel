# Контекст сборки — корень репозитория: серверу нужно расчётное ядро из web/ (то же, что исполняется в браузере)
FROM node:22-alpine
WORKDIR /app
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci --omit=dev
COPY server server
COPY web/rules.js web/model.js web/model-fronts.js web/
WORKDIR /app/server
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
