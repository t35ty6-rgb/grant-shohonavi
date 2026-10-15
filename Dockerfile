FROM mcr.microsoft.com/playwright:v1.56.0-jammy

WORKDIR /app

# Install deps
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install --omit=dev

# Copy server
COPY server/server.mjs server/gmax-automate.mjs ./server/

# Copy frontend static files (served by Express)
COPY index.html fig.js tunnel-url.txt ./
COPY img ./img

# Create .screenshots dir with correct ownership
RUN mkdir -p .screenshots && chown -R pwuser:pwuser /app

USER pwuser
ENV NODE_ENV=production
ENV PORT=3333

# API key: Fly secret → env var API_KEY
# server.mjs reads from env if set, else from api-key.txt

EXPOSE 3333

CMD ["node", "/app/server/server.mjs"]
