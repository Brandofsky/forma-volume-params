import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Auto-detects repo name from GitHub Actions environment
// Locally it defaults to "/" so npm run dev still works
const base = process.env.GITHUB_REPOSITORY
  ? `/${process.env.GITHUB_REPOSITORY.split("/")[1]}/`
  : "/";

export default defineConfig({
  plugins: [react()],
  base,
  server: {
    port: 5173,
    cors: true,
  },
});
