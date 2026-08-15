FROM node:22-slim

# python3 is required by the yt-dlp zipapp. Installing the release binary rather
# than the distro package on purpose: Debian's yt-dlp goes stale quickly, and a
# stale yt-dlp fails every video at once.
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      ffmpeg \
      python3 \
      ca-certificates \
      curl \
 && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
      -o /usr/local/bin/yt-dlp \
 && chmod a+rx /usr/local/bin/yt-dlp \
 && yt-dlp --version

WORKDIR /app

# Manifests first so the dependency layer survives source-only changes.
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY web/package.json ./web/
RUN npm ci

COPY . .
RUN npm run build

# Hugging Face Spaces run containers as uid 1000 and route traffic to 7860.
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=7860

USER node
EXPOSE 7860

CMD ["node", "server/index.js"]
