import { atom } from "jotai";
import { atomWithStorage, createJSONStorage } from "jotai/utils";
import { toast } from "sonner";
import { bundle } from "@/lib/bundle";
import { restoreHistory, saveHistory } from "@/lib/history";
import type {
  RspackChunkGroupInfo,
  RspackChunkInfo,
  RspackModuleDeps,
} from "@/lib/bundle/dependency";
import { deserializeShareData } from "@/lib/share";
import { activeInputFileAtom, activeOutputFileAtom } from "./editor";
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

function areSourceFilesEqual(left: SourceFile[], right: SourceFile[]) {
  return (
    left.length === right.length &&
    left.every(
      (file, index) => file.filename === right[index]?.filename && file.text === right[index]?.text,
    )
  );
}

// Bundle
export const bindingLoadedAtom = atom<string | null>(null);
export const bindingLoadingAtom = atom(false);
export const isBundlingAtom = atom(false);
export const latestBundleRequestIdAtom = atom(0);
export const inputFilesAtom = atom<SourceFile[]>(getInitFiles());
const currentProjectIdJsonStorage = createJSONStorage<number | null>();
// Another tab must not switch this tab's active project without restoring its files.
const currentProjectIdStorage = {
  getItem: currentProjectIdJsonStorage.getItem,
  setItem: currentProjectIdJsonStorage.setItem,
  removeItem: currentProjectIdJsonStorage.removeItem,
};
export const currentProjectIdAtom = atomWithStorage<number | null>(
  "rspack-playground-current-project-id",
  null,
  currentProjectIdStorage,
  { getOnInit: true },
);
const projectInitializedAtom = atom(false);
export const bundleResultAtom = atom<BundleResult | null>(null);
export const enableFormatCode = atom(true);

export const bundleActionAtom = atom(
  null,
  async (
    get,
    set,
    { files, versionOverride }: { files: SourceFile[]; versionOverride?: string },
  ) => {
    if (files !== get(inputFilesAtom)) {
      return;
    }

    const requestId = get(latestBundleRequestIdAtom) + 1;
    set(latestBundleRequestIdAtom, requestId);

    const projectId = get(currentProjectIdAtom);
    const targetVersion = versionOverride ?? (await get(rspackVersionAtom));
    const shouldLoadBinding = get(bindingLoadedAtom) !== targetVersion;
    const isLatestRequest = () => requestId === get(latestBundleRequestIdAtom);

    set(isBundlingAtom, true);
    if (shouldLoadBinding) {
      set(bindingLoadingAtom, true);
    }

    let bundleResultPublished = false;
    try {
      const result = await bundle(files, targetVersion);
      if (!isLatestRequest()) {
        return;
      }

      set(bundleResultAtom, result);

      if (shouldLoadBinding) {
        set(bindingLoadedAtom, targetVersion);
      }

      if (!isLatestRequest()) {
        return;
      }

      set(bindingLoadingAtom, false);
      set(isBundlingAtom, false);
      bundleResultPublished = true;

      const liveProjectId = get(currentProjectIdAtom);
      if (projectId === null || liveProjectId === projectId) {
        const projectIdForSave = projectId === null ? liveProjectId : projectId;
        try {
          const snapshot = await saveHistory(projectIdForSave, files, targetVersion);
          if (get(currentProjectIdAtom) === projectIdForSave) {
            set(currentProjectIdAtom, snapshot.id);
          }
        } catch (error) {
          console.error("Failed to save project history:", error);
          toast.error("Failed to save project history");
        }
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
      if (isLatestRequest() && !bundleResultPublished) {
        set(bindingLoadingAtom, false);
        set(isBundlingAtom, false);
      }
    }
  },
);

export const initializeProjectAtom = atom(null, async (get, set) => {
  if (get(projectInitializedAtom)) {
    return;
  }
  set(projectInitializedAtom, true);

  let files = get(inputFilesAtom);
  let versionOverride: string | undefined;
  const projectId = get(currentProjectIdAtom);
  const initialRequestId = get(latestBundleRequestIdAtom);
  const hash = window.location.hash.slice(1);
  const shareData = hash ? deserializeShareData(hash) : null;

  if (projectId !== null) {
    try {
      const restored = await restoreHistory(projectId);
      if (
        get(latestBundleRequestIdAtom) !== initialRequestId ||
        get(currentProjectIdAtom) !== projectId
      ) {
        return;
      }

      const shareDataMatchesProject =
        !shareData ||
        (shareData.rspackVersion === restored.rspackVersion &&
          areSourceFilesEqual(shareData.inputFiles, restored.files));

      if (shareDataMatchesProject) {
        files = restored.files;
        versionOverride = restored.rspackVersion;
        set(activeInputFileAtom, 0);
        set(inputFilesAtom, restored.files);
        set(rspackVersionAtom, restored.rspackVersion);
      } else {
        set(currentProjectIdAtom, null);
      }
    } catch (error) {
      if (
        get(latestBundleRequestIdAtom) !== initialRequestId ||
        get(currentProjectIdAtom) !== projectId
      ) {
        return;
      }

      console.warn("Failed to restore the persisted project; starting a new project:", error);
      set(currentProjectIdAtom, null);
    }
  }

  await set(bundleActionAtom, { files, versionOverride });
});
