import type * as Monaco from "monaco-editor";
import { useMonaco } from "@monaco-editor/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RspackDependency, RspackModuleDeps, SourceFile } from "@/store/bundler";
import DependencyLines, { getDepColor } from "./DependencyLines";

interface DependencyPanelProps {
  modules: RspackModuleDeps[];
  inputFiles: SourceFile[];
  activeInputFile: number;
  inputEditorRef: React.RefObject<Monaco.editor.IStandaloneCodeEditor | null>;
}

interface DepItem {
  dep: RspackDependency;
  section: "dep" | "presentational" | "block";
  blockIndex?: number;
  key: string;
  /** global color index */
  colorIdx: number;
}

export default function DependencyPanel({
  modules,
  inputFiles,
  activeInputFile,
  inputEditorRef,
}: DependencyPanelProps) {
  const [lines, setLines] = useState<
    Array<{
      startX: number;
      startY: number;
      endX: number;
      endY: number;
      color: string;
    }>
  >([]);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const decorationsRef = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);
  const styleIdsRef = useRef<Set<string>>(new Set());

  const activeFile = inputFiles[activeInputFile];

  const currentModule = activeFile
    ? modules.find(
        (m) =>
          m.name === `./${activeFile.filename}` ||
          m.path.endsWith(`/${activeFile.filename}`) ||
          m.name === activeFile.filename,
      )
    : null;

  // Build flat list — every dep gets a sequential colorIdx
  const allDepItems = useMemo<DepItem[]>(() => {
    if (!currentModule) return [];
    const items: DepItem[] = [];
    let idx = 0;
    currentModule.deps.forEach((dep, i) => {
      items.push({ dep, section: "dep", key: `dep-${i}`, colorIdx: idx++ });
    });
    (currentModule.presentationalDeps ?? []).forEach((dep, i) => {
      items.push({ dep, section: "presentational", key: `pdep-${i}`, colorIdx: idx++ });
    });
    (currentModule.blocks ?? []).forEach((block, bi) => {
      (block.dependencies ?? []).forEach((dep, di) => {
        items.push({ dep, section: "block", blockIndex: bi, key: `block-${bi}-${di}`, colorIdx: idx++ });
      });
    });
    return items;
  }, [currentModule]);

  const totalDeps = allDepItems.length;

  useEffect(() => {
    const editor = inputEditorRef.current;
    if (editor && !decorationsRef.current) {
      decorationsRef.current = editor.createDecorationsCollection();
    }
  }, [inputEditorRef]);

  useEffect(() => {
    setLines([]);
    setShowAll(false);
    setHoveredKey(null);
    setCollapsedSections({});
    decorationsRef.current?.clear();
  }, [activeInputFile]);

  // Clean up dynamically created style elements on unmount
  useEffect(() => {
    const ids = styleIdsRef.current;
    return () => {
      for (const id of ids) {
        document.getElementById(id)?.remove();
      }
      ids.clear();
    };
  }, []);

  const monacoInstance = useMonaco();

  const highlightRange = useCallback(
    (dep: RspackDependency, color: string) => {
      const editor = inputEditorRef.current;
      if (!editor || !dep.loc || !monacoInstance) return;

      const { start, end } = dep.loc;

      const range = new monacoInstance.Range(
        start.line,
        start.column,
        end.line,
        end.column,
      );

      const cssClass = `dep-highlight-${color.replace(/[^a-zA-Z0-9]/g, "")}`;
      const styleId = `dep-style-${cssClass}`;
      if (!document.getElementById(styleId)) {
        const style = document.createElement("style");
        style.id = styleId;
        style.textContent = `.${cssClass} { border: 1px solid ${color} !important; background-color: ${color}22 !important; border-radius: 2px; }`;
        document.head.appendChild(style);
        styleIdsRef.current.add(styleId);
      }

      return { range, options: { className: cssClass } };
    },
    [inputEditorRef, monacoInstance],
  );

  const drawLineToModule = useCallback(
    (dep: RspackDependency, colorIndex: number) => {
      const editor = inputEditorRef.current;
      if (!editor || !dep.loc || !dep.targetModuleName) return;

      const editorDom = editor.getDomNode();
      if (!editorDom) return;

      const { start, end } = dep.loc;
      const startCoords = editor.getScrolledVisiblePosition({
        lineNumber: start.line,
        column: start.column,
      });
      if (!startCoords) return;

      const endCoords =
        end.line === start.line
          ? editor.getScrolledVisiblePosition({
              lineNumber: end.line,
              column: end.column,
            })
          : null;

      const editorRect = editorDom.getBoundingClientRect();
      let startX = editorRect.left + startCoords.left;
      if (endCoords) {
        startX = editorRect.left + (startCoords.left + endCoords.left) / 2;
      }
      const startY = editorRect.top + startCoords.top + (startCoords.height / 2);

      const targetName = dep.targetModuleName;
      const inputPanel = editorDom.closest("[id='input']")?.parentElement;
      if (!inputPanel) return null;
      const allTabs = inputPanel.querySelectorAll("[data-filename]");
      let tabEl: HTMLElement | null = null;
      for (const tab of allTabs) {
        const fn = tab.getAttribute("data-filename") || "";
        if (fn === targetName || targetName.endsWith(fn) || fn.endsWith(targetName)) {
          tabEl = tab as HTMLElement;
          break;
        }
      }

      if (tabEl) {
        const tabRect = tabEl.getBoundingClientRect();
        const color = getDepColor(colorIndex, totalDeps);
        return {
          startX,
          startY,
          endX: tabRect.left + tabRect.width / 2,
          endY: tabRect.top + tabRect.height / 2,
          color,
        };
      }
      return null;
    },
    [inputEditorRef, totalDeps],
  );

  // Recalculate all visible lines (used by showAll and scroll/resize)
  const recalcAllLines = useCallback(() => {
    const newLines: typeof lines = [];
    for (const item of allDepItems) {
      const line = drawLineToModule(item.dep, item.colorIdx);
      if (line) {
        newLines.push(line);
      }
    }
    setLines(newLines);
  }, [allDepItems, drawLineToModule]);

  // Recalculate single hovered line
  const recalcHoveredLine = useCallback(
    (key: string) => {
      const item = allDepItems.find((d) => d.key === key);
      if (!item) return;
      const line = drawLineToModule(item.dep, item.colorIdx);
      setLines(line ? [line] : []);
    },
    [allDepItems, drawLineToModule],
  );

  // Recalculate line positions on scroll/resize
  useEffect(() => {
    const update = () => {
      if (showAll) {
        recalcAllLines();
      } else if (hoveredKey) {
        recalcHoveredLine(hoveredKey);
      }
    };

    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [showAll, hoveredKey, recalcAllLines, recalcHoveredLine]);

  const handleDepHover = useCallback(
    (dep: RspackDependency, colorIndex: number, key: string) => {
      if (showAll) return;
      setHoveredKey(key);

      const color = getDepColor(colorIndex, totalDeps);

      const decoration = highlightRange(dep, color);
      if (decoration) {
        decorationsRef.current?.set([decoration]);
      } else {
        decorationsRef.current?.clear();
      }

      setLines([]);
      const line = drawLineToModule(dep, colorIndex);
      if (line) {
        setLines([line]);
      }
    },
    [showAll, totalDeps, highlightRange, drawLineToModule],
  );

  const handleDepLeave = useCallback(() => {
    if (showAll) return;
    setHoveredKey(null);
    decorationsRef.current?.clear();
    setLines([]);
  }, [showAll]);

  const handleShowAll = useCallback(() => {
    if (showAll) {
      setShowAll(false);
      setLines([]);
      decorationsRef.current?.clear();
      return;
    }

    setShowAll(true);
    const decorations: Array<{ range: any; options: any }> = [];

    for (const item of allDepItems) {
      const color = getDepColor(item.colorIdx, totalDeps);
      const decoration = highlightRange(item.dep, color);
      if (decoration) {
        decorations.push(decoration);
      }
    }

    decorationsRef.current?.set(decorations);
    recalcAllLines();
  }, [showAll, allDepItems, totalDeps, highlightRange, recalcAllLines]);

  // Editor mouse hover — highlight matching dep
  useEffect(() => {
    const editor = inputEditorRef.current;
    if (!editor || !currentModule) return;

    const disposable = editor.onMouseMove((e: Monaco.editor.IEditorMouseEvent) => {
      if (showAll || !e.target.position) return;

      const { lineNumber, column } = e.target.position;
      let found = false;

      for (const item of allDepItems) {
        const { dep } = item;
        if (!dep.loc) continue;

        const { start, end } = dep.loc;
        if (
          (lineNumber > start.line ||
            (lineNumber === start.line && column >= start.column)) &&
          (lineNumber < end.line ||
            (lineNumber === end.line && column <= end.column + 1))
        ) {
          found = true;
          handleDepHover(dep, item.colorIdx, item.key);
          break;
        }
      }

      if (!found) {
        handleDepLeave();
      }
    });

    const leaveDisposable = editor.onMouseLeave(() => {
      if (!showAll) {
        handleDepLeave();
      }
    });

    return () => {
      disposable.dispose();
      leaveDisposable.dispose();
    };
  }, [inputEditorRef, currentModule, showAll, allDepItems, handleDepHover, handleDepLeave]);

  if (!currentModule) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
        No dependency data for current file
      </div>
    );
  }

  const toggleSection = (section: string) => {
    setCollapsedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const renderDepItem = (item: DepItem) => {
    const { dep, key, colorIdx } = item;
    const depColor = getDepColor(colorIdx, totalDeps);
    const isHovered = hoveredKey === key;

    return (
      <div
        key={key}
        onMouseEnter={() => handleDepHover(dep, colorIdx, key)}
        onMouseLeave={handleDepLeave}
        className="cursor-pointer px-3 py-1.5 border-b border-border/50 transition-colors hover:bg-accent/50"
        style={{
          borderLeft: `3px solid ${depColor}`,
          backgroundColor: isHovered ? `${depColor}33` : undefined,
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground truncate">
            {dep.type}
          </span>
          {dep.targetModuleName && (
            <span
              className="text-xs font-medium truncate"
              style={{ color: depColor }}
            >
              {dep.targetModuleName}
            </span>
          )}
        </div>
        {dep.userRequest && (
          <div className="text-xs text-muted-foreground/70 mt-0.5 truncate">
            {dep.userRequest}
          </div>
        )}
        {dep.loc && (
          <div className="text-[10px] text-muted-foreground/50 mt-0.5">
            L{dep.loc.start.line}:{dep.loc.start.column}
          </div>
        )}
      </div>
    );
  };

  const depItems = allDepItems.filter((d) => d.section === "dep");
  const presentationalItems = allDepItems.filter((d) => d.section === "presentational");
  const blockItems = allDepItems.filter((d) => d.section === "block");
  const blockGroups = new Map<number, DepItem[]>();
  for (const item of blockItems) {
    const bi = item.blockIndex ?? 0;
    if (!blockGroups.has(bi)) blockGroups.set(bi, []);
    blockGroups.get(bi)!.push(item);
  }

  return (
    <>
      <DependencyLines lines={lines} />
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between p-2 border-b bg-muted/30">
          <span className="text-sm font-medium">
            All Dependencies ({totalDeps})
          </span>
          {totalDeps > 0 && (
            <button
              type="button"
              onClick={handleShowAll}
              className={`text-xs px-2 py-1 rounded transition-colors ${
                showAll
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-accent text-muted-foreground"
              }`}
            >
              {showAll ? "Hide All" : "Show All"}
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {depItems.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => toggleSection("dep")}
                className="w-full flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 hover:bg-muted/80 border-b border-border/50"
              >
                <span className="text-[10px]">{collapsedSections.dep ? "\u25B6" : "\u25BC"}</span>
                dependencies ({depItems.length})
              </button>
              {!collapsedSections.dep && depItems.map(renderDepItem)}
            </>
          )}

          {presentationalItems.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => toggleSection("presentational")}
                className="w-full flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 hover:bg-muted/80 border-b border-border/50"
              >
                <span className="text-[10px]">{collapsedSections.presentational ? "\u25B6" : "\u25BC"}</span>
                presentationalDependencies ({presentationalItems.length})
              </button>
              {!collapsedSections.presentational && presentationalItems.map(renderDepItem)}
            </>
          )}

          {blockGroups.size > 0 && (
            <>
              <button
                type="button"
                onClick={() => toggleSection("blocks")}
                className="w-full flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 hover:bg-muted/80 border-b border-border/50"
              >
                <span className="text-[10px]">{collapsedSections.blocks ? "\u25B6" : "\u25BC"}</span>
                blocks ({blockGroups.size})
              </button>
              {!collapsedSections.blocks &&
                [...blockGroups.entries()].map(([bi, items]) => (
                  <div key={`block-group-${bi}`}>
                    <div className="px-3 py-1 text-[10px] font-medium text-muted-foreground/70 bg-muted/20 border-b border-border/30">
                      Block {bi} ({items.length} deps)
                    </div>
                    {items.map(renderDepItem)}
                  </div>
                ))}
            </>
          )}

          {totalDeps === 0 && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No dependencies found
            </div>
          )}
        </div>
      </div>
    </>
  );
}
