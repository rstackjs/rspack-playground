import { atom } from "jotai";
import { bundle } from "@/lib/bundle";
import type {
  RspackChunkGroupInfo,
  RspackChunkInfo,
  RspackModuleDeps,
} from "@/lib/bundle/dependency";
import { deserializeShareData } from "@/lib/share";
import { activeOutputFileAtom } from "./editor";
import { getPresetFiles, PresetBasicLibrary } from "./presets";
import { getSafeInitRspackVersion, rspackVersionAtom } from "./version";

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

function createBundleFailure(message: string): BundleResult {
  return {
    duration: 0,
    output: [],
    formattedOutput: [],
    success: false,
    errors: [message],
    warnings: [],
    sourcemaps: new Map(),
    modules: [],
    chunks: [],
    chunkGroups: [],
  };
}

function getInitFiles() {
  const hash = window.location.hash.slice(1);
  if (hash) {
    const shareData = deserializeShareData(hash);
    if (shareData) {
      return shareData.inputFiles;
    }
  }
  return getPresetFiles(PresetBasicLibrary, getSafeInitRspackVersion());
}

// Bundle
export const bindingLoadedAtom = atom<string | null>(null);
export const bindingLoadingAtom = atom(false);
export const isBundlingAtom = atom(false);
export const latestBundleRequestIdAtom = atom(0);
export const inputFilesAtom = atom<SourceFile[]>(getInitFiles());
export const bundleResultAtom = atom<BundleResult | null>(null);
export const enableFormatCode = atom(true);

export const bundleActionAtom = atom(
  null,
  async (
    get,
    set,
    { files, versionOverride }: { files: SourceFile[]; versionOverride?: string },
  ) => {
    const requestId = get(latestBundleRequestIdAtom) + 1;
    set(latestBundleRequestIdAtom, requestId);

    const targetVersion = versionOverride ?? (await get(rspackVersionAtom));
    const shouldLoadBinding = get(bindingLoadedAtom) !== targetVersion;
    const isLatestRequest = () => requestId === get(latestBundleRequestIdAtom);

    set(isBundlingAtom, true);
    if (shouldLoadBinding) {
      set(bindingLoadingAtom, true);
    }

    try {
      const result = await bundle(files, targetVersion);
      if (!isLatestRequest()) {
        return;
      }

      set(bundleResultAtom, result);

      if (shouldLoadBinding) {
        set(bindingLoadedAtom, targetVersion);
      }

      const activeOutputFile = get(activeOutputFileAtom);
      if (result.output.length > 0 && activeOutputFile >= result.output.length) {
        set(activeOutputFileAtom, 0);
      }
    } catch (error) {
      if (!isLatestRequest()) {
        return;
      }

      const message = error instanceof Error ? error.message : "Failed to load rspack binding";
      set(bundleResultAtom, createBundleFailure(message));
    } finally {
      if (isLatestRequest()) {
        set(bindingLoadingAtom, false);
        set(isBundlingAtom, false);
      }
    }
  },
);
