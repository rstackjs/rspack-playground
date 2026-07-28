import { useAtomValue, useSetAtom } from "jotai";
import {
  Check,
  Copy,
  History,
  LoaderCircle,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverFooter,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import useBundle from "@/hooks/use-bundle";
import { getShareUrl } from "@/lib/share";
import {
  deleteHistory,
  duplicateHistory,
  historyObservable,
  renameHistory,
  restoreHistory,
  type HistorySnapshot,
} from "@/lib/history";
import { currentProjectIdAtom, inputFilesAtom } from "@/store/bundler";
import { rspackVersionAtom } from "@/store/version";

interface HistoryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatSnapshotDate(timestamp: number) {
  return dateFormatter.format(new Date(timestamp));
}

export default function HistoryDrawer({ open, onOpenChange }: HistoryDrawerProps) {
  const [snapshots, setSnapshots] = useState<HistorySnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [snapshotToDelete, setSnapshotToDelete] = useState<HistorySnapshot | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [editingSnapshotId, setEditingSnapshotId] = useState<number | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [titleError, setTitleError] = useState<string | null>(null);
  const [isStartingNewProject, setIsStartingNewProject] = useState(false);
  const inputFiles = useAtomValue(inputFilesAtom);
  const setInputFiles = useSetAtom(inputFilesAtom);
  const currentProjectId = useAtomValue(currentProjectIdAtom);
  const setCurrentProjectId = useSetAtom(currentProjectIdAtom);
  const rspackVersion = useAtomValue(rspackVersionAtom);
  const setRspackVersion = useSetAtom(rspackVersionAtom);
  const handleBundle = useBundle();

  useEffect(() => {
    if (!open) {
      return;
    }

    setIsLoading(true);
    setError(null);
    const subscription = historyObservable.subscribe({
      next: (nextSnapshots) => {
        setSnapshots(nextSnapshots);
        setIsLoading(false);
        setError(null);
      },
      error: (loadError) => {
        console.error("Failed to load project history:", loadError);
        setIsLoading(false);
        setError("History could not be loaded. Please try again.");
      },
    });

    return () => subscription.unsubscribe();
  }, [open, retryNonce]);

  const handleRestore = async (snapshot: HistorySnapshot) => {
    setBusyId(snapshot.id);
    try {
      const restored = await restoreHistory(snapshot.id);
      setInputFiles(restored.files);
      setCurrentProjectId(snapshot.id);
      setRspackVersion(restored.rspackVersion);
      window.history.replaceState(
        null,
        "",
        getShareUrl({
          rspackVersion: restored.rspackVersion,
          inputFiles: restored.files,
        }),
      );
      await handleBundle(restored.files, restored.rspackVersion);
      toast.success("Project restored from history");
      onOpenChange(false);
    } catch (restoreError) {
      console.error("Failed to restore project history:", restoreError);
      toast.error("Failed to restore project history");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (snapshot: HistorySnapshot) => {
    setBusyId(snapshot.id);
    try {
      await deleteHistory(snapshot.id);
      if (snapshot.id === currentProjectId) {
        setCurrentProjectId(null);
      }
      toast.success("History entry deleted");
    } catch (deleteError) {
      console.error("Failed to delete project history:", deleteError);
      toast.error("Failed to delete history entry");
    } finally {
      setBusyId(null);
      setSnapshotToDelete(null);
    }
  };

  const handleCopy = async (snapshot: HistorySnapshot) => {
    setBusyId(snapshot.id);
    try {
      const copiedSnapshot = await duplicateHistory(snapshot.id);
      const copiedProject = await restoreHistory(copiedSnapshot.id);
      setInputFiles(copiedProject.files);
      setCurrentProjectId(copiedSnapshot.id);
      setRspackVersion(copiedProject.rspackVersion);
      window.history.replaceState(
        null,
        "",
        getShareUrl({
          rspackVersion: copiedProject.rspackVersion,
          inputFiles: copiedProject.files,
        }),
      );
      await handleBundle(copiedProject.files, copiedProject.rspackVersion);
      toast.success("Project copied to a new project");
      onOpenChange(false);
    } catch (copyError) {
      console.error("Failed to copy project history:", copyError);
      toast.error("Failed to copy project history");
    } finally {
      setBusyId(null);
    }
  };

  const handleStartNewProject = async () => {
    if (busyId !== null || isStartingNewProject) {
      return;
    }

    setIsStartingNewProject(true);
    setCurrentProjectId(null);
    setSnapshotToDelete(null);
    setEditingSnapshotId(null);
    try {
      await handleBundle(inputFiles, rspackVersion);
      onOpenChange(false);
    } catch (bundleError) {
      console.error("Failed to start a new project:", bundleError);
      toast.error("Failed to start a new project");
    } finally {
      setIsStartingNewProject(false);
    }
  };

  const handleStartEditing = (snapshot: HistorySnapshot) => {
    setSnapshotToDelete(null);
    setEditingSnapshotId(snapshot.id);
    setEditingTitle(snapshot.title);
    setTitleError(null);
  };

  const handleCancelEditing = () => {
    setEditingSnapshotId(null);
    setEditingTitle("");
    setTitleError(null);
  };

  const handleRename = async (snapshot: HistorySnapshot) => {
    const trimmedTitle = editingTitle.trim();
    if (!trimmedTitle) {
      setTitleError("Project title cannot be empty");
      toast.error("Project title cannot be empty");
      return;
    }

    setBusyId(snapshot.id);
    try {
      await renameHistory(snapshot.id, trimmedTitle);
      handleCancelEditing();
    } catch (renameError) {
      console.error("Failed to rename project history:", renameError);
      setTitleError("Failed to rename project");
      toast.error("Failed to rename project");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <Drawer direction="right" open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="h-full w-[min(30rem,100vw)]! max-w-none flex-col overflow-hidden rounded-none border-y-0 border-r-0 p-0 sm:max-w-none">
          <DrawerHeader className="border-b px-5 py-4 pr-12 text-left">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <DrawerTitle>Project History</DrawerTitle>
                <DrawerDescription>
                  Restore, copy, or remove saved project snapshots.
                </DrawerDescription>
              </div>
              <Button
                variant="outline"
                size="icon"
                className="size-7 shrink-0"
                onClick={() => void handleStartNewProject()}
                disabled={busyId !== null || isStartingNewProject}
                title="Start a new project"
                aria-label="Start a new project"
              >
                {isStartingNewProject ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : (
                  <Plus className="size-3.5" />
                )}
              </Button>
            </div>
          </DrawerHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {isLoading ? (
              <div className="flex h-32 items-center justify-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" />
                Loading history…
              </div>
            ) : error ? (
              <div className="flex h-32 flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
                <p>{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRetryNonce((value) => value + 1)}
                >
                  Try again
                </Button>
              </div>
            ) : snapshots.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
                <History className="size-8 opacity-50" />
                <div>
                  <p className="text-sm font-medium text-foreground">No history yet</p>
                  <p className="mt-1 text-xs">Compile to save the current project here.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {snapshots.map((snapshot) => {
                  const isBusy = busyId === snapshot.id;
                  return (
                    <div key={snapshot.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          {editingSnapshotId === snapshot.id ? (
                            <div className="space-y-1">
                              <div className="flex items-center gap-1">
                                <Input
                                  value={editingTitle}
                                  onChange={(event) => {
                                    setEditingTitle(event.target.value);
                                    if (titleError) {
                                      setTitleError(null);
                                    }
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                      void handleRename(snapshot);
                                    } else if (event.key === "Escape") {
                                      event.preventDefault();
                                      handleCancelEditing();
                                    }
                                  }}
                                  className="h-7 text-sm"
                                  aria-label="Project title"
                                  autoFocus
                                  disabled={busyId !== null}
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 shrink-0"
                                  onClick={() => void handleRename(snapshot)}
                                  disabled={busyId !== null}
                                  title="Save project title"
                                  aria-label="Save project title"
                                >
                                  {isBusy ? (
                                    <LoaderCircle className="size-3.5 animate-spin" />
                                  ) : (
                                    <Check className="size-3.5" />
                                  )}
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="size-7 shrink-0"
                                  onClick={handleCancelEditing}
                                  disabled={busyId !== null}
                                  title="Cancel editing project title"
                                  aria-label="Cancel editing project title"
                                >
                                  <X className="size-3.5" />
                                </Button>
                              </div>
                              {titleError && (
                                <p className="text-xs text-destructive">{titleError}</p>
                              )}
                            </div>
                          ) : (
                            <div className="flex min-w-0 items-center gap-1">
                              <p className="truncate text-sm font-medium" title={snapshot.title}>
                                {snapshot.title}
                              </p>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 shrink-0"
                                onClick={() => handleStartEditing(snapshot)}
                                disabled={busyId !== null || isStartingNewProject}
                                title="Edit project title"
                                aria-label={`Edit title for ${snapshot.title}`}
                              >
                                <Pencil className="size-3.5" />
                              </Button>
                            </div>
                          )}
                          <p className="truncate text-xs text-muted-foreground">
                            {formatSnapshotDate(snapshot.updatedAt)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Rspack v{snapshot.rspackVersion} · {snapshot.fileCount} files
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground"
                            disabled={busyId !== null || isStartingNewProject}
                            onClick={() => void handleCopy(snapshot)}
                            title="Copy as a new project"
                            aria-label={`Copy ${snapshot.title} as a new project`}
                          >
                            {isBusy ? (
                              <LoaderCircle className="size-3.5 animate-spin" />
                            ) : (
                              <Copy className="size-3.5" />
                            )}
                          </Button>
                          <Popover
                            open={snapshotToDelete?.id === snapshot.id}
                            onOpenChange={(nextOpen) => {
                              if (busyId === null) {
                                setSnapshotToDelete(nextOpen ? snapshot : null);
                              }
                            }}
                          >
                            <PopoverTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 text-muted-foreground hover:text-destructive"
                                disabled={busyId !== null}
                                title="Delete history entry"
                                aria-label={`Delete snapshot from ${formatSnapshotDate(snapshot.updatedAt)}`}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent
                              align="end"
                              className="pointer-events-auto z-[60] w-64 p-3"
                            >
                              <PopoverHeader>
                                <PopoverTitle>Delete history entry?</PopoverTitle>
                                <PopoverDescription>
                                  This snapshot will be permanently removed from this browser.
                                </PopoverDescription>
                              </PopoverHeader>
                              <PopoverFooter className="mt-3">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSnapshotToDelete(null)}
                                  disabled={busyId !== null}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onPointerDown={(event) => event.stopPropagation()}
                                  onClick={() => void handleDelete(snapshot)}
                                  disabled={busyId !== null}
                                >
                                  {isBusy && <LoaderCircle className="size-3.5 animate-spin" />}
                                  Delete
                                </Button>
                              </PopoverFooter>
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3 w-full"
                        disabled={busyId !== null}
                        onClick={() => void handleRestore(snapshot)}
                      >
                        {isBusy ? (
                          <LoaderCircle className="size-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="size-3.5" />
                        )}
                        Restore
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
