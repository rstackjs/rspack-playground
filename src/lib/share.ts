import type { SourceFile } from "@/store/bundler";
import { RSPACK_CONFIG } from "@/store/common";

const WEBPACK_REPL_URL = "https://webpack-repl.vercel.app/";
const ESBUILD_REPL_URL = "https://esbuild.github.io/try/";
const ROLLUP_REPL_URL = "https://rollupjs.org/repl/";

const SCRIPT_FILE_PATTERN = /\.[cm]?[jt]sx?$/i;
const CONVENTIONAL_ENTRY_PATTERNS = [
  /^src\/main\.[cm]?[jt]sx?$/i,
  /^src\/index\.[cm]?[jt]sx?$/i,
  /^main\.[cm]?[jt]sx?$/i,
  /^index\.[cm]?[jt]sx?$/i,
  /^entry\.[cm]?[jt]sx?$/i,
];

export interface ShareData {
  rspackVersion: string;
  inputFiles: SourceFile[];
}

const encodeBase64 = (value: string): string => {
  const utf8Bytes = new TextEncoder().encode(value);
  let binaryString = "";
  for (const byte of utf8Bytes) {
    binaryString += String.fromCharCode(byte);
  }
  return btoa(binaryString);
};

const normalizeReplFilename = (filename: string): string =>
  filename
    .replace(/\\/g, "/")
    .replace(/^(?:\.\/)+/, "")
    .replace(/^\/+/, "");

const withoutRspackConfig = (inputFiles: SourceFile[]): SourceFile[] =>
  inputFiles.filter(({ filename }) => normalizeReplFilename(filename) !== RSPACK_CONFIG);

const getStaticRspackEntryFilenames = (inputFiles: SourceFile[]): Set<string> => {
  const config = inputFiles.find(
    ({ filename }) => normalizeReplFilename(filename) === RSPACK_CONFIG,
  );
  if (!config) {
    return new Set();
  }

  const entryValue = config.text.match(/\bentry\s*:\s*(["'`])([^"'`]+)\1/);
  const entryCollection = config.text.match(/\bentry\s*:\s*(?:\{([\s\S]*?)\}|\[([\s\S]*?)\])/);
  const entryCollectionText = entryCollection?.[1] ?? entryCollection?.[2];
  const entryFilenames = entryValue
    ? [entryValue[2]]
    : Array.from(entryCollectionText?.matchAll(/(["'`])([^"'`]+)\1/g) ?? [], (match) =>
        normalizeReplFilename(match[2]),
      );
  const availableFilenames = new Set(
    inputFiles.map(({ filename }) => normalizeReplFilename(filename)),
  );

  return new Set(
    entryFilenames
      .map((filename) => normalizeReplFilename(filename))
      .filter((filename) => SCRIPT_FILE_PATTERN.test(filename) && availableFilenames.has(filename)),
  );
};

const getReplEntryFilenames = (inputFiles: SourceFile[]): Set<string> => {
  const staticEntries = getStaticRspackEntryFilenames(inputFiles);
  if (staticEntries.size > 0) {
    return staticEntries;
  }

  const scriptFilenames = inputFiles
    .map(({ filename }) => normalizeReplFilename(filename))
    .filter((filename) => filename !== RSPACK_CONFIG && SCRIPT_FILE_PATTERN.test(filename));

  for (const pattern of CONVENTIONAL_ENTRY_PATTERNS) {
    const entryFilename = scriptFilenames.find((filename) => pattern.test(filename));
    if (entryFilename) {
      return new Set([entryFilename]);
    }
  }

  return new Set(scriptFilenames.slice(0, 1));
};

// Share functionality
// Use Unicode-safe base64 encoding to support Chinese and other non-Latin1 characters
export const serializeShareData = (data: ShareData): string => {
  const jsonString = JSON.stringify({
    rspackVersion: data.rspackVersion,
    inputFiles: data.inputFiles.map(({ filename, text }) => ({ filename, text })),
  });
  return encodeBase64(jsonString);
};

export const deserializeShareData = (base64: string): ShareData | null => {
  try {
    // Decode base64 to binary string, then to UTF-8 bytes
    const binaryString = atob(base64);
    const utf8Bytes = Uint8Array.from(binaryString, (char) => char.charCodeAt(0));
    const json = new TextDecoder().decode(utf8Bytes);
    const data = JSON.parse(json);

    // Validate the data structure
    if (
      typeof data === "object" &&
      typeof data.rspackVersion === "string" &&
      Array.isArray(data.inputFiles)
    ) {
      return data;
    }
    return null;
  } catch (error) {
    console.error("Failed to deserialize share data:", error);
    return null;
  }
};

export const getShareUrl = (data: ShareData): string => {
  const base64 = serializeShareData(data);
  return `${window.location.origin}${window.location.pathname}#${base64}`;
};

export const getWebpackReplUrl = (data: ShareData): string =>
  `${WEBPACK_REPL_URL}#${serializeShareData(data)}`;

export const getEsbuildReplUrl = (data: ShareData): string => {
  const entryFilenames = getReplEntryFilenames(data.inputFiles);
  const payload = ["b", "latest", "--bundle\n--format=esm\n--outdir=out"];

  for (const { filename, text } of withoutRspackConfig(data.inputFiles)) {
    const replFilename = normalizeReplFilename(filename);
    payload.push(entryFilenames.has(replFilename) ? "e" : "", replFilename, text);
  }

  return `${ESBUILD_REPL_URL}#${encodeBase64(payload.join("\0")).replace(/=+$/, "")}`;
};

export const getRollupReplUrl = (data: ShareData): string => {
  const entryFilenames = getReplEntryFilenames(data.inputFiles);
  const modules = withoutRspackConfig(data.inputFiles).map(({ filename, text }) => {
    const replFilename = normalizeReplFilename(filename);
    return {
      code: text,
      isEntry: entryFilenames.has(replFilename),
      name: replFilename,
    };
  });

  // The Rollup REPL always uses the first module as an entry module.
  modules.sort((a, b) => Number(b.isEntry) - Number(a.isEntry));

  const json = JSON.stringify({
    example: "",
    modules,
    options: {},
  });
  const asciiJson = json.replace(
    /[\u0080-\uFFFF]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
  const shareable = btoa(asciiJson).replace(/\//g, "_").replace(/\+/g, "-");

  return `${ROLLUP_REPL_URL}?shareable=${shareable}`;
};
