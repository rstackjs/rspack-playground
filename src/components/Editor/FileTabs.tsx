import { Edit2, FileCode2, Plus, X } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getSourceFileIdentity, type SourceFile } from "@/store/bundler";

interface FileTabsProps {
  files: SourceFile[];
  activeIndex: number;
  actions?: React.ReactNode;
  readonly?: boolean;
  onFileSelect: (index: number) => void;
  onFileCreate: (filename: string) => void;
  onFileDelete: (index: number) => void;
  onFileRename: (index: number, newName: string) => void;
}

export default function FileTabs({
  files,
  activeIndex,
  actions,
  readonly = false,
  onFileSelect,
  onFileCreate,
  onFileDelete,
  onFileRename,
}: FileTabsProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const activeTabRef = useRef<HTMLDivElement>(null);
  const activeFilename = files[activeIndex]?.filename;
  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeIndex, activeFilename]);

  const handleStartEdit = (index: number, currentName: string) => {
    if (readonly) return;
    setEditingIndex(index);
    setEditingName(currentName);
    setShowRenameDialog(true);
  };

  const handleFinishEdit = () => {
    if (editingIndex !== null && editingName.trim()) {
      onFileRename(editingIndex, editingName.trim());
    }
    setEditingIndex(null);
    setEditingName("");
    setShowRenameDialog(false);
  };

  const handleCreateFile = () => {
    if (newFileName.trim()) {
      onFileCreate(newFileName.trim());
      setNewFileName("");
    }
    setShowCreateDialog(false);
  };

  const handleDeleteFile = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    if (readonly || files.length <= 1) return;
    onFileDelete(index);
  };

  return (
    <>
      <div className="flex h-9 shrink-0 items-center border-b bg-card">
        <div
          className="flex min-w-0 flex-1 overflow-x-auto scrollbar-thin"
          role="tablist"
          aria-label={readonly ? "Output files" : "Source files"}
        >
          {files.map((file, index) => (
            <div
              key={getSourceFileIdentity(file)}
              data-filename={file.filename}
              ref={activeIndex === index ? activeTabRef : undefined}
              role="tab"
              aria-selected={activeIndex === index}
              tabIndex={activeIndex === index ? 0 : -1}
              title={file.filename}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onFileSelect(index);
                }
                if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                  event.preventDefault();
                  const next =
                    (index + (event.key === "ArrowRight" ? 1 : -1) + files.length) % files.length;
                  onFileSelect(next);
                  const tabs =
                    event.currentTarget.parentElement?.querySelectorAll<HTMLElement>(
                      '[role="tab"]',
                    );
                  tabs?.[next]?.focus();
                }
              }}
              className={cn(
                "group relative flex h-9 max-w-[250px] shrink-0 cursor-pointer items-center gap-2 border-r border-border/70 px-3 text-[11px] text-muted-foreground transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-ring",
                activeIndex === index &&
                  "bg-muted text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-px after:bg-foreground/60",
              )}
              onClick={() => onFileSelect(index)}
            >
              <FileCode2 className="size-3 shrink-0 opacity-60" />
              <span
                className="min-w-0 flex-1 truncate"
                onDoubleClick={() => handleStartEdit(index, file.filename)}
              >
                {file.filename}
              </span>
              {!readonly && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                    aria-label={`Rename ${file.filename}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartEdit(index, file.filename);
                    }}
                  >
                    <Edit2 className="size-3" />
                  </Button>
                  {files.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-destructive/20"
                      aria-label={`Delete ${file.filename}`}
                      onClick={(e) => handleDeleteFile(e, index)}
                    >
                      <X className="size-3" />
                    </Button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        {(!readonly || actions) && (
          <div className="relative flex shrink-0 items-center gap-1 px-1.5">
            {!readonly && (
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={() => setShowCreateDialog(true)}
                title="New file"
                aria-label="New file"
              >
                <Plus className="size-3.5" />
              </Button>
            )}
            {actions}
          </div>
        )}
      </div>

      {/* Rename File Dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename File</DialogTitle>
            <DialogDescription>Enter the new filename</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <input
              value={editingName}
              onChange={(e) => setEditingName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleFinishEdit();
                if (e.key === "Escape") {
                  setEditingIndex(null);
                  setEditingName("");
                  setShowRenameDialog(false);
                }
              }}
              className="w-full px-3 py-2 border rounded-md outline-none focus:ring-2 focus:ring-primary"
              placeholder="Enter filename"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditingIndex(null);
                setEditingName("");
                setShowRenameDialog(false);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleFinishEdit} disabled={!editingName.trim()}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create File Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New File</DialogTitle>
            <DialogDescription>Enter the name for the new file</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <input
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateFile();
                if (e.key === "Escape") {
                  setNewFileName("");
                  setShowCreateDialog(false);
                }
              }}
              className="w-full px-3 py-2 border rounded-md outline-none focus:ring-2 focus:ring-primary"
              placeholder="filename.js"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setNewFileName("");
                setShowCreateDialog(false);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateFile} disabled={!newFileName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
