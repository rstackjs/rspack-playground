import { useAtomValue } from "jotai";
import { Play, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { bundleResultAtom, type SourceFile } from "@/store/bundler";
import { initializePreviewWorkers } from "./initializeWorkers";

interface PreviewFrameProps {
  files: SourceFile[];
}

function PreviewFrame(props: PreviewFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const files = props.files;
  const entry = getEntry(files);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    async function disposeServiceWorker() {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const previewScope = new URL("/preview/", window.location.href).href;
      await Promise.all(
        registrations
          .filter((registration) => registration.scope === previewScope)
          .map((registration) => registration.unregister()),
      );
    }

    async function registerServiceWorker() {
      await disposeServiceWorker();
      if (signal.aborted) return;

      const registration = await navigator.serviceWorker.register("/preview/service-worker.js", {
        scope: "/preview/",
      });

      await initializePreviewWorkers(registration, files, signal);
    }

    const iframe = iframeRef.current;
    if (iframe?.contentWindow && entry?.filename) {
      const iframeWindow = iframe.contentWindow;
      registerServiceWorker()
        .then(() => {
          if (signal.aborted) return;
          const name = entry.filename.startsWith("/") ? entry.filename.slice(1) : entry.filename;
          iframeWindow.location = `/preview/${name}`;
        })
        .catch((error: unknown) => {
          if (!signal.aborted) {
            toast.error("Unable to start preview", {
              description: error instanceof Error ? error.message : "Please try again.",
            });
          }
        });
    }

    return () => {
      controller.abort();
      disposeServiceWorker();
    };
  }, [files, entry]);

  return (
    <iframe
      title="Project preview"
      className="h-full w-full border-none bg-white"
      src="about:blank"
      ref={iframeRef}
    />
  );
}

function Preview() {
  const bundleResult = useAtomValue(bundleResultAtom);
  const entry = getEntry(bundleResult?.output || []);
  const disabled = !entry;

  return (
    <Dialog>
      <DialogTrigger disabled={disabled} asChild>
        <Button
          variant="default"
          size="sm"
          className="ml-1 h-7 gap-1.5 rounded-md px-2 text-[11px] shadow-none sm:px-2.5"
          disabled={disabled}
          title="Open preview"
          aria-label="Open preview"
        >
          <Play className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Preview</span>
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="flex h-[80dvh] w-[calc(100vw-2rem)] max-w-6xl flex-col gap-0 overflow-hidden rounded-lg p-0 sm:max-w-6xl"
      >
        <div className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
          <DialogTitle className="text-xs font-medium">Preview</DialogTitle>
          <DialogDescription className="min-w-0 flex-1 truncate font-mono text-[11px]">
            {entry?.filename}
          </DialogDescription>
          <DialogClose asChild>
            <Button variant="ghost" size="icon" className="size-6" aria-label="Close preview">
              <X className="size-3.5" />
            </Button>
          </DialogClose>
        </div>
        <div className="min-h-0 flex-1">
          <PreviewFrame files={bundleResult?.output || []} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function getEntry(sourceFiles: SourceFile[]) {
  const entry = sourceFiles.find((f) => f.filename.includes("index.html"));
  return entry;
}

export default Preview;
