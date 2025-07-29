FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI (when available)
# For now, we'll simulate it
RUN echo '#!/bin/bash\necho "Claude Code simulation: $@"' > /usr/local/bin/claude-code && \
    chmod +x /usr/local/bin/claude-code

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy TypeScript config and source
COPY tsconfig.json ./
COPY src ./src

# Build the application
RUN npm run build

# Create workspace for repositories
RUN mkdir -p /workspace

# Set environment variables
ENV NODE_ENV=production

# Run the worker
CMD ["node", "lib/worker.js"]