import ansis from "ansis";
import { useAtom, useAtomValue } from "jotai";
import { debounce } from "lodash-es";
import { Check, Settings2, X } from "lucide-react";
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
import type { BundleResult, SourceFile } from "@/store/bundler";
import {
  bindingLoadingAtom,
  bundleResultAtom,
  enableFormatCode,
  inputFilesAtom,
} from "@/store/bundler";
import { activeInputFileAtom, activeOutputFileAtom, enableDependenciesAtom } from "@/store/editor";

interface InputPanelProps {
  inputFiles: SourceFile[];
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
    <Panel id="input" defaultSize={50} minSize={20} className="min-h-0">
      <div ref={panelRef} className="flex flex-col h-full">
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
        <div className="absolute top-full right-0 z-20 mt-2 w-56 rounded-lg border bg-background p-3 shadow-lg">
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
    <Panel id="output" defaultSize={50} minSize={20} className="min-h-0">
      <div ref={panelRef} className="flex flex-col h-full relative">
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
                    <pre className="p-2 h-full overflow-y-auto text-wrap">
                      {bundleResult.errors.map((err) => (
                        <div key={err} className="text-red-500">
                          {ansis.strip(err)}
                        </div>
                      ))}
                      {bundleResult.warnings.map((warning) => (
                        <div key={warning} className="text-orange-300">
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
                <div className="text-lg mb-2">No output yet</div>
                <div className="text-sm">Modify your code to see the bundled result</div>
              </div>
            </div>
          )}
        </div>
        {isLoadingBinding && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              <div className="text-sm text-muted-foreground font-medium">Loading Binding...</div>
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

  const setInputFiles = (files: SourceFile[]) => {
    _setInputFiles(files);
    debouncedHandleBundle(files);
  };

  const handleInputFileCreate = (filename: string) => {
    const newFile: SourceFile = {
      filename,
      text: "",
    };
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
      className={`${
        isVertical ? "h-1 bg-border hover:bg-border/80" : "w-1 bg-border hover:bg-border/80"
      } transition-colors relative group`}
    >
      <div
        className={`absolute bg-border group-hover:bg-border/80 transition-colors ${
          isVertical ? "inset-x-0 top-1/2 h-0.5" : "inset-y-0 left-1/2 w-0.5"
        }`}
      />
      <div
        className={`absolute bg-border group-hover:bg-border/80 rounded-full opacity-0 group-hover:opacity-100 transition-opacity ${
          isVertical
            ? "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-1"
            : "inset-y-0 left-1/2 -translate-x-1/2 w-1 h-8"
        }`}
      />
    </PanelResizeHandle>
  );

  return (
    <div ref={editorContainerRef} className="flex h-full relative">
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
                <Panel id="dependencies" defaultSize={25} minSize={15} className="min-h-0">
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
