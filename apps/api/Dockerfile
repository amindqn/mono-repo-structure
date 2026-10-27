FROM node:24-bookworm-slim AS build
RUN npm install --global pnpm@11.15.1
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm exec turbo run build --filter=@repo/api
RUN pnpm --filter @repo/api deploy --prod --legacy /out/api

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4000
WORKDIR /app
COPY --from=build --chown=node:node /out/api/ ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=20s --timeout=5s --start-period=15s CMD ["node", "-e", "fetch('http://127.0.0.1:4000/api/v1/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "dist/main.js"]
