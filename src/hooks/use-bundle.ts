import { useAtom, useSetAtom, useStore } from "jotai";
import { useCallback } from "react";
import { bundle } from "@/lib/bundle";
import {
  type BundleResult,
  bindingLoadedAtom,
  bindingLoadingAtom,
  bundleResultAtom,
  isBundlingAtom,
  latestBundleRequestIdAtom,
  type SourceFile,
} from "@/store/bundler";
import { activeOutputFileAtom } from "@/store/editor";
import { rspackVersionAtom } from "@/store/version";

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

export default function useBundle() {
  const [bindingLoadedVersion, setBindingLoadedVersion] = useAtom(bindingLoadedAtom);
  const setBindingLoading = useSetAtom(bindingLoadingAtom);

  const setIsBundling = useSetAtom(isBundlingAtom);
  const setBundleResult = useSetAtom(bundleResultAtom);
  const [activeOutputFile, setActiveOutputFile] = useAtom(activeOutputFileAtom);
  const [rspackVersion] = useAtom(rspackVersionAtom);
  const store = useStore();

  const handleBundle = useCallback(
    async (files: SourceFile[], versionOverride?: string) => {
      const requestId = store.get(latestBundleRequestIdAtom) + 1;
      store.set(latestBundleRequestIdAtom, requestId);
      const targetVersion = versionOverride ?? rspackVersion;
      const shouldLoadBinding = bindingLoadedVersion !== targetVersion;
      const isLatestRequest = () => requestId === store.get(latestBundleRequestIdAtom);

      setIsBundling(true);
      if (shouldLoadBinding) {
        setBindingLoading(true);
      }

      try {
        const result = await bundle(files, targetVersion);
        if (!isLatestRequest()) {
          return;
        }

        setBundleResult(result);

        if (shouldLoadBinding) {
          setBindingLoadedVersion(targetVersion);
        }

        if (result.output.length > 0 && activeOutputFile >= result.output.length) {
          setActiveOutputFile(0);
        }
      } catch (error) {
        if (!isLatestRequest()) {
          return;
        }

        const message = error instanceof Error ? error.message : "Failed to load rspack binding";
        setBundleResult(createBundleFailure(message));
      } finally {
        if (isLatestRequest()) {
          setBindingLoading(false);
          setIsBundling(false);
        }
      }
    },
    [
      activeOutputFile,
      bindingLoadedVersion,
      rspackVersion,
      setActiveOutputFile,
      setIsBundling,
      setBundleResult,
      setBindingLoadedVersion,
      setBindingLoading,
      store,
    ],
  );

  return handleBundle;
}
