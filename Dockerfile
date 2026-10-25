FROM mcr.microsoft.com/playwright:v1.64.1-noble

WORKDIR /app
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci && npx prisma generate

COPY public ./public
COPY data ./data
COPY database.js mtc_service.js server.js ./

EXPOSE 3005
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]

