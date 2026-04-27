import type { BundleResult, SourceFile } from "@/store/bundler";
import type { BundleWorkerRequest, BundleWorkerResponse } from "./protocol";

let nextRequestId = 0;
let bundleWorker: Worker | null = null;

const pendingRequests = new Map<
  number,
  {
    resolve: (result: BundleResult) => void;
    reject: (error: Error) => void;
  }
>();

function rejectPendingRequests(error: Error) {
  for (const { reject } of pendingRequests.values()) {
    reject(error);
  }
  pendingRequests.clear();
}

function ensureWorker() {
  if (bundleWorker) {
    return bundleWorker;
  }

  bundleWorker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });

  bundleWorker.onmessage = (event: MessageEvent<BundleWorkerResponse>) => {
    const response = event.data;
    const pending = pendingRequests.get(response.id);
    if (!pending) {
      return;
    }

    pendingRequests.delete(response.id);
    if (response.ok) {
      pending.resolve(response.result);
      return;
    }

    pending.reject(new Error(response.error));
  };

  bundleWorker.onerror = (event) => {
    const error = new Error(event.message || "Rspack worker crashed");
    rejectPendingRequests(error);
    bundleWorker?.terminate();
    bundleWorker = null;
  };

  return bundleWorker;
}

function resetWorker(error: Error) {
  rejectPendingRequests(error);
  bundleWorker?.terminate();
  bundleWorker = null;
}

export async function bundle(files: SourceFile[], version: string): Promise<BundleResult> {
  resetWorker(new Error("Bundle request superseded by a newer request"));

  const worker = ensureWorker();
  const id = nextRequestId++;

  const request: BundleWorkerRequest = {
    id,
    files,
    version,
  };

  return new Promise((resolve, reject) => {
    pendingRequests.set(id, {
      resolve,
      reject,
    });
    worker.postMessage(request);
  });
}
