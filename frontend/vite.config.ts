import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectRegister: false,
      manifest: false,
      includeAssets: [
        "kraken-icon.svg",
        "apple-touch-icon.png",
        "icon-192x192.png",
        "icon-512x512.png",
        "icon-maskable-192x192.png",
        "icon-maskable-512x512.png",
        "manifest.webmanifest",
      ],
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest,woff2}"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8088",
        changeOrigin: true,
      },
      "/monaco": {
        target: "http://localhost:8088",
        changeOrigin: true,
      },
    },
  },
});
