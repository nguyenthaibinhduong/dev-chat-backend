FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare yarn@1.22.22 --activate
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --non-interactive --network-timeout 600000

FROM deps AS build
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY apps ./apps
COPY libs ./libs
RUN yarn build:all

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && corepack prepare yarn@1.22.22 --activate
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production --non-interactive --network-timeout 600000 --prefer-offline && yarn cache clean
COPY --from=build /app/dist ./dist
COPY apps/auth/src/templates ./apps/auth/src/templates
EXPOSE 3088
CMD ["node", "dist/apps/gateway/apps/gateway/src/main.js"]

