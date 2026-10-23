FROM node:22-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM base AS api
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/packages/schema/dist packages/schema/dist
COPY --from=build /app/packages/schema/migrations packages/schema/migrations
COPY --from=build /app/packages/resume-templates/dist packages/resume-templates/dist
COPY --from=build /app/packages/resume-templates/package.json packages/resume-templates/package.json
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/packages/schema/package.json packages/schema/package.json
COPY --from=build /app/package.json package.json
COPY --from=build /app/pnpm-workspace.yaml pnpm-workspace.yaml
COPY --from=build /app/pnpm-lock.yaml pnpm-lock.yaml
RUN pnpm install --frozen-lockfile --prod
RUN ./apps/api/node_modules/.bin/playwright-core install --with-deps chromium

EXPOSE 3001

CMD ["sh", "-c", "node apps/api/dist/apps/api/src/migrate.js && exec node apps/api/dist/apps/api/src/main.js"]

FROM base AS web
COPY --from=build /app/apps/web/.next apps/web/.next
COPY --from=build /app/apps/web/package.json apps/web/package.json
COPY --from=build /app/apps/web/next.config.mjs apps/web/next.config.mjs
COPY --from=build /app/apps/web/public apps/web/public
COPY --from=build /app/packages/schema/dist packages/schema/dist
COPY --from=build /app/packages/schema/package.json packages/schema/package.json
COPY --from=build /app/packages/resume-templates/dist packages/resume-templates/dist
COPY --from=build /app/packages/resume-templates/package.json packages/resume-templates/package.json
COPY --from=build /app/package.json package.json
COPY --from=build /app/pnpm-workspace.yaml pnpm-workspace.yaml
COPY --from=build /app/pnpm-lock.yaml pnpm-lock.yaml
RUN rm -rf apps/web/.next/cache && pnpm install --frozen-lockfile --prod

EXPOSE 3000

WORKDIR /app/apps/web

CMD ["node", "node_modules/next/dist/bin/next", "start", "--port", "3000"]
