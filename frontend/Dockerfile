FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Empty by default: the browser calls /api on the same origin and nginx proxies it.
# Set only when the API lives on another origin (e.g. https://api.example.com).
ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run compile
RUN npm run build


FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

# SPA routing, /api + WebSocket proxy to the backend, upload size, timeouts
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
