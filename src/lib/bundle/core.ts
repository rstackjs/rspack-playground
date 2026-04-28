import type { RspackOptions } from "@rspack/browser";
import { format } from "@/lib/format";
import { isCanaryRspackVersion } from "@/lib/rspack-version";
import type { BundleResult, SourceFile } from "@/store/bundler";
import { RSPACK_CONFIG } from "@/store/common";
import { DependenciesPlugin } from "./dependency";

type RspackBrowserAPI = typeof import("@rspack/browser");
type RspackStats = {
  toJson: (options: { all: false; errors: true; warnings: false }) => {
    errors?: Array<{ message: string }>;
    warnings?: Array<{ message: string }>;
  };
};
type RspackCompiler = {
  run: (callback: (error: Error | null, stats?: RspackStats) => void) => void;
};
interface RspackBrowserPackageManifest {
  dependencies?: Record<string, string>;
}

interface RspackBrowserRemoteEntryUrls {
  entryModuleUrl: string;
}

class RemoteFetchError extends Error {
  constructor(
    public readonly url: string,
    public readonly status: number,
    public readonly statusText: string,
  ) {
    super(`Failed to load ${url}: ${status} ${statusText}`);
  }
}

const rspackModulePromises = new Map<string, Promise<RspackBrowserAPI>>();
const rspackEntryPromises = new Map<string, Promise<RspackBrowserRemoteEntryUrls>>();
const rspackManifestPromises = new Map<string, Promise<RspackBrowserPackageManifest>>();

function createBundleFailure(errors: string[], duration = 0): BundleResult {
  return {
    duration,
    output: [],
    formattedOutput: [],
    success: false,
    errors,
    warnings: [],
    sourcemaps: new Map(),
    modules: [],
    chunks: [],
    chunkGroups: [],
  };
}

function getRspackBrowserUrl(version: string) {
  return getRspackBrowserFileUrl(version, "dist/rspack.wasm32-wasi.wasm");
}

function getRspackBrowserBaseUrl(version: string) {
  return `https://cdn.jsdelivr.net/npm/${getRspackBrowserPackageName(version)}@${encodeURIComponent(version)}`;
}

function getRspackBrowserFileUrl(version: string, filePath: string) {
  return `${getRspackBrowserBaseUrl(version)}/${filePath}`;
}

function getRspackBrowserPackageName(version: string) {
  return isCanaryRspackVersion(version) ? "@rspack-canary/browser" : "@rspack/browser";
}

function getJsdelivrEsmUrl(packageName: string, version: string, subpath?: string) {
  const suffix = subpath ? `/${subpath}` : "";
  return `https://cdn.jsdelivr.net/npm/${packageName}@${encodeURIComponent(version)}${suffix}/+esm`;
}

function getPreferredRspackBrowserModuleExtensions(version: string) {
  const [majorText] = version.split(".", 1);
  const major = Number.parseInt(majorText ?? "", 10);
  return Number.isFinite(major) && major >= 2 ? ["js", "mjs"] : ["mjs", "js"];
}

async function fetchRemote(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new RemoteFetchError(url, response.status, response.statusText);
  }
  return response;
}

async function fetchRemoteText(url: string) {
  return (await fetchRemote(url)).text();
}

async function fetchRemoteJson<T>(url: string): Promise<T> {
  return (await fetchRemote(url)).json() as Promise<T>;
}

async function fetchFirstAvailableRemoteText(urls: string[]) {
  let lastNotFoundError: RemoteFetchError | null = null;

  for (const url of urls) {
    try {
      return await fetchRemoteText(url);
    } catch (error) {
      if (error instanceof RemoteFetchError && error.status === 404) {
        lastNotFoundError = error;
        continue;
      }

      throw error;
    }
  }

  throw lastNotFoundError ?? new Error("Failed to load remote rspack entry");
}

function replaceRequired(
  source: string,
  pattern: string | RegExp,
  replacement: string,
  label: string,
) {
  const nextSource = source.replace(pattern, replacement);
  if (nextSource === source) {
    throw new Error(`Failed to rewrite ${label} for remote rspack loading`);
  }
  return nextSource;
}

function replaceRequiredAny(
  source: string,
  patterns: Array<string | RegExp>,
  replacement: string,
  label: string,
) {
  for (const pattern of patterns) {
    const nextSource = source.replace(pattern, replacement);
    if (nextSource !== source) {
      return nextSource;
    }
  }
  throw new Error(`Failed to rewrite ${label} for remote rspack loading`);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceRequiredImportSource(
  source: string,
  specifier: string,
  replacement: string,
  label: string,
) {
  return replaceRequired(
    source,
    new RegExp(`from\\s*["']${escapeRegExp(specifier)}["'];?`, "g"),
    `from ${JSON.stringify(replacement)};`,
    label,
  );
}

function hasImportSource(source: string, specifier: string) {
  return new RegExp(`from\\s*["']${escapeRegExp(specifier)}["'];?`).test(source);
}

function findImportSource(source: string, specifiers: string[]) {
  for (const specifier of specifiers) {
    if (hasImportSource(source, specifier)) {
      return specifier;
    }
  }

  return null;
}

function createBlobModuleUrl(source: string) {
  return URL.createObjectURL(new Blob([source], { type: "text/javascript;charset=utf-8" }));
}

async function getRspackBrowserManifest(version: string): Promise<RspackBrowserPackageManifest> {
  const cachedManifest = rspackManifestPromises.get(version);
  if (cachedManifest) {
    return cachedManifest;
  }

  const manifestPromise = fetchRemoteJson<RspackBrowserPackageManifest>(
    getRspackBrowserFileUrl(version, "package.json"),
  );
  rspackManifestPromises.set(version, manifestPromise);

  try {
    return await manifestPromise;
  } catch (error) {
    rspackManifestPromises.delete(version);
    throw error;
  }
}

async function getRspackBrowserEntryUrls(version: string): Promise<RspackBrowserRemoteEntryUrls> {
  const cachedEntry = rspackEntryPromises.get(version);
  if (cachedEntry) {
    return cachedEntry;
  }

  const entryPromise = (async () => {
    const manifest = await getRspackBrowserManifest(version);
    const liteTapableVersion = manifest.dependencies?.["@rspack/lite-tapable"] ?? "";
    const wasmRuntimeVersion = manifest.dependencies?.["@napi-rs/wasm-runtime"] ?? "";

    if (!liteTapableVersion || !wasmRuntimeVersion) {
      throw new Error(`Rspack browser ${version} is missing published dependency metadata`);
    }

    const entrySource = await fetchFirstAvailableRemoteText(
      getPreferredRspackBrowserModuleExtensions(version).map((moduleExtension) =>
        getRspackBrowserFileUrl(version, `dist/index.${moduleExtension}`),
      ),
    );
    const runtimeImportSource = findImportSource(entrySource, [
      "./rslib-runtime.mjs",
      "./rslib-runtime.js",
    ]);
    const wasiImportSource = findImportSource(entrySource, [
      "./rspack.wasi-browser.mjs",
      "./rspack.wasi-browser.js",
    ]);

    if (!wasiImportSource) {
      throw new Error(`Failed to detect rspack.wasi-browser import for remote rspack ${version}`);
    }

    const browserRuntimeUrl = runtimeImportSource
      ? getRspackBrowserFileUrl(version, `dist/${runtimeImportSource.slice(2)}`)
      : null;
    const browserWasiUrl = getRspackBrowserFileUrl(version, `dist/${wasiImportSource.slice(2)}`);
    const browserWorkerUrl = getRspackBrowserFileUrl(version, "dist/wasi-worker-browser.mjs");

    const [wasiSource, workerSource] = await Promise.all([
      fetchRemoteText(browserWasiUrl),
      fetchRemoteText(browserWorkerUrl),
    ]);

    const runtimeModuleUrl = browserRuntimeUrl
      ? createBlobModuleUrl(await fetchRemoteText(browserRuntimeUrl))
      : null;
    const workerModuleUrl = createBlobModuleUrl(workerSource);
    const wasmUrl = getRspackBrowserUrl(version);

    let rewrittenWasiSource = replaceRequiredImportSource(
      wasiSource,
      "@napi-rs/wasm-runtime",
      getJsdelivrEsmUrl("@napi-rs/wasm-runtime", wasmRuntimeVersion),
      "@napi-rs/wasm-runtime import",
    );
    rewrittenWasiSource = replaceRequiredImportSource(
      rewrittenWasiSource,
      "@napi-rs/wasm-runtime/fs",
      getJsdelivrEsmUrl("@napi-rs/wasm-runtime", wasmRuntimeVersion, "fs"),
      "@napi-rs/wasm-runtime/fs import",
    );
    rewrittenWasiSource = replaceRequiredAny(
      rewrittenWasiSource,
      [
        /(?:window|globalThis)\.RSPACK_WASM_URL\s*(?:\|\||\?\?)\s*new URL\((["'])\.\/rspack\.wasm32-wasi\.wasm\1,\s*import\.meta\.url\)\.href/g,
        /new URL\((["'])\.\/rspack\.wasm32-wasi\.wasm\1,\s*import\.meta\.url\)\.href/g,
        /new URL\((["'])\.\/rspack\.wasm32-wasi\.wasm\1,\s*import\.meta\.url\)/g,
      ],
      JSON.stringify(wasmUrl),
      "rspack wasm url",
    );
    rewrittenWasiSource = replaceRequiredAny(
      rewrittenWasiSource,
      [
        /new URL\((["'])\.\/wasi-worker-browser\.mjs\1,\s*import\.meta\.url\)\.href/g,
        /new URL\((["'])\.\/wasi-worker-browser\.mjs\1,\s*import\.meta\.url\)/g,
      ],
      JSON.stringify(workerModuleUrl),
      "rspack worker url",
    );

    const wasiModuleUrl = createBlobModuleUrl(rewrittenWasiSource);

    let rewrittenEntrySource = replaceRequiredImportSource(
      entrySource,
      wasiImportSource,
      wasiModuleUrl,
      "rspack.wasi-browser import",
    );
    if (runtimeModuleUrl && runtimeImportSource) {
      rewrittenEntrySource = replaceRequiredImportSource(
        rewrittenEntrySource,
        runtimeImportSource,
        runtimeModuleUrl,
        "rslib runtime import",
      );
    }
    rewrittenEntrySource = replaceRequiredImportSource(
      rewrittenEntrySource,
      "@rspack/lite-tapable",
      getJsdelivrEsmUrl("@rspack/lite-tapable", liteTapableVersion),
      "@rspack/lite-tapable import",
    );

    return {
      entryModuleUrl: createBlobModuleUrl(rewrittenEntrySource),
    };
  })();

  rspackEntryPromises.set(version, entryPromise);

  try {
    return await entryPromise;
  } catch (error) {
    rspackEntryPromises.delete(version);
    throw error;
  }
}

async function importRspackBrowser(version: string): Promise<RspackBrowserAPI> {
  const cachedPromise = rspackModulePromises.get(version);
  if (cachedPromise) {
    return cachedPromise;
  }

  const modulePromise = (async () => {
    const { entryModuleUrl } = await getRspackBrowserEntryUrls(version);
    return import(/* webpackIgnore: true */ entryModuleUrl) as Promise<RspackBrowserAPI>;
  })();
  rspackModulePromises.set(version, modulePromise);

  try {
    return await modulePromise;
  } catch (error) {
    rspackModulePromises.delete(version);
    rspackEntryPromises.delete(version);
    throw error;
  }
}

async function loadConfig(content: string, rspackAPI: RspackBrowserAPI): Promise<RspackOptions> {
  function requireRspack(name: string) {
    if (name === "@rspack/core" || name === "@rspack/browser") {
      return rspackAPI;
    }
    throw new Error("Only support for importing '@rspack/core' or '@rspack/browser");
  }
  const module: { exports: { default: RspackOptions } } = {
    exports: { default: {} },
  };
  const exports = module.exports;

  const cjsContent = await rspackAPI.experiments.swc.transform(content, {
    module: { type: "commonjs" },
  });

  const wrapper = new Function("module", "exports", "require", cjsContent.code);
  wrapper(module, exports, requireRspack);
  return exports.default as RspackOptions;
}

export async function bundle(files: SourceFile[], version: string): Promise<BundleResult> {
  const rspackAPI = await importRspackBrowser(version);
  const { builtinMemFs, rspack } = rspackAPI;

  builtinMemFs.volume.reset();

  const inputFileJSON: Record<string, string> = {};
  for (const file of files) {
    inputFileJSON[file.filename] = file.text;
  }
  builtinMemFs.volume.fromJSON(inputFileJSON);

  const configCode = inputFileJSON[RSPACK_CONFIG];
  let options: RspackOptions;
  try {
    options = await loadConfig(configCode, rspackAPI);
  } catch (e) {
    return createBundleFailure([(e as Error).message]);
  }

  const depsPlugin = new DependenciesPlugin();
  options.plugins = [...(options.plugins || []), depsPlugin];

  const startTime = performance.now();
  return new Promise((resolve) => {
    const compiler = rspack(options) as RspackCompiler;
    compiler.run(async (err, stats) => {
      if (err) {
        const endTime = performance.now();
        resolve(createBundleFailure([err.message], endTime - startTime));
        return;
      }

      const endTime = performance.now();
      const output: SourceFile[] = [];
      const formattedOutput: SourceFile[] = [];
      const sourcemaps = new Map<string, string>();
      const fileJSON = builtinMemFs.volume.toJSON() as Record<string, string | undefined>;
      for (const [filename, text] of Object.entries(fileJSON)) {
        if (!text) {
          continue;
        }
        const filenameWithoutPrefixSlash = filename.slice(1);
        if (
          !inputFileJSON[filenameWithoutPrefixSlash] &&
          !filenameWithoutPrefixSlash.includes("rspack.lock")
        ) {
          if (filenameWithoutPrefixSlash.endsWith(".map")) {
            const jsFilename = filename.replace(/\.map$/, "");
            console.log("[Sourcemap] Found sourcemap for:", jsFilename, "length:", text.length);
            sourcemaps.set(jsFilename, text);
          } else {
            output.push({ filename, text });
            if (filenameWithoutPrefixSlash.endsWith(".js")) {
              const formattedText = await format(text);
              formattedOutput.push({ filename, text: formattedText });
            } else {
              formattedOutput.push({ filename, text });
            }
          }
        }
      }

      const filenameComparator = (f1: string, f2: string) =>
        f1.length !== f2.length ? f1.length - f2.length : f1.localeCompare(f2);
      output.sort((a, b) => filenameComparator(a.filename, b.filename));
      formattedOutput.sort((a, b) => filenameComparator(a.filename, b.filename));

      const statsJson = stats?.toJson({
        all: false,
        errors: true,
        warnings: false,
      });

      resolve({
        duration: endTime - startTime,
        output,
        formattedOutput,
        success: true,
        errors: statsJson?.errors?.map((err) => err.message) || [],
        warnings: statsJson?.warnings?.map((warning) => warning.message) || [],
        sourcemaps,
        modules: depsPlugin.extractedModules,
        chunks: depsPlugin.extractedChunks,
        chunkGroups: depsPlugin.extractedChunkGroups,
      });
    });
  });
}
