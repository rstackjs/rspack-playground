import { Edit2, Plus, X } from "lucide-react";
import type React from "react";
import { useState } from "react";
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
import type { SourceFile } from "@/store/bundler";

interface FileTabsProps {
  files: SourceFile[];
  activeIndex: number;
  onFileSelect: (index: number) => void;
  onFileCreate: (filename: string) => void;
  onFileDelete: (index: number) => void;
  onFileRename: (index: number, newName: string) => void;
  readonly?: boolean;
}

export default function FileTabs({
  files,
  activeIndex,
  onFileSelect,
  onFileCreate,
  onFileDelete,
  onFileRename,
  readonly = false,
}: FileTabsProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newFileName, setNewFileName] = useState("");

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
      <div className="flex items-center border-b bg-muted/50">
        <div className="flex flex-1 overflow-x-auto scrollbar-thin">
          {files.map((file, index) => (
            <div
              key={file.filename}
              data-filename={file.filename}
              className={cn(
                "group flex items-center space-x-2 px-3 py-2 border-r cursor-pointer hover:bg-accent/50 transition-colors flex-shrink-0",
                activeIndex === index &&
                "bg-background border-b-2 border-b-primary",
              )}
              onClick={() => onFileSelect(index)}
            >
              <span
                className="text-sm truncate flex-1 min-w-0"
                onDoubleClick={() => handleStartEdit(index, file.filename)}
              >
                {file.filename}
              </span>
              {!readonly && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleStartEdit(index, file.filename);
                    }}
                  >
                    <Edit2 className="h-3 w-3" />
                  </Button>
                  {files.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/20"
                      onClick={(e) => handleDeleteFile(e, index)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        {!readonly && (
          <div className="flex items-center px-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setShowCreateDialog(true)}
              title="New file"
            >
              <Plus className="h-4 w-4" />
            </Button>
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
            <DialogDescription>
              Enter the name for the new file
            </DialogDescription>
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
