import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import prerender from "./prerender";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 8080,
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET || "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  plugins: [react(), prerender()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
