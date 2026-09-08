import MonacoEditor from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import type React from "react";
import { FileCode2 } from "lucide-react";
import FileTabs from "@/components/Editor/FileTabs";
import { useTheme } from "@/components/ThemeProvider";
import { getSourceFileIdentity, type SourceFile } from "@/store/bundler";

interface CodeEditorProps {
  files: SourceFile[];
  activeIndex: number;
  tabsActions?: React.ReactNode;
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
  tabsActions,
  readonly = false,
  onFileSelect,
  onFileCreate,
  onFileDelete,
  onFileRename,
  onContentChange,
  onEditorMount,
}: CodeEditorProps) {
  const { resolvedTheme } = useTheme();

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
      <div className="flex h-full items-center justify-center px-6 text-xs text-muted-foreground">
        No file selected
      </div>
    );
  }

  // `path` identifies the Monaco model. Input files use an immutable identity so
  // renaming only changes the displayed filename and preserves editor history.
  const modelPath = `rspack-playground://${readonly ? "output" : "input"}/${encodeURIComponent(getSourceFileIdentity(currentFile).replace(/^\/+/, ""))}`;

  return (
    <div className="flex h-full min-w-0 flex-col" data-editor-kind={readonly ? "output" : "input"}>
      <FileTabs
        files={files}
        activeIndex={activeIndex}
        onFileSelect={onFileSelect}
        onFileCreate={handleCreateFile}
        onFileDelete={handleDeleteFile}
        onFileRename={handleRenameFile}
        actions={tabsActions}
        readonly={readonly}
      />

      <div className="flex-1 min-h-0">
        <MonacoEditor
          path={modelPath}
          value={currentFile.text}
          language={getLanguage(currentFile.filename)}
          theme={resolvedTheme === "dark" ? "workspace-dark" : "workspace-light"}
          beforeMount={(monaco) => {
            monaco.editor.defineTheme("workspace-dark", {
              base: "vs-dark",
              inherit: true,
              rules: [
                { token: "comment", foreground: "7f848d" },
                { token: "keyword", foreground: "b6b5d7" },
                { token: "string", foreground: "b5c8b4" },
                { token: "number", foreground: "d4ba8c" },
                { token: "type.identifier", foreground: "c6cbd8" },
              ],
              colors: {
                "editor.background": "#0f1011",
                "editor.foreground": "#d0d6e0",
                "editorLineNumber.foreground": "#4b4f56",
                "editorLineNumber.activeForeground": "#a2a6af",
                "editor.lineHighlightBackground": "#141516",
                "editor.selectionBackground": "#333544",
                "editor.inactiveSelectionBackground": "#272930",
                "editorCursor.foreground": "#d0d6e0",
                "editorIndentGuide.background1": "#202226",
                "editorWidget.background": "#191a1b",
                "editorWidget.border": "#34343a",
                "editorSuggestWidget.background": "#191a1b",
                "editorSuggestWidget.border": "#34343a",
                "editorHoverWidget.background": "#191a1b",
                "editorHoverWidget.border": "#34343a",
              },
            });
            monaco.editor.defineTheme("workspace-light", {
              base: "vs",
              inherit: true,
              rules: [
                { token: "comment", foreground: "6f737c" },
                { token: "keyword", foreground: "6c619b" },
                { token: "string", foreground: "59775c" },
                { token: "number", foreground: "9b7a48" },
              ],
              colors: {
                "editor.background": "#ffffff",
                "editor.foreground": "#393a40",
                "editorLineNumber.foreground": "#babcc4",
                "editorLineNumber.activeForeground": "#777981",
                "editor.lineHighlightBackground": "#fafafa",
                "editor.selectionBackground": "#e8e8f4",
                "editorIndentGuide.background1": "#f0f0f2",
              },
            });
          }}
          onChange={handleContentChange}
          onMount={(editor, monaco) => {
            const jsOptions = monaco.languages.typescript.javascriptDefaults.getCompilerOptions();
            monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
              ...jsOptions,
              jsx: monaco.languages.typescript.JsxEmit.React,
              jsxFactory: "React.createElement",
              module: monaco.languages.typescript.ModuleKind.ESNext,
              target: monaco.languages.typescript.ScriptTarget.ESNext,
            });

            const tsOptions = monaco.languages.typescript.javascriptDefaults.getCompilerOptions();
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
            fontSize: 13,
            fontFamily: '"SF Mono", Menlo, Monaco, Consolas, monospace',
            lineHeight: 22,
            padding: { top: 18, bottom: 18 },
            lineNumbersMinChars: 3,
            overviewRulerBorder: false,
            scrollbar: { verticalScrollbarSize: 7, horizontalScrollbarSize: 7 },
            lineNumbers: "on",
            roundedSelection: false,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            insertSpaces: true,
          }}
        />
      </div>
      <div className="flex h-7 shrink-0 items-center gap-2 border-t px-3 text-[10px] text-muted-foreground">
        <FileCode2 className="size-3 shrink-0 opacity-60" />
        <span className="min-w-0 flex-1 truncate font-mono" title={currentFile.filename}>
          {currentFile.filename}
        </span>
        <span className="shrink-0 capitalize">{getLanguage(currentFile.filename)}</span>
      </div>
    </div>
  );
}
