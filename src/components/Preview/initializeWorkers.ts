import type { SourceFile } from "@/store/bundler";

export function initializePreviewWorkers(
  registration: ServiceWorkerRegistration,
  files: SourceFile[],
  signal: AbortSignal,
): Promise<void> {
  const initialized = new WeakMap<ServiceWorker, Promise<void>>();

  function waitToInit(worker: ServiceWorker): Promise<void> {
    const existing = initialized.get(worker);
    if (existing) return existing;

    const ready = new Promise<void>((resolve, reject) => {
      function cleanup() {
        worker.removeEventListener("statechange", handleStateChange);
        signal.removeEventListener("abort", handleAbort);
      }

      function handleAbort() {
        cleanup();
        reject(new DOMException("The preview was closed.", "AbortError"));
      }

      function handleStateChange() {
        if (signal.aborted) {
          handleAbort();
        } else if (worker.state === "activated") {
          cleanup();
          try {
            worker.postMessage({ type: "init", files, scope: "/preview/" });
            resolve();
          } catch (error) {
            reject(error);
          }
        } else if (worker.state === "redundant") {
          cleanup();
          reject(new Error("The preview worker could not be activated."));
        }
      }

      worker.addEventListener("statechange", handleStateChange);
      signal.addEventListener("abort", handleAbort, { once: true });
      handleStateChange();
    });
    initialized.set(worker, ready);
    return ready;
  }

  function handleUpdateFound() {
    for (const worker of [registration.active, registration.installing, registration.waiting]) {
      if (worker) {
        // A failed replacement must not interrupt a preview served by the active worker.
        void waitToInit(worker).catch(() => {});
      }
    }
  }

  if (signal.aborted) {
    return Promise.reject(new DOMException("The preview was closed.", "AbortError"));
  }

  const worker = registration.active ?? registration.installing ?? registration.waiting;
  if (!worker) {
    return Promise.reject(new Error("No preview worker is available."));
  }

  registration.addEventListener("updatefound", handleUpdateFound, { signal });
  const ready = waitToInit(worker);
  handleUpdateFound();
  return ready;
}
