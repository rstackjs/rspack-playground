import { bundle } from "./core";
import type { BundleWorkerRequest, BundleWorkerResponse } from "./protocol";

self.onmessage = async (event: MessageEvent<BundleWorkerRequest>) => {
  const { id, files, version } = event.data;

  try {
    const result = await bundle(files, version);
    const response: BundleWorkerResponse = {
      id,
      ok: true,
      result,
    };
    self.postMessage(response);
  } catch (error) {
    const response: BundleWorkerResponse = {
      id,
      ok: false,
      error: error instanceof Error ? error.message : "Failed to bundle with rspack",
    };
    self.postMessage(response);
  }
};
