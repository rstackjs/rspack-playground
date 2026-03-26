import type { RspackOptions } from "@rspack/browser";
import { format } from "@/lib/format";
import type { BundleResult, SourceFile } from "@/store/bundler";
import { RSPACK_CONFIG } from "@/store/common";
import { DependenciesPlugin } from "./dependency";

type RspackBrowserAPI = typeof import("@rspack/browser");
interface RspackBrowserPackageManifest {
  dependencies?: Record<string, string>;
}

interface RspackBrowserRemoteEntryUrls {
  entryModuleUrl: string;
}

const rspackModulePromises = new Map<string, Promise<RspackBrowserAPI>>();
const rspackEntryPromises = new Map<
  string,
  Promise<RspackBrowserRemoteEntryUrls>
>();
const rspackManifestPromises = new Map<
  string,
  Promise<RspackBrowserPackageManifest>
>();

function createBundleFailure(
  errors: string[],
  duration = 0,
): BundleResult {
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
  return `https://cdn.jsdelivr.net/npm/@rspack/browser@${encodeURIComponent(version)}/dist/rspack.wasm32-wasi.wasm`;
}

function getRspackBrowserBaseUrl(version: string) {
  return `https://cdn.jsdelivr.net/npm/@rspack/browser@${encodeURIComponent(version)}`;
}

function getRspackBrowserFileUrl(version: string, filePath: string) {
  return `${getRspackBrowserBaseUrl(version)}/${filePath}`;
}

function getJsdelivrEsmUrl(
  packageName: string,
  version: string,
  subpath?: string,
) {
  const suffix = subpath ? `/${subpath}` : "";
  return `https://cdn.jsdelivr.net/npm/${packageName}@${encodeURIComponent(version)}${suffix}/+esm`;
}

async function fetchRemoteText(url: string) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function fetchRemoteJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
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

function createBlobModuleUrl(source: string) {
  return URL.createObjectURL(
    new Blob([source], { type: "text/javascript;charset=utf-8" }),
  );
}

async function getRspackBrowserManifest(
  version: string,
): Promise<RspackBrowserPackageManifest> {
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

async function getRspackBrowserEntryUrls(
  version: string,
): Promise<RspackBrowserRemoteEntryUrls> {
  const cachedEntry = rspackEntryPromises.get(version);
  if (cachedEntry) {
    return cachedEntry;
  }

  const entryPromise = (async () => {
    const manifest = await getRspackBrowserManifest(version);
    const liteTapableVersion =
      manifest.dependencies?.["@rspack/lite-tapable"] ?? "";
    const wasmRuntimeVersion =
      manifest.dependencies?.["@napi-rs/wasm-runtime"] ?? "";

    if (!liteTapableVersion || !wasmRuntimeVersion) {
      throw new Error(
        `Rspack browser ${version} is missing published dependency metadata`,
      );
    }

    const browserEntryUrl = getRspackBrowserFileUrl(version, "dist/index.js");
    const browserRuntimeUrl = getRspackBrowserFileUrl(
      version,
      "dist/rslib-runtime.js",
    );
    const browserWasiUrl = getRspackBrowserFileUrl(
      version,
      "dist/rspack.wasi-browser.js",
    );
    const browserWorkerUrl = getRspackBrowserFileUrl(
      version,
      "dist/wasi-worker-browser.mjs",
    );

    const [entrySource, runtimeSource, wasiSource, workerSource] =
      await Promise.all([
        fetchRemoteText(browserEntryUrl),
        fetchRemoteText(browserRuntimeUrl),
        fetchRemoteText(browserWasiUrl),
        fetchRemoteText(browserWorkerUrl),
      ]);

    const runtimeModuleUrl = createBlobModuleUrl(runtimeSource);
    const workerModuleUrl = createBlobModuleUrl(workerSource);
    const wasmUrl = getRspackBrowserUrl(version);

    let rewrittenWasiSource = replaceRequiredImportSource(
      wasiSource,
      "@napi-rs/wasm-runtime",
      getJsdelivrEsmUrl(
        "@napi-rs/wasm-runtime",
        wasmRuntimeVersion,
      ),
      "@napi-rs/wasm-runtime import",
    );
    rewrittenWasiSource = replaceRequiredImportSource(
      rewrittenWasiSource,
      "@napi-rs/wasm-runtime/fs",
      getJsdelivrEsmUrl(
        "@napi-rs/wasm-runtime",
        wasmRuntimeVersion,
        "fs",
      ),
      "@napi-rs/wasm-runtime/fs import",
    );
    rewrittenWasiSource = replaceRequired(
      rewrittenWasiSource,
      /window\.RSPACK_WASM_URL\s*\|\|\s*new URL\((["'])\.\/rspack\.wasm32-wasi\.wasm\1,\s*import\.meta\.url\)\.href/g,
      JSON.stringify(wasmUrl),
      "rspack wasm url",
    );
    rewrittenWasiSource = replaceRequired(
      rewrittenWasiSource,
      /new URL\((["'])\.\/wasi-worker-browser\.mjs\1,\s*import\.meta\.url\)/g,
      JSON.stringify(workerModuleUrl),
      "rspack worker url",
    );

    const wasiModuleUrl = createBlobModuleUrl(rewrittenWasiSource);

    let rewrittenEntrySource = replaceRequiredImportSource(
      entrySource,
      "./rspack.wasi-browser.js",
      wasiModuleUrl,
      "rspack.wasi-browser import",
    );
    rewrittenEntrySource = replaceRequiredImportSource(
      rewrittenEntrySource,
      "./rslib-runtime.js",
      runtimeModuleUrl,
      "rslib runtime import",
    );
    rewrittenEntrySource = replaceRequiredImportSource(
      rewrittenEntrySource,
      "@rspack/lite-tapable",
      getJsdelivrEsmUrl(
        "@rspack/lite-tapable",
        liteTapableVersion,
      ),
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

async function loadConfig(
  content: string,
  rspackAPI: RspackBrowserAPI,
): Promise<RspackOptions> {
  function requireRspack(name: string) {
    if (name === "@rspack/core" || name === "@rspack/browser") {
      return rspackAPI;
    }
    throw new Error(
      "Only support for importing '@rspack/core' or '@rspack/browser",
    );
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

export async function bundle(
  files: SourceFile[],
  version: string,
): Promise<BundleResult> {
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
    rspack(options, async (err, stats) => {
      if (err) {
        const endTime = performance.now();
        resolve(createBundleFailure([err.message], endTime - startTime));
        return;
      }

      const endTime = performance.now();
      const output: SourceFile[] = [];
      const formattedOutput: SourceFile[] = [];
      const sourcemaps = new Map<string, string>();
      const fileJSON = builtinMemFs.volume.toJSON() as Record<
        string,
        string | undefined
      >;
      for (const [filename, text] of Object.entries(fileJSON)) {
        if (!text) {
          continue;
        }
        // Reguard all new files as output files
        const filenameWithoutPrefixSlash = filename.slice(1);
        if (
          !inputFileJSON[filenameWithoutPrefixSlash] &&
          !filenameWithoutPrefixSlash.includes("rspack.lock")
        ) {
          // Extract sourcemap files separately
          if (filenameWithoutPrefixSlash.endsWith(".map")) {
            // Map from the original JS filename to sourcemap content
            const jsFilename = filename.replace(/\.map$/, "");
            console.log(
              "[Sourcemap] Found sourcemap for:",
              jsFilename,
              "length:",
              text.length,
            );
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
      formattedOutput.sort((a, b) =>
        filenameComparator(a.filename, b.filename),
      );

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
