import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { execSync } from "node:child_process";

function lastCommitDate(): string {
  try {
    return execSync("git log -1 --format=%cs", { encoding: "utf8" }).trim();
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}
process.env.VITE_SITE_UPDATED ??= lastCommitDate();

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
