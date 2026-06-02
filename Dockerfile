FROM node:20-slim AS builder

# Instala dependências do sistema
RUN apt-get update -y && apt-get install -y \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

COPY . .
RUN npm run build

# Imagem final
FROM node:20-slim

RUN apt-get update -y && apt-get install -y \
    openssl \
    ca-certificates \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

# Gera cliente Prisma (garante que esteja presente) e inicia
CMD ["sh", "-c", "npx prisma generate && npm run start:prod"]