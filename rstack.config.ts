// Configuration guide: https://rstack.rs/config
import { define } from "rstack";

define.app(async () => {
  const { pluginReact } = await import("@rsbuild/plugin-react");
  const { default: TerserPlugin } = await import("terser-webpack-plugin");

  return {
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
  };
});

define.lib({
  source: {
    entry: {
      "service-worker": "./sw/service-worker.ts",
    },
  },
  output: {
    distPath: {
      root: "./public/preview",
    },
  },
  lib: [{ format: "esm", autoExtension: false }],
});

define.lint(({ js, ts }) =>
  // Preserve the TypeScript-only scope and base rules of the previous Rslint preset.
  [
    js.configs.recommended,
    ts.configs.recommended,
    {
      // This rule was not enabled by the previous recommended preset.
      rules: { "no-useless-assignment": "off" as const },
    },
  ]
    .flat()
    .map((config) => ({
      ...config,
      files: ["**/*.{ts,tsx,mts,cts}"],
    })),
);

define.fmt({
  printWidth: 100,
  sortPackageJson: true,
});

define.staged({
  "*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}": ["rs lint --fix", "rs fmt"],
  "*.{json,jsonc,md,mdx,css,scss,less,html,yml,yaml}": "rs fmt",
});
