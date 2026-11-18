# the game server + the built client in one image. the client (dist/) is built on the laptop first, see deploy/deploy.sh
FROM node:24-slim
WORKDIR /app
RUN npm install -g pnpm@12.17.0
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY src ./src
COPY server ./server
COPY dist ./dist
ENV STATIC_DIR=/app/dist PORT=8080
USER node
EXPOSE 8080
CMD ["node", "server/main.ts"]
