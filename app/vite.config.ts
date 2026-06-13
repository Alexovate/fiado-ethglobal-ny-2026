import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  // @ledgerhq transport/app-eth expect Node globals (Buffer) in the browser.
  plugins: [react(), tailwindcss(), nodePolyfills({ globals: { Buffer: true } })],
  server: {
    port: 5173,
    // allow tunneled hosts (ngrok) so the World ID QR flow can be tested on a phone
    allowedHosts: [".ngrok-free.app", ".ngrok.app", ".ngrok.io"],
    proxy: { "/api": { target: "http://localhost:3001", rewrite: (p) => p.replace(/^\/api/, "") } },
  },
  preview: {
    port: 4173,
    allowedHosts: true, // served via a stable ngrok cloud endpoint / custom domain
    proxy: { "/api": { target: "http://localhost:3001", rewrite: (p) => p.replace(/^\/api/, "") } },
  },
});
