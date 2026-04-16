import { atom } from "jotai";
import type {
  RspackChunkGroupInfo,
  RspackChunkInfo,
  RspackModuleDeps,
} from "@/lib/bundle/dependency";
import { deserializeShareData } from "@/lib/share";
import { getPresetFiles, PresetBasicLibrary } from "./presets";
import { getSafeInitRspackVersion } from "./version";

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
