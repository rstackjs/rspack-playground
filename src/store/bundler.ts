import { atom } from "jotai";
import rspackBrowserPackage from "@rspack/browser/package.json";
import type {
  RspackChunkInfo,
  RspackChunkGroupInfo,
  RspackModuleDeps,
} from "@/lib/bundle/dependency";
import { deserializeShareData } from "@/lib/share";
import {
  getPresetFiles,
  PresetBasicLibrary,
} from "./presets";

export interface SourceFile {
  filename: string;
  text: string;
}

export interface BundleResult {
  success: boolean;
  output: SourceFile[];
  formattedOutput: SourceFile[];
  duration: number;
  errors: string[];
  warnings: string[];
  sourcemaps: Map<string, string>; // output filename -> sourcemap JSON
  modules: RspackModuleDeps[]; // dependency data
  chunks: RspackChunkInfo[]; // chunk graph data
  chunkGroups: RspackChunkGroupInfo[]; // chunk group graph data
}

function getInitFiles() {
  const hash = window.location.hash.slice(1);
  if (hash) {
    const shareData = deserializeShareData(hash);
    if (shareData) {
      return shareData.inputFiles;
    }
  }
  return getPresetFiles(
    PresetBasicLibrary,
    getInitRspackVersion() ?? rspackBrowserPackage.version,
  );
}

// Bundle
export const bindingLoadedAtom = atom<string | null>(null);
export const bindingLoadingAtom = atom(false);
export const isBundlingAtom = atom(false);
export const inputFilesAtom = atom<SourceFile[]>(getInitFiles());
export const bundleResultAtom = atom<BundleResult | null>(null);
export const enableFormatCode = atom(true);

// Version
export const availableVersionsAtom = atom(async () => {
  const res = await fetch("https://registry.npmjs.org/@rspack/browser");
  const data = await res.json();
  return Object.keys(data.versions).sort((a, b) => {
    return b.localeCompare(a, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
});

function getInitRspackVersion() {
  const hash = window.location.hash.slice(1);
  if (hash) {
    const shareData = deserializeShareData(hash);
    if (shareData) {
      return shareData.rspackVersion;
    }
  }
}

const defaultRspackVersionAtom = atom(async (get) => {
  const versions = await get(availableVersionsAtom);
  return (
    getInitRspackVersion() ??
    (versions.includes(rspackBrowserPackage.version)
      ? rspackBrowserPackage.version
      : versions[0] ?? "")
  );
});
const overwrittenRspackVersionAtom = atom<string | null>(null);
export const rspackVersionAtom = atom(
  (get) => {
    const overwritten = get(overwrittenRspackVersionAtom);
    if (overwritten) return overwritten;
    return get(defaultRspackVersionAtom);
  },
  (_, set, newVersion: string) => {
    set(overwrittenRspackVersionAtom, newVersion);
  },
);
