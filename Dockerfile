FROM node:22-alpine
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY server.js index.html ./

ENV NODE_ENV=production
EXPOSE 8080

CMD ["node", "server.js"]
