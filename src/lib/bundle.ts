import * as rspackAPI from "@rspack/browser";
import {
  builtinMemFs,
  experiments,
  type RspackOptions,
  rspack,
} from "@rspack/browser";
import type { BundleResult, SourceFile } from "@/store/bundler";
import { RSPACK_CONFIG } from "@/store/common";
import { format } from "./format";

async function loadConfig(content: string): Promise<RspackOptions> {
  function requireRspack(name: string) {
    if (name === "@rspack/core" || name === "@rspack/browser") {
      return rspackAPI;
    }
    throw new Error(
      "Only support for importing '@rspack/core' or '@rspack/browser"
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
    };
  }

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
              text.length
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
        filenameComparator(a.filename, b.filename)
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
      });
    });
  });
}
