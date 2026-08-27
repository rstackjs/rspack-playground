import browserProcess from "process";

type ConfigNodeBuiltinLoader = () => Promise<unknown>;

const configGlobal = globalThis as typeof globalThis & {
  process?: typeof browserProcess;
};
const configProcess = configGlobal.process ?? browserProcess;
configGlobal.process ??= configProcess;

function unwrapCommonJsModule(module: unknown) {
  if (typeof module === "object" && module !== null && "default" in module) {
    return (module as { default: unknown }).default;
  }
  return module;
}

function loadCommonJsModule(loader: () => Promise<unknown>) {
  return loader().then(unwrapCommonJsModule);
}

let assertPromise: Promise<unknown> | undefined;
function loadAssert() {
  assertPromise ??= loadCommonJsModule(() => import("assert"));
  return assertPromise;
}

let utilPromise: Promise<unknown> | undefined;
function loadUtil() {
  utilPromise ??= loadCommonJsModule(() => import("util"));
  return utilPromise;
}

const configNodeBuiltinLoaders: Record<string, ConfigNodeBuiltinLoader> = {
  assert: loadAssert,
  "assert/strict": async () => ((await loadAssert()) as { strict: unknown }).strict,
  buffer: () => loadCommonJsModule(() => import("buffer")),
  events: () => loadCommonJsModule(() => import("events")),
  os: () => loadCommonJsModule(() => import("os-browserify/browser.js")),
  process: async () => configProcess,
  querystring: () => loadCommonJsModule(() => import("querystring-es3")),
  stream: () => loadCommonJsModule(() => import("stream-browserify")),
  string_decoder: () => loadCommonJsModule(() => import("string_decoder")),
  timers: () => loadCommonJsModule(() => import("timers-browserify")),
  tty: () => loadCommonJsModule(() => import("tty-browserify")),
  url: async () => ({
    ...((await loadCommonJsModule(() => import("url"))) as object),
    URL,
    URLSearchParams,
  }),
  util: loadUtil,
  sys: loadUtil,
};

export const supportedConfigNodeBuiltinNames = [
  "path",
  "path/posix",
  ...Object.keys(configNodeBuiltinLoaders),
];

// SWC lowers static imports and literal require calls to `require("...")`.
// Discover those requests before evaluating the synchronous CommonJS wrapper
// so only the browser shims used by the config need to be loaded.
const staticRequirePattern = /\brequire\(\s*(["'])([^"']+)\1\s*\)/g;

export async function loadConfigNodeBuiltinModules(code: string) {
  const requestedBuiltinNames = new Set<string>();
  for (const match of code.matchAll(staticRequirePattern)) {
    const request = match[2];
    const builtinName = request.startsWith("node:") ? request.slice("node:".length) : request;
    if (Object.prototype.hasOwnProperty.call(configNodeBuiltinLoaders, builtinName)) {
      requestedBuiltinNames.add(builtinName);
    }
  }

  const loadedModules = await Promise.all(
    [...requestedBuiltinNames].map(async (name) => {
      const module = await configNodeBuiltinLoaders[name]();
      return [name, module] as const;
    }),
  );
  return new Map<string, unknown>(loadedModules);
}
