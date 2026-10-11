FROM node:22-alpine
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/miniapp/package.json apps/miniapp/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "start"]
