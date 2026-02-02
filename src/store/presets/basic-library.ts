import { RSPACK_CONFIG } from "../common";
import type { SourcePreset } from ".";

const preset: SourcePreset = {
  name: "Basic Library",
  files: [
    {
      filename: RSPACK_CONFIG,
      text: `import * as rspack from "@rspack/core"

export default {
  mode: "development",
  devtool: 'source-map',
	entry: {
		main: "./index.js"
	},
  plugins: [
    new rspack.BannerPlugin({
      banner: 'hello world',
    }),
  ],
};`,
    },
    {
      filename: "index.js",
      text: `import lib from "./lib.js"
console.log(lib)`,
    },
    {
      filename: "lib.js",
      text: `export default "lib";`,
    },
  ],
};

export default preset;
