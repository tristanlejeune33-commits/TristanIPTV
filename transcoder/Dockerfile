# Single-stage build — small image with Node + ffmpeg static binaries.
FROM node:20-alpine

# Install ffmpeg (also pulls in ffprobe). Alpine's ffmpeg is built with
# libx264 + libaac, which is everything we need for transcoding HEVC/AC-3
# IPTV streams to H.264/AAC.
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Install deps separately so the layer caches when only server.js changes
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY server.js ./

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.js"]
