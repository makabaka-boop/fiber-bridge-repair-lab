# syntax=docker/dockerfile:1

# ---- 依赖层 ----
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# ---- 构建层 ----
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- 验收层：一次性运行 Vitest（删边预言机等），退出码即验收结论 ----
FROM node:20-alpine AS verify
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
CMD ["npm", "test"]

# ---- 页面发布层：静态资源 + 轻量 http server ----
FROM nginx:1.27-alpine AS web
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
