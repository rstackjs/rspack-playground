import { defineConfig, RsbuildPlugin } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import TerserPlugin from "terser-webpack-plugin";

import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { promisify } from "node:util";

export default defineConfig({
  plugins: [
    pluginReact(),
    WasmGzipPlugin(),
  ],
  html: {
    title: "Rspack Playground",
    favicon: "./public/favicon-128x128.png",
    appIcon: {
      name: "Rspack Playground",
      icons: [
        {
          src: "public/favicon-128x128.png",
          size: 128,
        },
      ],
    },
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  tools: {
    bundlerChain(chain, { CHAIN_ID }) {
      chain.optimization.minimizer(CHAIN_ID.MINIMIZER.JS).use(TerserPlugin);
    },
  },
});

function WasmGzipPlugin(): RsbuildPlugin {
  const gzip = promisify(zlib.gzip);

  return {
    name: "wasm-gzip",
    setup(api) {
      api.onAfterBuild(async () => {
        if (process.env.NODE_ENV !== "production") {
          return;
        }
        const { distPath } = api.context;
        const files = await fs.readdir(distPath, { recursive: true });
        for (const file of files) {
          if (file.endsWith(".wasm")) {
            const filePath = path.join(distPath, file);
            const content = await fs.readFile(filePath);
            const gzipped = await gzip(content);
            await fs.writeFile(filePath, gzipped);
            console.log(`[wasm-gzip] Compressed: ${file}`);
          }
        }
      });
    },
  }
}