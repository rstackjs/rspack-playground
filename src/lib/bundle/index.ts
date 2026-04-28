import type { BundleResult, SourceFile } from "@/store/bundler";
import type { BundleWorkerRequest, BundleWorkerResponse } from "./protocol";

let currentBundle: {
  worker: Worker;
  reject: (error: Error) => void;
} | null = null;

function stopCurrentBundle(error: Error) {
  if (!currentBundle) {
    return;
  }

  const { worker, reject } = currentBundle;
  currentBundle = null;
  worker.terminate();
  reject(error);
}

export async function bundle(files: SourceFile[], version: string): Promise<BundleResult> {
  stopCurrentBundle(new Error("Bundle request superseded"));

  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  const request: BundleWorkerRequest = {
    files,
    version,
  };

  return new Promise((resolve, reject) => {
    const bundleState = { worker, reject };
    currentBundle = bundleState;

    const clearCurrentBundle = () => {
      if (currentBundle === bundleState) {
        currentBundle = null;
      }
    };

    worker.onmessage = (event: MessageEvent<BundleWorkerResponse>) => {
      if (currentBundle !== bundleState) {
        return;
      }

      clearCurrentBundle();

      const response = event.data;
      if (response.ok) {
        resolve(response.result);
        return;
      }

      reject(new Error(response.error));
    };

    worker.onerror = (event) => {
      if (currentBundle !== bundleState) {
        return;
      }

      clearCurrentBundle();
      worker.terminate();
      reject(new Error(event.message || "Rspack worker crashed"));
    };

    worker.postMessage(request);
  });
}
