FROM node:24-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install -g @deepseek-ai/dsh@0.2.1-rc.5
RUN useradd -m -u 1001 -s /bin/bash principal
USER principal
WORKDIR /workspace
