FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --omit=dev

COPY . .

EXPOSE 8082

CMD ["node", "index.js", "--env", "/app/.env"]
