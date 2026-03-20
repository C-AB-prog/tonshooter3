import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    proxy: {
      // ВАЖНО: фронт ходит на /api/*, а Vite проксирует на бек
      "/api": {
        // Codespaces часто держит 4000 занятым, поэтому API поднимаем на 4001
        target: "http://127.0.0.1:4001",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
