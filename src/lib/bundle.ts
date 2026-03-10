import * as rspackAPI from "@rspack/browser";
import {
  builtinMemFs,
  experiments,
  type RspackOptions,
  rspack,
} from "@rspack/browser";
import type {
  BundleResult,
  RspackDependency,
  RspackModuleDeps,
  SourceFile,
} from "@/store/bundler";
import { RSPACK_CONFIG } from "@/store/common";
import { format } from "./format";

/**
 * Safely serialize a dependency/block object from rspack internals.
 * Handles circular references, functions, and huge internal objects.
 */
function getRawData(obj: any): any {
  const seen = new WeakSet();

  const serialize = (val: any): any => {
    if (val === null || val === undefined) return val;
    if (typeof val !== "object" && typeof val !== "function") return val;
    if (typeof val === "function") return undefined;
    if (seen.has(val)) return "[Circular]";
    seen.add(val);

    if (Array.isArray(val)) return val.map(serialize);
    if (val instanceof Set) return Array.from(val).map(serialize);
    if (val instanceof Map) {
      const o: Record<string, any> = {};
      for (const [k, v] of val) o[String(k)] = serialize(v);
      return o;
    }

    const result: Record<string, any> = {};
    const allKeys = new Set<string>();
    let cur = val;
    while (cur && cur !== Object.prototype) {
      for (const key of Object.getOwnPropertyNames(cur)) allKeys.add(key);
      cur = Object.getPrototypeOf(cur);
    }

    for (const key of allKeys) {
      if (key === "constructor" || key.startsWith("_") || key === "compilation") continue;
      try {
        const v = val[key];
        if (typeof v === "function") continue;
        result[key] = serialize(v);
      } catch {
        // skip inaccessible properties
      }
    }
    return result;
  };

  return serialize(obj);
}

async function loadConfig(content: string): Promise<RspackOptions> {
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

  const cjsContent = await experiments.swc.transform(content, {
    module: { type: "commonjs" },
  });

  const wrapper = new Function("module", "exports", "require", cjsContent.code);
  wrapper(module, exports, requireRspack);
  return exports.default as RspackOptions;
}

export async function bundle(files: SourceFile[]): Promise<BundleResult> {
  builtinMemFs.volume.reset();

  const inputFileJSON: Record<string, string> = {};
  for (const file of files) {
    inputFileJSON[file.filename] = file.text;
  }
  builtinMemFs.volume.fromJSON(inputFileJSON);

  const configCode = inputFileJSON[RSPACK_CONFIG];
  let options: rspackAPI.RspackOptions;
  try {
    options = await loadConfig(configCode);
  } catch (e) {
    return {
      duration: 0,
      output: [],
      formattedOutput: [],
      success: false,
      errors: [(e as Error).message],
      warnings: [],
      sourcemaps: new Map(),
      modules: [],
    };
  }

  // Inject a plugin to extract dependency data from the compilation
  let extractedModules: RspackModuleDeps[] = [];

  function extractDep(dep: any, moduleGraph: any): RspackDependency {
    const raw = getRawData(dep);
    try {
      const target = moduleGraph?.getModule?.(dep);
      if (target) {
        const targetPath = target.resource || target.identifier?.() || "";
        raw.targetModule = targetPath;
        // Strip leading slash to match input file tab names
        raw.targetModuleName = targetPath.startsWith("/")
          ? targetPath.slice(1)
          : targetPath;
      }
    } catch { /* ignore */ }
    return raw;
  }

  const depsPlugin = {
    apply(compiler: any) {
      compiler.hooks.compilation.tap("DepsExtractor", (compilation: any) => {
        compilation.hooks.optimizeChunkModules.tap(
          "DepsExtractor",
          () => {
            try {
              const modules = compilation.modules;
              const moduleGraph = compilation.moduleGraph;
              if (!modules) return;

              extractedModules = [...modules].map((mod: any) => {
                const modulePath = mod.resource || mod.identifier?.() || "";

                const deps: RspackDependency[] = (mod.dependencies || []).map(
                  (dep: any) => extractDep(dep, moduleGraph),
                );

                const presentationalDeps: RspackDependency[] = (mod.presentationalDependencies || []).map(
                  (dep: any) => extractDep(dep, moduleGraph),
                );

                const blocks: any[] = (mod.blocks || []).map((block: any) => {
                  const serialized = getRawData(block);
                  serialized.dependencies = (block.dependencies || []).map(
                    (dep: any) => extractDep(dep, moduleGraph),
                  );
                  return serialized;
                });

                return {
                  path: modulePath,
                  name: modulePath,
                  deps,
                  presentationalDeps,
                  blocks,
                };
              });
            } catch (e) {
              console.warn("[DepsExtractor] Failed to extract deps:", e);
            }
          },
        );
      });
    },
  };

  options.plugins = [...(options.plugins || []), depsPlugin];

  const startTime = performance.now();
  return new Promise((resolve) => {
    rspack(options, async (err, stats) => {
      if (err) {
        const endTime = performance.now();
        resolve({
          duration: endTime - startTime,
          output: [],
          formattedOutput: [],
          success: false,
          errors: [err.message],
          warnings: [],
          sourcemaps: new Map(),
          modules: [],
        });
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
        modules: extractedModules,
      });
    });
  });
}
