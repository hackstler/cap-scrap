FROM mcr.microsoft.com/playwright:v1.50.0-noble

WORKDIR /app

COPY package.json ./
RUN npm install
RUN npx patchright install chromium

COPY tsconfig.json ./
COPY src/ ./src/

RUN npx tsc

ENV NODE_OPTIONS="--max-old-space-size=512"

EXPOSE 3000

CMD ["node", "dist/server.js"]
