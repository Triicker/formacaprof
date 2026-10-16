# API Formação para Professores — imagem de produção (Render)
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node content ./content
# Arquivos protegidos servidos por /api/v1/media/:id (somente leitura dentro da imagem).
COPY --chown=node:node storage ./storage
USER node
EXPOSE 3000
# Migrations NÃO rodam aqui: são aplicadas no preDeployCommand do Render (npx prisma migrate deploy).
CMD ["node", "dist/src/main.js"]
