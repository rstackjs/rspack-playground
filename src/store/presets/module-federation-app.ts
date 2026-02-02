import { RSPACK_CONFIG } from "../common";
import type { SourcePreset } from ".";

const preset: SourcePreset = {
  name: "Module Federation App",
  files: [
    {
      filename: RSPACK_CONFIG,
      text: `import * as rspack from "@rspack/browser"

export default {
mode: "development",
  devtool: 'source-map',
  entry: "./index.js",
  output: {
    // set uniqueName explicitly to make react-refresh works
    uniqueName: "app",
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        use: {
          loader: "builtin:swc-loader",
          options: {
            jsc: {
              target: "es2017",
              parser: {
                syntax: "ecmascript",
                jsx: true,
              },
              transform: {
                react: {
                  runtime: "automatic",
                },
              },
            },
          },
        },
      },
    ],
  },
  plugins: [
    new rspack.BrowserHttpImportEsmPlugin({
      domain: "https://esm.sh",
      dependencyVersions: {
        "react": "19.2.0",
        "react-dom": "19.2.0"
      },
      postprocess: (request) => {
        if (request.packageName === "@module-federation/webpack-bundler-runtime" || request.packageName === "react-dom") {
          request.url.searchParams.set("dev", "");
        }
        request.url.searchParams.set("external", "react");
      }
    }),
    new rspack.HtmlRspackPlugin({
      template: './index.html',
    }),
    new rspack.container.ModuleFederationPlugin({
      name: "app",
      // List of remotes with URLs
      remotes: {
        "mfe-b": "mfeBBB@${new URL("mf-lib/mfeBBB.js", window.location.href).toString()}",
      },

      // list of shared modules with optional options
      shared: {
        // specifying a module request as shared module
        // will provide all used modules matching this name (version from package.json)
        // and consume shared modules in the version specified in dependencies from package.json
        // (or in dev/peer/optionalDependencies)
        // So it use the highest available version of this package matching the version requirement
        // from package.json, while providing it's own version to others.
        react: {
          import: false,
          eager: true,
          singleton: true, // make sure only a single react module is used
        },
      },

      // list of runtime plugin modules (feature of MF1.5)
      runtimePlugins: ["./runtimePlugins/logger.js"],
    }),
  ],
  experiments: {
    buildHttp: {
      allowedUris: ["https://"],
    },
  },
};`,
    },
    {
      filename: "/runtimePlugins/logger.js",
      text: `export default function () {
  return {
    name: 'logger',
    beforeInit(args) {
      console.log('beforeInit: ', args);
      return args;
    },
    beforeLoadShare(args) {
      console.log('beforeLoadShare: ', args);
      return args;
    },
  };
}`,
    },
    {
      filename: "App.js",
      text: `import React from 'react';
import ComponentB from 'mfe-b/Component'; // <- these are remote modules,
import { de } from 'date-fns/locale';

const App = () => (
  <article>
    <header>
      <h1></h1>
    </header>
    <p>This component is from a remote container:</p>
    <ComponentB locale={de} />
    <p>And this component is from another remote container:</p>
  </article>
);
export default App;`,
    },
    {
      filename: "bootstrap.js",
      text: `import { createRoot } from 'react-dom/client'; // <- this is a shared module, but used as usual
import App from './App';

// load app
const el = document.createElement('main');
const root = createRoot(el);
root.render(<App />);
document.body.appendChild(el);`,
    },
    {
      filename: "index.js",
      text: `import('./bootstrap');`,
    },
    {
      filename: "index.html",
      text: `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Document</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`,
    },
  ],
};

export default preset;
