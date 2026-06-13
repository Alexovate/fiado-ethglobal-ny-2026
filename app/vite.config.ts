import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  // @ledgerhq transport/app-eth expect Node globals (Buffer) in the browser.
  plugins: [react(), tailwindcss(), nodePolyfills({ globals: { Buffer: true } })],
  server: { port: 5173, proxy: { "/api": { target: "http://localhost:3001", rewrite: (p) => p.replace(/^\/api/, "") } } },
});
