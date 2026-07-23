FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/frontend/package.json apps/frontend/package.json

RUN npm install

COPY apps/frontend apps/frontend
COPY eslint.config.js ./
COPY .prettierrc.json ./

WORKDIR /app/apps/frontend

CMD ["npm", "run", "dev"]

