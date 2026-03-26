import { useMonaco } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import type { ReactNode, RefObject } from "react";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  RspackChunkGroupInfo,
  RspackChunkInfo,
  RspackDependency,
  RspackModuleCategory,
  RspackModuleDeps,
} from "@/lib/bundle/dependency";
import { normalizePath } from "@/lib/normalizePath";
import { cn } from "@/lib/utils";
import type { SourceFile } from "@/store/bundler";
import DependencyLines, { getDepColor } from "./DependencyLines";
import ChunkGraphCanvas from "./ChunkGraphCanvas";
import ModuleGraphCanvas from "./ModuleGraphCanvas";
import { includesGraphText } from "./graphCanvasUtils";

interface DependencyPanelProps {
  modules: RspackModuleDeps[];
  chunks: RspackChunkInfo[];
  chunkGroups: RspackChunkGroupInfo[];
  inputFiles: SourceFile[];
  activeInputFile: number;
  setActiveInputFile: (index: number) => void;
  inputEditorRef: RefObject<Monaco.editor.IStandaloneCodeEditor | null>;
}

interface DepItem {
  dep: RspackDependency;
  section: "dep" | "presentational" | "block";
  blockIndex?: number;
  key: string;
  colorIdx: number;
}

type GraphView = "module" | "chunk";
type LineInfo = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  color: string;
};

function matchesModulePath(a: string | undefined, b: string | undefined) {
  const left = normalizePath(a);
  const right = normalizePath(b);

  if (!left || !right) return false;
  return (
    left === right || left.endsWith(`/${right}`) || right.endsWith(`/${left}`)
  );
}

function categoryLabel(category: RspackModuleCategory) {
  switch (category) {
    case "source":
      return "source";
    case "dependency":
      return "pkg";
    case "runtime":
      return "runtime";
  }
}

function categoryClassName(category: RspackModuleCategory) {
  switch (category) {
    case "source":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "dependency":
      return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300";
    case "runtime":
      return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
}

function compareChunkInfo(a: RspackChunkInfo, b: RspackChunkInfo) {
  return (
    Number(b.entry) - Number(a.entry) ||
    Number(b.initial) - Number(a.initial) ||
    a.name.localeCompare(b.name)
  );
}

function compareChunkGroupInfo(
  a: RspackChunkGroupInfo,
  b: RspackChunkGroupInfo,
) {
  return Number(b.initial) - Number(a.initial) || a.name.localeCompare(b.name);
}

function compareChunkModuleRef(
  a: RspackChunkInfo["modules"][number],
  b: RspackChunkInfo["modules"][number],
) {
  const categoryOrder = {
    source: 0,
    dependency: 1,
    runtime: 2,
  } satisfies Record<RspackChunkInfo["modules"][number]["category"], number>;

  return (
    categoryOrder[a.category] - categoryOrder[b.category] ||
    a.name.localeCompare(b.name)
  );
}

function isChunkInfo(value: RspackChunkInfo | undefined): value is RspackChunkInfo {
  return Boolean(value);
}

function isChunkGroupInfo(
  value: RspackChunkGroupInfo | undefined,
): value is RspackChunkGroupInfo {
  return Boolean(value);
}

function Tag({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
        className,
      )}
    >
      {children}
    </span>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-md border bg-background/70 p-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
      {hint ? (
        <div className="mt-1 text-[10px] text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  );
}

export default function DependencyPanel({
  modules,
  chunks,
  chunkGroups,
  inputFiles,
  activeInputFile,
  setActiveInputFile,
  inputEditorRef,
}: DependencyPanelProps) {
  const [lines, setLines] = useState<LineInfo[]>([]);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<
    Record<string, boolean>
  >({});
  const [viewMode, setViewMode] = useState<GraphView>("module");
  const [chunkSearch, setChunkSearch] = useState("");
  const deferredChunkSearch = useDeferredValue(chunkSearch);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [selectedChunkId, setSelectedChunkId] = useState<string | null>(null);
  const decorationsRef =
    useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);
  const styleIdsRef = useRef<Set<string>>(new Set());

  const activeFile = inputFiles[activeInputFile];
  const monacoInstance = useMonaco();

  const currentModule = useMemo(() => {
    if (!activeFile) return null;

    return (
      modules.find(
        (module) =>
          matchesModulePath(module.name, activeFile.filename) ||
          matchesModulePath(module.path, activeFile.filename),
      ) ?? null
    );
  }, [activeFile, modules]);

  useEffect(() => {
    setSelectedModuleId(currentModule?.id ?? modules[0]?.id ?? null);
  }, [activeInputFile, currentModule?.id, modules[0]?.id]);

  const selectedModule = useMemo(() => {
    if (!selectedModuleId) return null;
    return modules.find((module) => module.id === selectedModuleId) ?? null;
  }, [modules, selectedModuleId]);

  const selectInputTabForModule = useCallback(
    (moduleId: string) => {
      setSelectedModuleId(moduleId);

      const targetModule = modules.find((module) => module.id === moduleId);
      if (!targetModule) return;

      const nextInputIndex = inputFiles.findIndex(
        (file) =>
          matchesModulePath(targetModule.path, file.filename) ||
          matchesModulePath(targetModule.name, file.filename),
      );

      if (nextInputIndex >= 0 && nextInputIndex !== activeInputFile) {
        setActiveInputFile(nextInputIndex);
      }
    },
    [activeInputFile, inputFiles, modules, setActiveInputFile],
  );

  const inspectedModule = selectedModule ?? currentModule;
  const isInspectingActiveFile = Boolean(
    inspectedModule && currentModule && inspectedModule.id === currentModule.id,
  );

  const chunkById = useMemo(
    () => new Map(chunks.map((chunk) => [chunk.id, chunk])),
    [chunks],
  );
  const chunkGroupById = useMemo(
    () => new Map(chunkGroups.map((group) => [group.id, group])),
    [chunkGroups],
  );

  const moduleChunkLookup = useMemo(() => {
    const lookup = new Map<string, Map<string, RspackChunkInfo>>();

    const attach = (key: string | undefined, chunk: RspackChunkInfo) => {
      const normalized = normalizePath(key);
      if (!normalized) return;

      if (!lookup.has(normalized)) {
        lookup.set(normalized, new Map());
      }

      lookup.get(normalized)?.set(chunk.id, chunk);
    };

    for (const chunk of chunks) {
      attach(chunk.id, chunk);
      for (const mod of chunk.modules) {
        attach(mod.id, chunk);
        attach(mod.name, chunk);
        attach(mod.path, chunk);
      }
    }

    return lookup;
  }, [chunks]);

  const getChunksForKeys = useCallback(
    (keys: Array<string | undefined>) => {
      const matches = new Map<string, RspackChunkInfo>();

      for (const key of keys) {
        const normalized = normalizePath(key);
        if (!normalized) continue;

        for (const chunk of moduleChunkLookup.get(normalized)?.values() ?? []) {
          matches.set(chunk.id, chunk);
        }
      }

      return [...matches.values()].sort(compareChunkInfo);
    },
    [moduleChunkLookup],
  );

  const currentChunks = useMemo(() => {
    if (!inspectedModule) return [];

    return getChunksForKeys([
      inspectedModule.id,
      inspectedModule.path,
      inspectedModule.name,
    ]);
  }, [getChunksForKeys, inspectedModule]);

  const currentChunkIds = useMemo(
    () => new Set(currentChunks.map((chunk) => chunk.id)),
    [currentChunks],
  );

  const currentGroups = useMemo(() => {
    const matches = new Map<string, RspackChunkGroupInfo>();

    for (const chunk of currentChunks) {
      for (const groupId of chunk.groups) {
        const group = chunkGroupById.get(groupId);
        if (group) {
          matches.set(group.id, group);
        }
      }
    }

    return [...matches.values()].sort(compareChunkGroupInfo);
  }, [chunkGroupById, currentChunks]);

  const currentGroupIds = useMemo(
    () => new Set(currentGroups.map((group) => group.id)),
    [currentGroups],
  );

  const allDepItems = useMemo<DepItem[]>(() => {
    if (!inspectedModule) return [];

    const items: DepItem[] = [];
    let idx = 0;

    inspectedModule.deps.forEach((dep, i) => {
      items.push({ dep, section: "dep", key: `dep-${i}`, colorIdx: idx++ });
    });

    (inspectedModule.presentationalDeps ?? []).forEach((dep, i) => {
      items.push({
        dep,
        section: "presentational",
        key: `presentational-${i}`,
        colorIdx: idx++,
      });
    });

    (inspectedModule.blocks ?? []).forEach((block, blockIndex) => {
      (block.dependencies ?? []).forEach((dep, depIndex) => {
        items.push({
          dep,
          section: "block",
          blockIndex,
          key: `block-${blockIndex}-${depIndex}`,
          colorIdx: idx++,
        });
      });
    });

    return items;
  }, [inspectedModule]);

  const totalDeps = allDepItems.length;

  const visibleGroups = chunkGroups;

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

  useEffect(() => {
    if (viewMode === "module") return;
    setShowAll(false);
    setHoveredKey(null);
    setLines([]);
    decorationsRef.current?.clear();
  }, [viewMode]);

  useEffect(() => {
    setShowAll(false);
    setHoveredKey(null);
    setLines([]);
    decorationsRef.current?.clear();
  }, [inspectedModule?.id, isInspectingActiveFile]);

  useEffect(() => {
    const ids = styleIdsRef.current;
    return () => {
      for (const id of ids) {
        document.getElementById(id)?.remove();
      }
      ids.clear();
    };
  }, []);

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
      const startY = editorRect.top + startCoords.top + startCoords.height / 2;

      const inputPanel = editorDom.closest("[id='input']")?.parentElement;
      if (!inputPanel) return null;

      const allTabs = Array.from(
        inputPanel.querySelectorAll<HTMLElement>("[data-filename]"),
      );
      let tabEl: HTMLElement | null = null;
      for (const tab of allTabs) {
        const filename = tab.getAttribute("data-filename") || "";
        if (matchesModulePath(filename, dep.targetModuleName)) {
          tabEl = tab;
          break;
        }
      }

      if (!tabEl) return null;

      const tabRect = tabEl.getBoundingClientRect();
      const color = getDepColor(colorIndex, totalDeps);
      return {
        startX,
        startY,
        endX: tabRect.left + tabRect.width / 2,
        endY: tabRect.top + tabRect.height / 2,
        color,
      };
    },
    [inputEditorRef, totalDeps],
  );

  const recalcAllLines = useCallback(() => {
    const newLines: LineInfo[] = [];
    for (const item of allDepItems) {
      const line = drawLineToModule(item.dep, item.colorIdx);
      if (line) {
        newLines.push(line);
      }
    }
    setLines(newLines);
  }, [allDepItems, drawLineToModule]);

  const recalcHoveredLine = useCallback(
    (key: string) => {
      const item = allDepItems.find((depItem) => depItem.key === key);
      if (!item) return;

      const line = drawLineToModule(item.dep, item.colorIdx);
      setLines(line ? [line] : []);
    },
    [allDepItems, drawLineToModule],
  );

  useEffect(() => {
    if (viewMode !== "module") return;

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
  }, [hoveredKey, recalcAllLines, recalcHoveredLine, showAll, viewMode]);

  const handleDepHover = useCallback(
    (dep: RspackDependency, colorIndex: number, key: string) => {
      if (showAll || viewMode !== "module" || !isInspectingActiveFile) return;

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
    [
      drawLineToModule,
      highlightRange,
      isInspectingActiveFile,
      showAll,
      totalDeps,
      viewMode,
    ],
  );

  const handleDepLeave = useCallback(() => {
    if (showAll || viewMode !== "module" || !isInspectingActiveFile) return;
    setHoveredKey(null);
    decorationsRef.current?.clear();
    setLines([]);
  }, [isInspectingActiveFile, showAll, viewMode]);

  const handleShowAll = useCallback(() => {
    if (viewMode !== "module" || !isInspectingActiveFile) return;

    if (showAll) {
      setShowAll(false);
      setLines([]);
      decorationsRef.current?.clear();
      return;
    }

    setShowAll(true);
    const decorations: Monaco.editor.IModelDeltaDecoration[] = [];

    for (const item of allDepItems) {
      const color = getDepColor(item.colorIdx, totalDeps);
      const decoration = highlightRange(item.dep, color);
      if (decoration) {
        decorations.push(decoration);
      }
    }

    decorationsRef.current?.set(decorations);
    recalcAllLines();
  }, [
    allDepItems,
    highlightRange,
    isInspectingActiveFile,
    recalcAllLines,
    showAll,
    totalDeps,
    viewMode,
  ]);

  useEffect(() => {
    const editor = inputEditorRef.current;
    if (
      !editor ||
      !inspectedModule ||
      !isInspectingActiveFile ||
      viewMode !== "module"
    ) {
      return;
    }

    const disposable = editor.onMouseMove(
      (event: Monaco.editor.IEditorMouseEvent) => {
        if (showAll || !event.target.position) return;

        const { lineNumber, column } = event.target.position;
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
      },
    );

    const leaveDisposable = editor.onMouseLeave(() => {
      if (!showAll) {
        handleDepLeave();
      }
    });

    return () => {
      disposable.dispose();
      leaveDisposable.dispose();
    };
  }, [
    allDepItems,
    handleDepHover,
    handleDepLeave,
    inputEditorRef,
    inspectedModule,
    isInspectingActiveFile,
    showAll,
    viewMode,
  ]);

  const depItems = allDepItems.filter((item) => item.section === "dep");
  const presentationalItems = allDepItems.filter(
    (item) => item.section === "presentational",
  );
  const blockItems = allDepItems.filter((item) => item.section === "block");
  const blockGroups = new Map<number, DepItem[]>();
  for (const item of blockItems) {
    const blockIndex = item.blockIndex ?? 0;
    if (!blockGroups.has(blockIndex)) {
      blockGroups.set(blockIndex, []);
    }
    blockGroups.get(blockIndex)?.push(item);
  }

  const resolveChunks = useCallback(
    (chunkIds: string[]) => {
      return chunkIds
        .map((chunkId) => chunkById.get(chunkId))
        .filter(isChunkInfo)
        .sort(compareChunkInfo) as RspackChunkInfo[];
    },
    [chunkById],
  );

  const resolveGroups = useCallback(
    (groupIds: string[]) => {
      return groupIds
        .map((groupId) => chunkGroupById.get(groupId))
        .filter(isChunkGroupInfo)
        .sort(compareChunkGroupInfo) as RspackChunkGroupInfo[];
    },
    [chunkGroupById],
  );

  const visibleChunks = useMemo(() => {
    const ids = new Set<string>();
    const items: RspackChunkInfo[] = [];

    for (const group of visibleGroups) {
      for (const chunk of resolveChunks(group.chunks)) {
        if (ids.has(chunk.id)) continue;
        ids.add(chunk.id);
        items.push(chunk);
      }
    }

    return items.sort(compareChunkInfo);
  }, [resolveChunks, visibleGroups]);

  const visibleChunkIds = useMemo(
    () => new Set(visibleChunks.map((chunk) => chunk.id)),
    [visibleChunks],
  );

  useEffect(() => {
    if (viewMode !== "chunk") return;
    if (selectedChunkId && visibleChunkIds.has(selectedChunkId)) return;

    const nextSelectedChunkId = visibleChunkIds.has(selectedChunkId ?? "")
      ? selectedChunkId
      : null;

    if (nextSelectedChunkId !== selectedChunkId) {
      setSelectedChunkId(nextSelectedChunkId);
    }
  }, [
    selectedChunkId,
    viewMode,
    visibleChunkIds,
  ]);

  const selectedChunk = useMemo(() => {
    if (!selectedChunkId) return null;
    return chunkById.get(selectedChunkId) ?? null;
  }, [chunkById, selectedChunkId]);

  const selectedChunkGroups = useMemo(() => {
    if (!selectedChunk) return [];
    return resolveGroups(selectedChunk.groups);
  }, [resolveGroups, selectedChunk]);

  const selectedChunkReasons = useMemo(() => {
    const reasons = new Set<string>();

    for (const group of selectedChunkGroups) {
      for (const origin of group.origins) {
        reasons.add(origin);
      }
    }

    return [...reasons].sort();
  }, [selectedChunkGroups]);

  const chunkSearchQuery = deferredChunkSearch.trim().toLowerCase();

  const filteredSelectedChunkModules = useMemo(() => {
    if (!selectedChunk) return [];

    const sortedModules = [...selectedChunk.modules].sort(compareChunkModuleRef);
    if (!chunkSearchQuery) {
      return sortedModules;
    }

    return sortedModules.filter((module) =>
      includesGraphText([module.id, module.name, module.path], chunkSearchQuery),
    );
  }, [chunkSearchQuery, selectedChunk]);

  const renderChunkBadge = (
    chunk: RspackChunkInfo,
    {
      highlight = false,
    }: {
      highlight?: boolean;
    } = {},
  ) => {
    return (
      <Tag
        key={`chunk-${chunk.id}`}
        className={cn(
          "max-w-full truncate border-border/60 bg-background text-foreground",
          highlight && "border-primary/40 bg-primary/10 text-primary",
        )}
      >
        {chunk.name}
      </Tag>
    );
  };

  const renderGroupBadge = (
    group: RspackChunkGroupInfo,
    {
      highlight = false,
      relation,
    }: {
      highlight?: boolean;
      relation?: "parent" | "child";
    } = {},
  ) => {
    const prefix =
      relation === "parent" ? "from " : relation === "child" ? "to " : "";

    return (
      <Tag
        key={`${relation ?? "group"}-${group.id}`}
        className={cn(
          "max-w-full truncate border-border/60 bg-background text-foreground",
          highlight && "border-primary/40 bg-primary/10 text-primary",
        )}
      >
        {prefix}
        {group.name}
      </Tag>
    );
  };

  const renderDepItem = (item: DepItem) => {
    const { dep, key, colorIdx } = item;
    const depColor = getDepColor(colorIdx, totalDeps);
    const isHovered = hoveredKey === key;
    const targetChunks = getChunksForKeys([
      dep.targetModuleId,
      dep.targetModuleName,
      dep.targetModule,
    ]);
    const isCrossChunk = targetChunks.some(
      (chunk) => !currentChunkIds.has(chunk.id),
    );

    return (
      <div
        key={key}
        onMouseEnter={() => handleDepHover(dep, colorIdx, key)}
        onMouseLeave={handleDepLeave}
        className="cursor-pointer border-b border-border/50 px-3 py-2 transition-colors hover:bg-accent/40"
        style={{
          borderLeft: `3px solid ${depColor}`,
          backgroundColor: isHovered ? `${depColor}22` : undefined,
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {dep.type ? <Tag className="bg-muted">{dep.type}</Tag> : null}
              {dep.targetModuleCategory ? (
                <Tag className={categoryClassName(dep.targetModuleCategory)}>
                  {categoryLabel(dep.targetModuleCategory)}
                </Tag>
              ) : null}
              {isCrossChunk ? (
                <Tag className="border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300">
                  cross-chunk
                </Tag>
              ) : null}
            </div>
            <div
              className="mt-1 truncate text-xs font-medium"
              style={{ color: depColor }}
            >
              {dep.targetModuleName || dep.userRequest || "(unresolved target)"}
            </div>
            {dep.userRequest && dep.userRequest !== dep.targetModuleName ? (
              <div className="mt-1 truncate text-[11px] text-muted-foreground">
                request: {dep.userRequest}
              </div>
            ) : null}
            {dep.loc ? (
              <div className="mt-1 text-[10px] text-muted-foreground">
                L{dep.loc.start.line}:{dep.loc.start.column}
              </div>
            ) : null}
          </div>
          {targetChunks.length > 0 ? (
            <div className="flex max-w-[45%] flex-wrap justify-end gap-1">
              {targetChunks.map((chunk) =>
                renderChunkBadge(chunk, {
                  highlight: currentChunkIds.has(chunk.id),
                }),
              )}
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  const toggleSection = (section: string) => {
    setCollapsedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const renderSection = (label: string, sectionKey: string, items: DepItem[]) => {
    if (items.length === 0) return null;

    return (
      <>
        <button
          type="button"
          onClick={() => toggleSection(sectionKey)}
          className="flex w-full items-center gap-1 border-b border-border/50 bg-muted/40 px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground hover:bg-muted/70"
        >
          <span className="text-[10px]">
            {collapsedSections[sectionKey] ? "\u25B6" : "\u25BC"}
          </span>
          {label} ({items.length})
        </button>
        {!collapsedSections[sectionKey] ? items.map(renderDepItem) : null}
      </>
    );
  };

  const renderModuleView = () => {
    if (modules.length === 0) {
      return (
        <div className="p-4 text-sm text-muted-foreground">
          No module graph data is available for the current build.
        </div>
      );
    }

    return (
      <div className="flex min-h-full flex-col">
        <div className="border-b p-3">
          <ModuleGraphCanvas
            modules={modules}
            currentModuleId={currentModule?.id ?? null}
            selectedModuleId={inspectedModule?.id ?? null}
            onSelectModule={selectInputTabForModule}
          />
        </div>

        <div className="grid grid-cols-2 gap-2 border-b p-3">
          <StatCard
            label="Chunks"
            value={currentChunks.length}
            hint={
              currentChunks.length > 0
                ? currentChunks.map((chunk) => chunk.name).join(", ")
                : "not assigned"
            }
          />
          <StatCard
            label="Chunk Groups"
            value={currentGroups.length}
            hint={
              currentGroups.length > 0
                ? currentGroups.map((group) => group.name).join(", ")
                : "not assigned"
            }
          />
        </div>

        {!currentModule ? (
          <div className="border-b p-3 text-sm text-muted-foreground">
            Current file is not part of the module graph. The graph above still
            shows the bundled module relationships; click a graph node to inspect
            its chunk placement and dependencies.
          </div>
        ) : null}

        {inspectedModule && !isInspectingActiveFile ? (
          <div className="border-b p-3 text-sm text-muted-foreground">
            You are inspecting a graph-selected module. Source-range highlighting
            and import hover sync only work when that module's file is active in
            the editor.
          </div>
        ) : null}

        {inspectedModule && currentGroups.length > 0 ? (
          <div className="border-b p-3">
            <div className="text-xs font-semibold text-muted-foreground">
              Module chunk groups
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {currentGroups.map((group) =>
                renderGroupBadge(group, {
                  highlight: currentGroupIds.has(group.id),
                }),
              )}
            </div>
          </div>
        ) : null}

        {inspectedModule ? (
          <div>
            {renderSection("dependencies", "dep", depItems)}
            {renderSection(
              "presentationalDependencies",
              "presentational",
              presentationalItems,
            )}
            {blockGroups.size > 0 ? (
              <>
                <button
                  type="button"
                  onClick={() => toggleSection("blocks")}
                  className="flex w-full items-center gap-1 border-b border-border/50 bg-muted/40 px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground hover:bg-muted/70"
                >
                  <span className="text-[10px]">
                    {collapsedSections.blocks ? "\u25B6" : "\u25BC"}
                  </span>
                  blocks ({blockGroups.size})
                </button>
                {!collapsedSections.blocks
                  ? [...blockGroups.entries()].map(([blockIndex, items]) => (
                      <div key={`block-${blockIndex}`}>
                        <div className="border-b border-border/30 bg-muted/20 px-3 py-1 text-[10px] font-medium text-muted-foreground">
                          Block {blockIndex} ({items.length} deps)
                        </div>
                        {items.map(renderDepItem)}
                      </div>
                    ))
                  : null}
              </>
            ) : null}
            {totalDeps === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">
                No dependencies found for this module.
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  };

  const renderChunkView = () => {
    if (chunkGroups.length === 0) {
      return (
        <div className="p-4 text-sm text-muted-foreground">
          No chunk group graph data is available for the current build.
        </div>
      );
    }

    return (
      <div className="flex min-h-full flex-col">
        <div className="border-b p-3">
          <ChunkGraphCanvas
            chunkGroups={visibleGroups}
            chunks={visibleChunks}
            currentChunkIds={[]}
            currentGroupIds={[]}
            focusGroupId={null}
            selectedChunkId={selectedChunkId}
            onSelectChunk={setSelectedChunkId}
          />
        </div>

        {selectedChunk ? (
          <div className="border-b p-3">
            <div className="rounded-lg border bg-background/70 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {selectedChunk.name}
                  </div>
                  <div className="mt-1 truncate text-[11px] text-muted-foreground">
                    {selectedChunk.files.join(", ") || selectedChunk.id}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1">
                  {selectedChunk.entry ? (
                    <Tag className="bg-muted">entry chunk</Tag>
                  ) : null}
                  {selectedChunk.initial ? (
                    <Tag className="bg-muted">initial</Tag>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <StatCard label="Modules" value={selectedChunk.modules.length} />
                <StatCard label="Groups" value={selectedChunkGroups.length} />
                <StatCard label="Reasons" value={selectedChunkReasons.length} />
              </div>

              {selectedChunkGroups.length > 0 ? (
                <div className="mt-3">
                  <div className="text-[11px] font-semibold text-muted-foreground">
                    Member groups
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {selectedChunkGroups.map((group) =>
                      renderGroupBadge(group),
                    )}
                  </div>
                </div>
              ) : null}

              {selectedChunkReasons.length > 0 ? (
                <div className="mt-3">
                  <div className="text-[11px] font-semibold text-muted-foreground">
                    Chunk reasons
                  </div>
                  <div className="mt-2 space-y-1">
                    {selectedChunkReasons.map((reason) => (
                      <div
                        key={`${selectedChunk.id}-${reason}`}
                        className="truncate text-[11px] text-muted-foreground"
                      >
                        {reason}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="border-b p-3 text-sm text-muted-foreground">
            Click a chunk in the graph above to inspect the modules bundled into it.
          </div>
        )}

        <div className="p-3">
          {selectedChunk ? (
            <div className="rounded-lg border bg-background/70">
              <div className="border-b px-3 py-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs font-semibold text-muted-foreground">
                    Chunk modules ({filteredSelectedChunkModules.length}
                    {chunkSearchQuery
                      ? ` / ${selectedChunk.modules.length} matched`
                      : ""}
                    )
                  </div>
                  <input
                    type="search"
                    value={chunkSearch}
                    onChange={(event) => setChunkSearch(event.target.value)}
                    placeholder="Search modules in chunk"
                    className="h-8 rounded-md border bg-background px-3 text-xs outline-none transition-colors placeholder:text-muted-foreground focus:border-primary sm:w-56"
                  />
                </div>
              </div>
              {filteredSelectedChunkModules.length > 0 ? (
                filteredSelectedChunkModules.map((module) => {
                  const isCurrentModule = Boolean(
                    currentModule &&
                      (module.id === currentModule.id ||
                        matchesModulePath(module.name, currentModule.name) ||
                        matchesModulePath(module.path, currentModule.path)),
                  );

                  return (
                    <div
                      key={`${selectedChunk.id}-${module.id}`}
                      className="border-b border-border/40 px-3 py-2 last:border-b-0"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {isCurrentModule ? (
                              <Tag className="border-primary/40 bg-primary/10 text-primary">
                                active module
                              </Tag>
                            ) : null}
                          </div>
                          <div className="mt-1 truncate text-xs font-medium">
                            {module.name}
                          </div>
                          {module.path && module.path !== module.name ? (
                            <div className="mt-1 truncate text-[11px] text-muted-foreground">
                              {module.path}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-4 text-sm text-muted-foreground">
                  No modules in this chunk matched the current search query.
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <>
      <DependencyLines lines={viewMode === "module" ? lines : []} />
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-b bg-muted/30 p-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-medium">Graph Explorer</div>
              <div className="text-[11px] text-muted-foreground">
                {modules.length} modules · {chunks.length} chunks ·{" "}
                {chunkGroups.length} groups
                {currentModule ? ` · active: ${currentModule.name}` : ""}
              </div>
            </div>
            {viewMode === "module" && totalDeps > 0 && isInspectingActiveFile ? (
              <button
                type="button"
                onClick={handleShowAll}
                className={cn(
                  "rounded-md px-2 py-1 text-xs transition-colors",
                  showAll
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-accent",
                )}
              >
                {showAll ? "Hide All" : "Show All"}
              </button>
            ) : null}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md border bg-background p-0.5">
              {(["module", "chunk"] as GraphView[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  className={cn(
                    "rounded-sm px-2 py-1 text-xs font-medium transition-colors",
                    viewMode === mode
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  {mode === "module" ? "Module Graph" : "Chunk Graph"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {viewMode === "module" ? renderModuleView() : renderChunkView()}
        </div>
      </div>
    </>
  );
}
