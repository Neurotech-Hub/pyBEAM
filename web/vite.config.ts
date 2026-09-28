import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The pipeline output (data/web) is served as static files, both in dev and in the build.
export default defineConfig({
  base: process.env.BASE_PATH ?? "/pyBEAM/",
  publicDir: "../data/web",
  plugins: [react(), tailwindcss()],
  build: { chunkSizeWarningLimit: 1200 },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
