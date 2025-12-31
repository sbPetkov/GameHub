FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

# Expose the internal port (will be accessed via internal network)
EXPOSE 3001

CMD ["npm", "start"]
