FROM node:20-alpine

# Install Python3, ffmpeg (needed for yt-dlp), and curl
RUN apk add --no-cache python3 py3-pip ffmpeg curl

# Install yt-dlp
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

# Expose the internal port (will be accessed via internal network)
EXPOSE 3001

CMD ["npm", "start"]
