import { bundleResultAtom, inputFilesAtom } from "@/store/bundler";
import { useAtomValue } from "jotai";
import JSZip from "jszip";
import { useCallback } from "react";
import { toast } from "sonner";

export function useDownloadProject() {
  const inputFiles = useAtomValue(inputFilesAtom);
  const bundleResult = useAtomValue(bundleResultAtom);

  const downloadProject = useCallback(async () => {
    try {
      const zip = new JSZip();

      // Add source files
      const sourceFolder = zip.folder("source");
      if (sourceFolder) {
        inputFiles.forEach((file) => {
          // Filter out node_modules and other unwanted files
          if (
            file.filename.includes("node_modules") ||
            file.filename.includes(".git") ||
            file.filename.includes(".DS_Store")
          ) {
            return;
          }
          sourceFolder.file(file.filename, file.text);
        });
      }

      // Add dist files
      const distFolder = zip.folder("dist");
      if (distFolder && bundleResult?.output) {
        bundleResult.output.forEach((file) => {
          // Dist shouldn't have node_modules, but just in case
          if (file.filename.includes("node_modules")) return;

          // Remove potential leading slash for zip stricture
          const cleanFilename = file.filename.startsWith("/")
            ? file.filename.slice(1)
            : file.filename;

          distFolder.file(cleanFilename, file.text);
        });
      }

      // Generate zip
      const content = await zip.generateAsync({ type: "blob" });

      // Trigger download
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = "rspack-project.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Project downloaded successfully!");
    } catch (error) {
      console.error("Failed to download project:", error);
      toast.error("Failed to download project");
    }
  }, [inputFiles, bundleResult]);

  return downloadProject;
}
