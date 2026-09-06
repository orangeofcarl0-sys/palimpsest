/**
 * PLMP-WEB-2: the shared graph panel build chain (React + React Flow).
 * Independent of the kernel tsc build - `pnpm build:web` produces the
 * static bundle that `palimpsest serve` serves at `/`.
 */
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  build: {
    outDir: fileURLToPath(new URL("../dist/web", import.meta.url)),
    emptyOutDir: true,
  },
  plugins: [react()],
});
