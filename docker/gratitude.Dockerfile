FROM node:22-alpine
WORKDIR /app

COPY apps/gratitude/package*.json ./
RUN npm install

COPY apps/gratitude/ .

EXPOSE 3000
CMD ["node", "--watch", "apps/gratitude/server.js"]
