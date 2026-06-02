FROM node:20-slim AS builder

WORKDIR /app

# Copia os arquivos de dependência e instala
COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

# Copia o resto do código e faz o build
COPY . .
RUN npm run build

# Imagem final (menor e mais segura)
FROM node:20-slim

WORKDIR /app

# Copia os artefatos necessários da fase de build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Expõe a porta que sua aplicação usa
EXPOSE 3000

# Gera o cliente Prisma e inicia a aplicação
CMD ["sh", "-c", "npx prisma generate && npm run start:prod"]