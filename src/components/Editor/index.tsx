import ansis from "ansis";
import { useAtom, useAtomValue } from "jotai";
import { debounce } from "lodash-es";
import { Check, Code2, Layers, LoaderCircle, Settings2, X } from "lucide-react";
import type * as Monaco from "monaco-editor";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import DependencyPanel from "@/components/Dependencies";
import CodeEditor from "@/components/Editor/CodeEditor";
import SourcemapOverlay from "@/components/Editor/SourcemapOverlay";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import useBundle from "@/hooks/use-bundle";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSegmentDecorations } from "@/hooks/useSegmentDecorations";
import { useSourcemapHover } from "@/hooks/useSourcemapHover";
import type { BundleResult, EditorSourceFile } from "@/store/bundler";
import {
  bindingLoadingAtom,
  bundleResultAtom,
  createEditorSourceFile,
  enableFormatCode,
  inputFilesAtom,
} from "@/store/bundler";
import { activeInputFileAtom, activeOutputFileAtom, enableDependenciesAtom } from "@/store/editor";

interface InputPanelProps {
  defaultSize?: number;
  inputFiles: EditorSourceFile[];
  activeInputFile: number;
  setActiveInputFile: (index: number) => void;
  handleInputFileCreate: (filename: string) => void;
  handleInputFileDelete: (index: number) => void;
  handleInputFileRename: (index: number, newName: string) => void;
  handleInputContentChange: (index: number, content: string) => void;
  onEditorMount?: (editor: Monaco.editor.IStandaloneCodeEditor) => void;
  panelRef?: React.RefObject<HTMLDivElement | null>;
}

function InputPanel({
  defaultSize = 50,
  inputFiles,
  activeInputFile,
  setActiveInputFile,
  handleInputFileCreate,
  handleInputFileDelete,
  handleInputFileRename,
  handleInputContentChange,
  onEditorMount,
  panelRef,
}: InputPanelProps) {
  return (
    <Panel id="input" order={0} defaultSize={defaultSize} minSize={20} className="workspace-panel">
      <div ref={panelRef} className="flex h-full flex-col">
        <div className="workspace-panel-heading">
          <div className="flex items-center gap-2">
            <Code2 className="size-3.5 text-muted-foreground" />
            <h2>Source</h2>
            <span className="ml-1 text-[10px] font-normal tabular-nums text-muted-foreground">
              {inputFiles.length}
            </span>
          </div>
          <span className="flex items-center gap-1.5 text-[10px] font-normal text-muted-foreground">
            <span className="size-1 rounded-full bg-chart-2" />
            Auto build
          </span>
        </div>
        <div className="flex-1 min-h-0">
          <CodeEditor
            files={inputFiles}
            activeIndex={activeInputFile}
            onFileSelect={setActiveInputFile}
            onFileCreate={handleInputFileCreate}
            onFileDelete={handleInputFileDelete}
            onFileRename={handleInputFileRename}
            onContentChange={handleInputContentChange}
            onEditorMount={onEditorMount}
          />
        </div>
      </div>
    </Panel>
  );
}

interface OutputPanelProps {
  defaultSize?: number;
  bundleResult: BundleResult | null;
  activeOutputFile: number;
  isLoadingBinding: boolean;
  setActiveOutputFile: (index: number) => void;
  enableSourcemap: boolean;
  setEnableSourcemap: (enabled: boolean) => void;
  enableDependencies: boolean;
  setEnableDependencies: (enabled: boolean) => void;
  onEditorMount?: (editor: Monaco.editor.IStandaloneCodeEditor) => void;
  panelRef?: React.RefObject<HTMLDivElement | null>;
}

function OutputPanel({
  defaultSize = 50,
  bundleResult,
  activeOutputFile,
  isLoadingBinding,
  setActiveOutputFile,
  enableSourcemap,
  setEnableSourcemap,
  enableDependencies,
  setEnableDependencies,
  onEditorMount,
  panelRef,
}: OutputPanelProps) {
  const [formatCode, setFormatCode] = useAtom(enableFormatCode);
  const [showSettings, setShowSettings] = useState(false);

  // Handle format code change - disable sourcemap if enabling format
  const handleFormatCodeChange = useCallback(
    (state: boolean | "indeterminate") => {
      const enabled = Boolean(state);
      setFormatCode(enabled);
      if (enabled && enableSourcemap) {
        setEnableSourcemap(false);
      }
    },
    [setFormatCode, enableSourcemap, setEnableSourcemap],
  );

  const outputSettings = (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-6"
        onClick={() => setShowSettings((open) => !open)}
        title="Output settings"
        aria-label="Output settings"
      >
        <Settings2 className="size-3.5" />
      </Button>
      {showSettings && (
        <div className="absolute top-full right-0 z-20 mt-2 w-56 rounded-lg border bg-popover p-3 shadow-xl">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-medium">Output Settings</div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={() => setShowSettings(false)}
              title="Close settings"
              aria-label="Close settings"
            >
              <X className="size-3.5" />
            </Button>
          </div>
          <div className="space-y-3">
            <Label className="justify-between">
              <span className="text-sm font-normal">Dependencies</span>
              <Checkbox
                checked={enableDependencies}
                onCheckedChange={(checked) => setEnableDependencies(Boolean(checked))}
              />
            </Label>
            <Label className="justify-between">
              <span className="text-sm font-normal">Sourcemap</span>
              <Checkbox
                checked={enableSourcemap}
                onCheckedChange={(checked) => setEnableSourcemap(Boolean(checked))}
              />
            </Label>
            <Label className="justify-between">
              <span className="text-sm font-normal">Format output</span>
              <Checkbox
                checked={formatCode && !enableSourcemap}
                disabled={enableSourcemap}
                onCheckedChange={handleFormatCodeChange}
              />
            </Label>
            {enableSourcemap && (
              <div className="flex items-start gap-2 rounded-md bg-muted/50 px-2 py-1.5 text-xs text-muted-foreground">
                <Check className="mt-0.5 size-3 shrink-0" />
                <span>Format output is unavailable while sourcemap is enabled.</span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );

  return (
    <Panel id="output" order={1} defaultSize={defaultSize} minSize={20} className="workspace-panel">
      <div ref={panelRef} className="relative flex h-full flex-col">
        <div className="workspace-panel-heading">
          <div className="flex items-center gap-2">
            <Layers className="size-3.5 text-muted-foreground" />
            <h2>Output</h2>
            <span className="ml-1 text-[10px] font-normal tabular-nums text-muted-foreground">
              {bundleResult?.output.length ?? 0}
            </span>
          </div>
          <span className="text-[10px] font-normal text-muted-foreground">Read only</span>
        </div>
        <div className="flex-1 min-h-0">
          {bundleResult ? (
            <PanelGroup id="output-group" direction="vertical" className="h-full">
              <Panel id="output-editor" order={0}>
                <CodeEditor
                  files={
                    formatCode && !enableSourcemap
                      ? bundleResult.formattedOutput
                      : bundleResult.output
                  }
                  activeIndex={activeOutputFile}
                  onFileSelect={setActiveOutputFile}
                  tabsActions={outputSettings}
                  readonly
                  onEditorMount={onEditorMount}
                />
              </Panel>
              {(bundleResult.errors.length > 0 || bundleResult.warnings.length > 0) && (
                <>
                  <PanelResizeHandle className="h-1 bg-border hover:bg-border/80" />
                  <Panel id="output-errors" order={1} minSize={0} maxSize={33.33}>
                    <pre className="h-full overflow-y-auto whitespace-pre-wrap break-words p-4 font-mono text-[11px] leading-5">
                      {bundleResult.errors.map((err) => (
                        <div key={err} className="text-destructive">
                          {ansis.strip(err)}
                        </div>
                      ))}
                      {bundleResult.warnings.map((warning) => (
                        <div key={warning} className="text-chart-3">
                          {ansis.strip(warning)}
                        </div>
                      ))}
                    </pre>
                  </Panel>
                </>
              )}
            </PanelGroup>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <div className="mb-2 text-sm font-medium text-foreground">No output yet</div>
                <div className="text-xs">Modify your code to see the bundled result</div>
              </div>
            </div>
          )}
        </div>
        {isLoadingBinding && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10">
            <div className="flex flex-col items-center gap-3">
              <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
              <div className="text-sm text-muted-foreground font-medium">Preparing compiler…</div>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

function Editor() {
  const [inputFiles, _setInputFiles] = useAtom(inputFilesAtom);
  const [activeInputFile, setActiveInputFile] = useAtom(activeInputFileAtom);
  const [activeOutputFile, setActiveOutputFile] = useAtom(activeOutputFileAtom);
  const [enableDeps, setEnableDeps] = useAtom(enableDependenciesAtom);
  const isLoadingBinding = useAtomValue(bindingLoadingAtom);
  const bundleResult = useAtomValue(bundleResultAtom);
  const handleBundle = useBundle();
  const editorContainerRef = useRef<HTMLDivElement | null>(null);
  const isMobile = useIsMobile();

  // Refs for sourcemap overlay
  const inputEditorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const outputEditorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const inputPanelRef = useRef<HTMLDivElement | null>(null);
  const outputPanelRef = useRef<HTMLDivElement | null>(null);

  // Sourcemap hover hook
  const { enableSourcemap, setEnableSourcemap } = useSourcemapHover({
    inputEditorRef,
    outputEditorRef,
    inputFiles,
    outputFiles: bundleResult?.output ?? [],
    activeInputIndex: activeInputFile,
    activeOutputIndex: activeOutputFile,
  });

  // Segment decorations hook - applies colored backgrounds to all segments
  useSegmentDecorations({
    inputEditorRef,
    outputEditorRef,
    inputFiles,
    outputFiles: bundleResult?.output ?? [],
    activeInputIndex: activeInputFile,
    activeOutputIndex: activeOutputFile,
  });

  const debouncedHandleBundle = useMemo(() => debounce(handleBundle, 300), [handleBundle]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: initialize bundle on mount
  useEffect(() => {
    handleBundle(inputFiles);
  }, []);

  const setInputFiles = (files: EditorSourceFile[]) => {
    _setInputFiles(files);
    debouncedHandleBundle(files);
  };

  const handleInputFileCreate = (filename: string) => {
    const newFile = createEditorSourceFile({
      filename,
      text: "",
    });
    setInputFiles([...inputFiles, newFile]);
    setActiveInputFile(inputFiles.length);
  };

  const handleInputFileDelete = (index: number) => {
    if (inputFiles.length <= 1) return;

    const newFiles = inputFiles.filter((_, i) => i !== index);
    setInputFiles(newFiles);

    if (activeInputFile >= newFiles.length) {
      setActiveInputFile(newFiles.length - 1);
    } else if (activeInputFile > index) {
      setActiveInputFile(activeInputFile - 1);
    }
  };

  const handleInputFileRename = (index: number, newName: string) => {
    const newFiles = [...inputFiles];
    newFiles[index] = { ...newFiles[index], filename: newName };
    setInputFiles(newFiles);
  };

  const handleInputContentChange = (index: number, content: string) => {
    const newFiles = [...inputFiles];
    newFiles[index] = { ...newFiles[index], text: content };
    setInputFiles(newFiles);
  };

  const handleInputEditorMount = useCallback((editor: Monaco.editor.IStandaloneCodeEditor) => {
    inputEditorRef.current = editor;
  }, []);

  const handleOutputEditorMount = useCallback((editor: Monaco.editor.IStandaloneCodeEditor) => {
    outputEditorRef.current = editor;
  }, []);

  const ResizeHandle = ({ isVertical }: { isVertical: boolean }) => (
    <PanelResizeHandle
      className={`relative z-10 shrink-0 bg-border transition-colors hover:bg-ring/70 focus-visible:bg-ring ${isVertical ? "h-px after:absolute after:inset-x-0 after:-inset-y-1" : "w-px after:absolute after:inset-y-0 after:-inset-x-1"}`}
    />
  );

  return (
    <div
      ref={editorContainerRef}
      className="relative flex h-full overflow-hidden rounded-lg border bg-card"
    >
      {isMobile === undefined ? null : isMobile ? (
        /* Mobile layout (vertical) */
        <div className="flex flex-col h-full w-full">
          <PanelGroup id="editors-mobile" direction="vertical" className="h-full">
            <InputPanel
              inputFiles={inputFiles}
              activeInputFile={activeInputFile}
              setActiveInputFile={setActiveInputFile}
              handleInputFileCreate={handleInputFileCreate}
              handleInputFileDelete={handleInputFileDelete}
              handleInputFileRename={handleInputFileRename}
              handleInputContentChange={handleInputContentChange}
              onEditorMount={handleInputEditorMount}
              panelRef={inputPanelRef}
            />
            <ResizeHandle isVertical={true} />
            <OutputPanel
              bundleResult={bundleResult}
              activeOutputFile={activeOutputFile}
              setActiveOutputFile={setActiveOutputFile}
              isLoadingBinding={isLoadingBinding}
              enableSourcemap={enableSourcemap}
              setEnableSourcemap={setEnableSourcemap}
              enableDependencies={enableDeps}
              setEnableDependencies={setEnableDeps}
              onEditorMount={handleOutputEditorMount}
              panelRef={outputPanelRef}
            />
          </PanelGroup>
        </div>
      ) : (
        /* Desktop layout (horizontal) */
        <div className="flex h-full w-full">
          <PanelGroup id="editors-desktop" direction="horizontal" className="h-full">
            <InputPanel
              defaultSize={enableDeps && bundleResult ? 35 : 50}
              inputFiles={inputFiles}
              activeInputFile={activeInputFile}
              setActiveInputFile={setActiveInputFile}
              handleInputFileCreate={handleInputFileCreate}
              handleInputFileDelete={handleInputFileDelete}
              handleInputFileRename={handleInputFileRename}
              handleInputContentChange={handleInputContentChange}
              onEditorMount={handleInputEditorMount}
              panelRef={inputPanelRef}
            />
            <ResizeHandle isVertical={false} />
            <OutputPanel
              defaultSize={enableDeps && bundleResult ? 35 : 50}
              bundleResult={bundleResult}
              activeOutputFile={activeOutputFile}
              setActiveOutputFile={setActiveOutputFile}
              isLoadingBinding={isLoadingBinding}
              enableSourcemap={enableSourcemap}
              setEnableSourcemap={setEnableSourcemap}
              enableDependencies={enableDeps}
              setEnableDependencies={setEnableDeps}
              onEditorMount={handleOutputEditorMount}
              panelRef={outputPanelRef}
            />
            {enableDeps && bundleResult && (
              <>
                <ResizeHandle isVertical={false} />
                <Panel
                  id="dependencies"
                  order={2}
                  defaultSize={30}
                  minSize={20}
                  className="workspace-panel"
                >
                  <DependencyPanel
                    modules={bundleResult.modules}
                    chunks={bundleResult.chunks}
                    chunkGroups={bundleResult.chunkGroups}
                    inputFiles={inputFiles}
                    activeInputFile={activeInputFile}
                    setActiveInputFile={setActiveInputFile}
                    inputEditorRef={inputEditorRef}
                  />
                </Panel>
              </>
            )}
          </PanelGroup>
        </div>
      )}

      {/* Sourcemap overlay - renders on top of everything */}
      <SourcemapOverlay
        inputEditorRef={inputEditorRef}
        outputEditorRef={outputEditorRef}
        inputPanelRef={inputPanelRef}
        outputPanelRef={outputPanelRef}
        inputFiles={inputFiles}
        activeInputIndex={activeInputFile}
        enabled={enableSourcemap}
      />
    </div>
  );
}

export default Editor;
