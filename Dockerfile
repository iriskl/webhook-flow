FROM redis:8-alpine AS base
WORKDIR /app
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apk add --no-cache nodejs npm sqlite \
  && npm install -g pnpm@10.30.3

FROM base AS deps
COPY package.json pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/mock-receiver/package.json apps/mock-receiver/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile=false

FROM deps AS build
ARG VITE_API_BASE_URL=http://localhost:4000
ARG VITE_MOCK_BASE_URL=http://localhost:4001
ARG VITE_WORKFLOW_MOCK_BASE_URL=http://localhost:4001
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ENV VITE_MOCK_BASE_URL=$VITE_MOCK_BASE_URL
ENV VITE_WORKFLOW_MOCK_BASE_URL=$VITE_WORKFLOW_MOCK_BASE_URL
COPY . .
RUN pnpm db:generate
RUN pnpm build

FROM base AS runner
COPY --from=build /app /app
EXPOSE 4000 4001 5173
CMD ["pnpm", "start"]
