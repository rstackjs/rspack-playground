import { bundle } from "./core";
import type { BundleWorkerRequest, BundleWorkerResponse } from "./protocol";

async function handleBundleRequest(event: MessageEvent<BundleWorkerRequest>) {
  const { files, version } = event.data;

  try {
    const result = await bundle(files, version);
    const response: BundleWorkerResponse = {
      ok: true,
      result,
    };
    self.postMessage(response);
  } catch (error) {
    const response: BundleWorkerResponse = {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to bundle with rspack",
    };
    self.postMessage(response);
  } finally {
    self.close();
  }
}

self.addEventListener("message", handleBundleRequest, { once: true });
