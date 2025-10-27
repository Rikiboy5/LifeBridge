import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Povolenie prístupu z iných zariadení v sieti (voliteľné):
    // host: true,  // alebo "0.0.0.0"
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
        secure: false,
        // Ak backend už má prefix /api, neresetuj ho; inak môžeš odstrániť prefix:
        // rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  // Ak budeš build servovať spod podadresára alebo cez Flask static, zváž base: "./"
  // a prípadne zmenu výstupu:
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});