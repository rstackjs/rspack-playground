import { defineConfig, RsbuildPlugin } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import TerserPlugin from "terser-webpack-plugin";

export default defineConfig({
  plugins: [pluginReact()],
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
