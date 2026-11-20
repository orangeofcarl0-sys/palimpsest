FROM palimpsest-pnwf-isolation:local
USER root
WORKDIR /opt/palimpsest-dev
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY assets ./assets
RUN npm install --global pnpm@11.21.0 && pnpm install --frozen-lockfile --ignore-scripts
WORKDIR /workspace

