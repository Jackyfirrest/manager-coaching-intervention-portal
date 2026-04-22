FROM node:20-alpine

RUN apk add --no-cache sqlite

WORKDIR /app

COPY package.json ./
COPY app.js ./
COPY public ./public

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DB_PATH=/data/manager_coaching.sqlite
ENV SEED_DEMO_DATA=true

RUN mkdir -p /data

EXPOSE 3000

CMD ["npm", "start"]
