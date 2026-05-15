# Node.js 20 slim
FROM node:20-slim

# Baileys needs openssl for crypto operations
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Working directory
WORKDIR /usr/src/app

# Copy config files first (layer cache)
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci

# Generate Prisma client
RUN npx prisma generate

# Copy source
COPY . .

# Compile TypeScript
RUN npm run build

# Expose port
EXPOSE 3000

# Run migrations then start server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/server.js"]