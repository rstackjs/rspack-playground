import MonacoEditor from "@monaco-editor/react";
import FileTabs from "@/components/Editor/FileTabs";
import { useTheme } from "@/components/ThemeProvider";
import type { SourceFile } from "@/store/bundler";
import type * as Monaco from "monaco-editor";

interface CodeEditorProps {
  files: SourceFile[];
  activeIndex: number;
  readonly?: boolean;
  onFileSelect: (index: number) => void;
  onFileCreate?: (filename: string) => void;
  onFileDelete?: (index: number) => void;
  onFileRename?: (index: number, newName: string) => void;
  onContentChange?: (index: number, content: string) => void;
  onEditorMount?: (editor: Monaco.editor.IStandaloneCodeEditor) => void;
}

export default function CodeEditor({
  files,
  activeIndex,
  readonly = false,
  onFileSelect,
  onFileCreate,
  onFileDelete,
  onFileRename,
  onContentChange,
  onEditorMount,
}: CodeEditorProps) {
  const { theme } = useTheme();

  const currentFile = files[activeIndex];

  const getLanguage = (filename: string) => {
    const ext = filename.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "js":
      case "jsx":
        return "javascript";
      case "ts":
      case "tsx":
        return "typescript";
      case "css":
        return "css";
      case "html":
        return "html";
      case "json":
        return "json";
      case "md":
        return "markdown";
      default:
        return "javascript";
    }
  };

  const handleCreateFile = (filename: string) => {
    if (onFileCreate) {
      onFileCreate(filename);
    }
  };

  const handleDeleteFile = (index: number) => {
    if (onFileDelete) {
      onFileDelete(index);
    }
  };

  const handleRenameFile = (index: number, newName: string) => {
    if (onFileRename) {
      onFileRename(index, newName);
    }
  };

  const handleContentChange = (value: string | undefined) => {
    if (onContentChange && value !== undefined) {
      onContentChange(activeIndex, value);
    }
  };

  if (!currentFile) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        No file selected
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <FileTabs
        files={files}
        activeIndex={activeIndex}
        onFileSelect={onFileSelect}
        onFileCreate={handleCreateFile}
        onFileDelete={handleDeleteFile}
        onFileRename={handleRenameFile}
        readonly={readonly}
      />

      <div className="flex-1 min-h-0">
        <MonacoEditor
          value={currentFile.text}
          language={getLanguage(currentFile.filename)}
          theme={theme === "dark" ? "vs-dark" : "vs"}
          onChange={handleContentChange}
          onMount={(editor, monaco) => {
            const jsOptions =
              monaco.languages.typescript.javascriptDefaults.getCompilerOptions();
            monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
              ...jsOptions,
              jsx: monaco.languages.typescript.JsxEmit.React,
              jsxFactory: "React.createElement",
              module: monaco.languages.typescript.ModuleKind.ESNext,
              target: monaco.languages.typescript.ScriptTarget.ESNext,
            });

            const tsOptions =
              monaco.languages.typescript.javascriptDefaults.getCompilerOptions();
            monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
              ...tsOptions,
              jsx: monaco.languages.typescript.JsxEmit.React,
              jsxFactory: "React.createElement",
              module: monaco.languages.typescript.ModuleKind.ESNext,
              target: monaco.languages.typescript.ScriptTarget.ESNext,
            });

            // Call the onEditorMount callback with the editor instance
            if (onEditorMount) {
              onEditorMount(editor);
            }
          }}
          options={{
            readOnly: readonly,
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: "on",
            roundedSelection: false,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            insertSpaces: true,
          }}
        />
      </div>
    </div>
  );
}

