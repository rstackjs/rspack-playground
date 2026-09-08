import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RspackChunkGroupInfo, RspackChunkInfo } from "@/lib/bundle/dependency";
import { cn } from "@/lib/utils";
import GraphControls, { useGraphRenderScale } from "./GraphControls";
import {
  buildCurvedPath,
  clampScale,
  getGraphFrame,
  getSvgPoint,
  labelFromGraphText,
  projectPointToRect,
  trimGraphLabel,
  type Point,
  type ViewState,
} from "./graphCanvasUtils";

interface ChunkGraphCanvasProps {
  chunkGroups: RspackChunkGroupInfo[];
  chunks: RspackChunkInfo[];
  currentChunkIds?: string[];
  currentGroupIds?: string[];
  focusGroupId?: string | null;
  selectedChunkId?: string | null;
  onSelectChunk?: (chunkId: string) => void;
  className?: string;
}

interface ChunkGroupNode {
  id: string;
  name: string;
  initial: boolean;
  parents: string[];
  children: string[];
  chunks: RspackChunkInfo[];
  width: number;
  height: number;
}

interface ChunkGroupEdge {
  id: string;
  sourceId: string;
  targetId: string;
}

type LayoutResult = {
  positions: Record<string, Point>;
  width: number;
  height: number;
};

type DragState =
  | {
      kind: "pan";
      startPoint: Point;
      startPan: Point;
    }
  | {
      kind: "node";
      nodeId: string;
      startWorld: Point;
      startNode: Point;
    };

const GROUP_NODE_WIDTH = 296;
const GROUP_HEADER_HEIGHT = 64;
const GROUP_PADDING = 12;
const CHUNK_ROW_HEIGHT = 40;
const CHUNK_ROW_GAP = 8;
const COLUMN_GAP = 360;
const NODE_GAP = 28;

function compareChunkInfo(a: RspackChunkInfo, b: RspackChunkInfo) {
  return (
    Number(b.entry) - Number(a.entry) ||
    Number(b.initial) - Number(a.initial) ||
    a.name.localeCompare(b.name)
  );
}

function buildGraph(
  chunkGroups: RspackChunkGroupInfo[],
  chunks: RspackChunkInfo[],
): { nodes: ChunkGroupNode[]; edges: ChunkGroupEdge[] } {
  const chunkById = new Map(chunks.map((chunk) => [chunk.id, chunk]));
  const nodes = chunkGroups.map((group) => {
    const groupChunks = group.chunks
      .map((chunkId) => chunkById.get(chunkId))
      .filter((chunk): chunk is RspackChunkInfo => Boolean(chunk))
      .sort(compareChunkInfo);
    const chunkRows = Math.max(groupChunks.length, 1);

    return {
      id: group.id,
      name: group.name,
      initial: group.initial,
      parents: group.parents,
      children: group.children,
      chunks: groupChunks,
      width: GROUP_NODE_WIDTH,
      height:
        GROUP_HEADER_HEIGHT +
        GROUP_PADDING * 2 +
        chunkRows * CHUNK_ROW_HEIGHT +
        Math.max(chunkRows - 1, 0) * CHUNK_ROW_GAP,
    };
  });

  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = new Map<string, ChunkGroupEdge>();

  for (const group of chunkGroups) {
    for (const childId of group.children) {
      if (!nodeIds.has(childId)) continue;
      const id = `${group.id}->${childId}`;
      if (!edges.has(id)) {
        edges.set(id, {
          id,
          sourceId: group.id,
          targetId: childId,
        });
      }
    }

    for (const parentId of group.parents) {
      if (!nodeIds.has(parentId)) continue;
      const id = `${parentId}->${group.id}`;
      if (!edges.has(id)) {
        edges.set(id, {
          id,
          sourceId: parentId,
          targetId: group.id,
        });
      }
    }
  }

  return {
    nodes: nodes.sort(
      (a, b) => Number(b.initial) - Number(a.initial) || a.name.localeCompare(b.name),
    ),
    edges: [...edges.values()],
  };
}

function buildLayout(
  nodes: ChunkGroupNode[],
  edges: ChunkGroupEdge[],
  focusGroupId?: string | null,
): LayoutResult {
  if (nodes.length === 0) {
    return {
      positions: {},
      width: 960,
      height: 560,
    };
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const adjacency = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();
  const outgoing = new Map<string, Set<string>>();

  for (const node of nodes) {
    adjacency.set(node.id, new Set());
    incoming.set(node.id, new Set());
    outgoing.set(node.id, new Set());
  }

  for (const edge of edges) {
    adjacency.get(edge.sourceId)?.add(edge.targetId);
    adjacency.get(edge.targetId)?.add(edge.sourceId);
    incoming.get(edge.targetId)?.add(edge.sourceId);
    outgoing.get(edge.sourceId)?.add(edge.targetId);
  }

  const remaining = new Set(nodes.map((node) => node.id));
  const components: string[][] = [];

  while (remaining.size > 0) {
    const start =
      focusGroupId && remaining.has(focusGroupId) ? focusGroupId : remaining.values().next().value;
    if (!start) break;

    const queue = [start];
    const component: string[] = [];
    remaining.delete(start);

    while (queue.length > 0) {
      const currentId = queue.shift();
      if (!currentId) continue;

      component.push(currentId);

      for (const nextId of adjacency.get(currentId) ?? []) {
        if (!remaining.has(nextId)) continue;
        remaining.delete(nextId);
        queue.push(nextId);
      }
    }

    components.push(component);
  }

  components.sort((left, right) => {
    const leftFocused = focusGroupId ? left.includes(focusGroupId) : false;
    const rightFocused = focusGroupId ? right.includes(focusGroupId) : false;

    return Number(rightFocused) - Number(leftFocused) || right.length - left.length;
  });

  const positions: Record<string, Point> = {};
  let yOffset = 120;
  let maxX = 0;

  for (const component of components) {
    const componentSet = new Set(component);
    const root =
      (focusGroupId && component.includes(focusGroupId)
        ? focusGroupId
        : component.slice().sort((left, right) => {
            const leftNode = nodeById.get(left)!;
            const rightNode = nodeById.get(right)!;
            return (
              Number(rightNode.initial) - Number(leftNode.initial) ||
              rightNode.children.length - leftNode.children.length ||
              leftNode.name.localeCompare(rightNode.name)
            );
          })[0]) ?? component[0];

    const levels = new Map<string, number>();

    if (focusGroupId && component.includes(focusGroupId)) {
      levels.set(focusGroupId, 0);

      const forwardQueue = [focusGroupId];
      while (forwardQueue.length > 0) {
        const currentId = forwardQueue.shift();
        if (!currentId) continue;
        const level = levels.get(currentId) ?? 0;

        for (const nextId of outgoing.get(currentId) ?? []) {
          if (!componentSet.has(nextId)) continue;
          const nextLevel = level + 1;
          if (
            !levels.has(nextId) ||
            Math.abs(nextLevel) < Math.abs(levels.get(nextId) ?? Infinity)
          ) {
            levels.set(nextId, nextLevel);
            forwardQueue.push(nextId);
          }
        }
      }

      const backwardQueue = [focusGroupId];
      while (backwardQueue.length > 0) {
        const currentId = backwardQueue.shift();
        if (!currentId) continue;
        const level = levels.get(currentId) ?? 0;

        for (const prevId of incoming.get(currentId) ?? []) {
          if (!componentSet.has(prevId)) continue;
          const nextLevel = level - 1;
          if (
            !levels.has(prevId) ||
            Math.abs(nextLevel) < Math.abs(levels.get(prevId) ?? Infinity)
          ) {
            levels.set(prevId, nextLevel);
            backwardQueue.push(prevId);
          }
        }
      }
    } else {
      const queue = [root];
      levels.set(root, 0);

      while (queue.length > 0) {
        const currentId = queue.shift();
        if (!currentId) continue;
        const level = levels.get(currentId) ?? 0;

        for (const nextId of outgoing.get(currentId) ?? []) {
          if (!componentSet.has(nextId) || levels.has(nextId)) continue;
          levels.set(nextId, level + 1);
          queue.push(nextId);
        }

        for (const prevId of incoming.get(currentId) ?? []) {
          if (!componentSet.has(prevId) || levels.has(prevId)) continue;
          levels.set(prevId, level - 1);
          queue.push(prevId);
        }
      }
    }

    let progress = true;
    while (progress) {
      progress = false;

      for (const id of component) {
        if (levels.has(id)) continue;

        const candidates: number[] = [];

        for (const sourceId of incoming.get(id) ?? []) {
          const sourceLevel = levels.get(sourceId);
          if (sourceLevel !== undefined) {
            candidates.push(sourceLevel + 1);
          }
        }

        for (const targetId of outgoing.get(id) ?? []) {
          const targetLevel = levels.get(targetId);
          if (targetLevel !== undefined) {
            candidates.push(targetLevel - 1);
          }
        }

        if (candidates.length === 0) continue;

        candidates.sort((left, right) => Math.abs(left) - Math.abs(right) || left - right);
        levels.set(id, candidates[0]!);
        progress = true;
      }
    }

    const unresolved = component.filter((id) => !levels.has(id));
    const currentMaxLevel = levels.size > 0 ? Math.max(...Array.from(levels.values())) : 0;
    unresolved.forEach((id, index) => {
      levels.set(id, currentMaxLevel + index + 1);
    });

    const columns = new Map<number, string[]>();
    for (const id of component) {
      const level = levels.get(id) ?? 0;
      if (!columns.has(level)) {
        columns.set(level, []);
      }
      columns.get(level)?.push(id);
    }

    const sortedLevels = [...columns.keys()].sort((left, right) => left - right);
    const minLevel = sortedLevels[0] ?? 0;

    for (const level of sortedLevels) {
      columns.get(level)?.sort((left, right) => {
        const leftNode = nodeById.get(left)!;
        const rightNode = nodeById.get(right)!;
        return (
          Number(rightNode.initial) - Number(leftNode.initial) ||
          rightNode.chunks.length - leftNode.chunks.length ||
          leftNode.name.localeCompare(rightNode.name)
        );
      });
    }

    const columnHeights = sortedLevels.map((level) => {
      const column = columns.get(level) ?? [];
      return column.reduce((total, id, index) => {
        const node = nodeById.get(id)!;
        return total + node.height + (index > 0 ? NODE_GAP : 0);
      }, 0);
    });
    const componentHeight = Math.max(...columnHeights, 260);
    const centerY = yOffset + componentHeight / 2;

    for (const level of sortedLevels) {
      const column = columns.get(level) ?? [];
      const x = 220 + (level - minLevel) * COLUMN_GAP;
      const totalHeight = column.reduce((total, id, index) => {
        const node = nodeById.get(id)!;
        return total + node.height + (index > 0 ? NODE_GAP : 0);
      }, 0);
      let cursorY = centerY - totalHeight / 2;

      for (const id of column) {
        const node = nodeById.get(id)!;
        positions[id] = {
          x,
          y: cursorY + node.height / 2,
        };
        cursorY += node.height + NODE_GAP;
      }

      maxX = Math.max(maxX, x + GROUP_NODE_WIDTH / 2);
    }

    yOffset += componentHeight + 180;
  }

  return {
    positions,
    width: Math.max(maxX + 260, 1020),
    height: Math.max(yOffset - 48, 620),
  };
}

export default function ChunkGraphCanvas({
  chunkGroups,
  chunks,
  currentChunkIds = [],
  currentGroupIds = [],
  focusGroupId,
  selectedChunkId,
  onSelectChunk,
  className,
}: ChunkGraphCanvasProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const viewRef = useRef<ViewState>({ panX: 0, panY: 0, scale: 1 });
  const dragRef = useRef<DragState | null>(null);

  const graph = useMemo(() => buildGraph(chunkGroups, chunks), [chunkGroups, chunks]);
  const layout = useMemo(
    () => buildLayout(graph.nodes, graph.edges, focusGroupId),
    [focusGroupId, graph.edges, graph.nodes],
  );
  const chunkById = useMemo(() => new Map(chunks.map((chunk) => [chunk.id, chunk])), [chunks]);
  const [view, setView] = useState<ViewState>({
    panX: 0,
    panY: 0,
    scale: 1,
  });
  const [nodeOverrides, setNodeOverrides] = useState<Record<string, Point>>({});

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    setView({ panX: 0, panY: 0, scale: 1 });
    setNodeOverrides({});
  }, [focusGroupId, graph.nodes]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const svg = svgRef.current;
      const drag = dragRef.current;
      if (!svg || !drag) return;

      const point = getSvgPoint(svg, event.clientX, event.clientY);
      if (!point) return;

      if (drag.kind === "pan") {
        setView((prev) => ({
          ...prev,
          panX: drag.startPan.x + (point.x - drag.startPoint.x),
          panY: drag.startPan.y + (point.y - drag.startPoint.y),
        }));
        return;
      }

      const currentView = viewRef.current;
      const worldPoint = {
        x: (point.x - currentView.panX) / currentView.scale,
        y: (point.y - currentView.panY) / currentView.scale,
      };
      const delta = {
        x: worldPoint.x - drag.startWorld.x,
        y: worldPoint.y - drag.startWorld.y,
      };

      setNodeOverrides((prev) => ({
        ...prev,
        [drag.nodeId]: {
          x: drag.startNode.x + delta.x,
          y: drag.startNode.y + delta.y,
        },
      }));
    };

    const handlePointerUp = () => {
      dragRef.current = null;
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, []);

  const frame = useMemo(
    () =>
      getGraphFrame(
        graph.nodes.map((node) => ({
          position: layout.positions[node.id] ?? { x: 0, y: 0 },
          width: node.width,
          height: node.height,
        })),
      ),
    [graph.nodes, layout.positions],
  );

  const renderScale = useGraphRenderScale(svgRef, frame, view.scale);
  const compact = renderScale < 0.7;
  const labelSize = Math.min(24, 12 / renderScale);

  const positionedNodes = useMemo(() => {
    return graph.nodes.map((node) => ({
      ...node,
      position: nodeOverrides[node.id] ?? layout.positions[node.id] ?? { x: 0, y: 0 },
    }));
  }, [graph.nodes, layout.positions, nodeOverrides]);

  const nodeById = useMemo(
    () => new Map(positionedNodes.map((node) => [node.id, node])),
    [positionedNodes],
  );
  const currentChunkIdSet = useMemo(() => new Set(currentChunkIds), [currentChunkIds]);
  const currentGroupIdSet = useMemo(() => new Set(currentGroupIds), [currentGroupIds]);
  const selectedChunk = selectedChunkId ? chunkById.get(selectedChunkId) : undefined;

  const handleZoom = useCallback((clientX: number, clientY: number, deltaY: number) => {
    const svg = svgRef.current;
    if (!svg) return;

    const point = getSvgPoint(svg, clientX, clientY);
    if (!point) return;

    const current = viewRef.current;
    const nextScale = clampScale(current.scale * (deltaY < 0 ? 1.1 : 0.9));
    const worldPoint = {
      x: (point.x - current.panX) / current.scale,
      y: (point.y - current.panY) / current.scale,
    };

    setView({
      scale: nextScale,
      panX: point.x - worldPoint.x * nextScale,
      panY: point.y - worldPoint.y * nextScale,
    });
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      handleZoom(event.clientX, event.clientY, event.deltaY);
    };

    const preventGestureDefault = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };

    svg.addEventListener("wheel", handleWheel, { passive: false });
    svg.addEventListener("gesturestart", preventGestureDefault as EventListener);
    svg.addEventListener("gesturechange", preventGestureDefault as EventListener);
    svg.addEventListener("gestureend", preventGestureDefault as EventListener);

    return () => {
      svg.removeEventListener("wheel", handleWheel);
      svg.removeEventListener("gesturestart", preventGestureDefault as EventListener);
      svg.removeEventListener("gesturechange", preventGestureDefault as EventListener);
      svg.removeEventListener("gestureend", preventGestureDefault as EventListener);
    };
  }, [handleZoom]);

  const handleCanvasPointerDown = (event: ReactPointerEvent<SVGRectElement | SVGSVGElement>) => {
    if (event.button !== 0) return;
    const svg = svgRef.current;
    if (!svg) return;

    const point = getSvgPoint(svg, event.clientX, event.clientY);
    if (!point) return;

    dragRef.current = {
      kind: "pan",
      startPoint: point,
      startPan: {
        x: viewRef.current.panX,
        y: viewRef.current.panY,
      },
    };
  };

  const handleGroupPointerDown = (event: ReactPointerEvent<SVGGElement>, groupId: string) => {
    if (event.button !== 0) return;
    event.stopPropagation();

    const svg = svgRef.current;
    if (!svg) return;

    const point = getSvgPoint(svg, event.clientX, event.clientY);
    if (!point) return;

    const current = viewRef.current;
    const worldPoint = {
      x: (point.x - current.panX) / current.scale,
      y: (point.y - current.panY) / current.scale,
    };
    const node = nodeById.get(groupId);
    if (!node) return;

    dragRef.current = {
      kind: "node",
      nodeId: groupId,
      startWorld: worldPoint,
      startNode: node.position,
    };
  };

  const updateScale = (factor: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const center = getSvgPoint(svg, rect.x + rect.width / 2, rect.y + rect.height / 2);
    if (!center) return;
    setView((current) => {
      const scale = clampScale(current.scale * factor);
      return {
        scale,
        panX: center.x - ((center.x - current.panX) * scale) / current.scale,
        panY: center.y - ((center.y - current.panY) * scale) / current.scale,
      };
    });
  };

  if (graph.nodes.length === 0) {
    return (
      <div
        className={cn(
          "flex h-[420px] items-center justify-center rounded-lg border bg-muted/20 text-sm text-muted-foreground",
          className,
        )}
      >
        No chunk graph data available.
      </div>
    );
  }

  return (
    <div className={cn("overflow-hidden rounded-md border bg-card", className)}>
      <div className="flex h-11 items-center justify-between gap-2 border-b bg-muted/40 px-3">
        <h3 className="text-[11px] font-medium">Chunk groups</h3>
        <GraphControls
          scale={view.scale}
          onZoom={updateScale}
          onReset={() => {
            setView({ panX: 0, panY: 0, scale: 1 });
            setNodeOverrides({});
          }}
        />
      </div>

      <div className="graph-stage h-[360px] overflow-hidden">
        <svg
          ref={svgRef}
          viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
          className="h-full w-full touch-none select-none overscroll-none cursor-grab active:cursor-grabbing"
          aria-label="Chunk groups interactive canvas"
          onPointerDown={handleCanvasPointerDown}
        >
          <defs>
            <marker
              id="chunk-graph-arrow"
              markerWidth="6"
              markerHeight="6"
              refX="6"
              refY="3"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path d="M 0 0 L 6 3 L 0 6 z" fill="var(--graph-edge)" />
            </marker>
          </defs>

          <rect
            x={frame.x}
            y={frame.y}
            width={frame.width}
            height={frame.height}
            fill="transparent"
            onPointerDown={handleCanvasPointerDown}
          />

          <g transform={`translate(${view.panX} ${view.panY}) scale(${view.scale})`}>
            {graph.edges.map((edge) => {
              const source = nodeById.get(edge.sourceId);
              const target = nodeById.get(edge.targetId);
              if (!source || !target) return null;

              const start = projectPointToRect(
                source.position,
                target.position,
                source.width,
                source.height,
                -2,
              );
              const end = projectPointToRect(
                target.position,
                source.position,
                target.width,
                target.height,
                -8,
              );
              const isCurrent =
                currentGroupIdSet.has(edge.sourceId) || currentGroupIdSet.has(edge.targetId);

              return (
                <path
                  key={edge.id}
                  d={buildCurvedPath(start, end)}
                  fill="none"
                  stroke="var(--graph-edge)"
                  strokeWidth={isCurrent ? 2.6 : 1.6}
                  strokeOpacity={isCurrent ? 1 : 0.8}
                  markerEnd="url(#chunk-graph-arrow)"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            })}

            {positionedNodes.map((node) => {
              const isCurrentGroup = currentGroupIdSet.has(node.id);

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.position.x} ${node.position.y})`}
                  onPointerDown={(event) => handleGroupPointerDown(event, node.id)}
                  className="graph-node cursor-grab active:cursor-grabbing"
                >
                  <title>{node.name}</title>
                  <rect
                    x={-node.width / 2}
                    y={-node.height / 2}
                    width={node.width}
                    height={node.height}
                    rx="8"
                    ry="8"
                    strokeWidth={isCurrentGroup ? 1.5 : 1}
                    className="graph-node-surface"
                    data-selected={isCurrentGroup}
                  />
                  <line
                    x1={-node.width / 2}
                    y1={-node.height / 2 + GROUP_HEADER_HEIGHT}
                    x2={node.width / 2}
                    y2={-node.height / 2 + GROUP_HEADER_HEIGHT}
                    stroke="currentColor"
                    strokeOpacity="0.1"
                  />
                  <text
                    x={-node.width / 2 + 16}
                    y={-node.height / 2 + 24}
                    className="fill-foreground font-medium"
                    style={{ fontSize: compact ? labelSize : 13 }}
                  >
                    {trimGraphLabel(node.name, compact ? 14 : 23)}
                  </text>
                  <text
                    x={-node.width / 2 + 16}
                    y={-node.height / 2 + 42}
                    className="fill-muted-foreground"
                    style={{ fontSize: compact ? Math.min(18, 9 / renderScale) : 10 }}
                  >
                    {compact
                      ? `${node.initial ? "Initial" : "Async"} · ${node.chunks.length} ${node.chunks.length === 1 ? "chunk" : "chunks"}`
                      : `${node.chunks.length} chunks · ${node.parents.length} in · ${node.children.length} out`}
                  </text>
                  {!compact && (
                    <>
                      <rect
                        x={node.width / 2 - 68}
                        y={-node.height / 2 + 14}
                        width="52"
                        height="20"
                        rx="4"
                        ry="4"
                        className="fill-muted stroke-border"
                        strokeWidth="1"
                      />
                      <text
                        x={node.width / 2 - 42}
                        y={-node.height / 2 + 27}
                        textAnchor="middle"
                        className={cn(
                          "text-[10px] font-medium",
                          node.initial ? "fill-chart-2" : "fill-muted-foreground",
                        )}
                      >
                        {node.initial ? "initial" : "async"}
                      </text>
                    </>
                  )}

                  {node.chunks.length > 0 ? (
                    node.chunks.map((chunk, index) => {
                      const rowY =
                        -node.height / 2 +
                        GROUP_HEADER_HEIGHT +
                        GROUP_PADDING +
                        index * (CHUNK_ROW_HEIGHT + CHUNK_ROW_GAP);
                      const isSelectedChunk = selectedChunkId === chunk.id;
                      const isCurrentChunk = currentChunkIdSet.has(chunk.id);

                      return (
                        <g
                          key={`${node.id}-${chunk.id}`}
                          transform={`translate(${-node.width / 2 + GROUP_PADDING} ${rowY})`}
                        >
                          <title>{[chunk.name, ...chunk.files].join("\n")}</title>
                          <rect
                            x="0"
                            y="0"
                            width={node.width - GROUP_PADDING * 2}
                            height={CHUNK_ROW_HEIGHT}
                            rx="5"
                            ry="5"
                            strokeWidth={isSelectedChunk || isCurrentChunk ? 2 : 1}
                            className="graph-node-surface cursor-pointer"
                            data-selected={isSelectedChunk || isCurrentChunk}
                            role="button"
                            tabIndex={0}
                            aria-label={`Inspect chunk ${chunk.name}`}
                            aria-pressed={isSelectedChunk}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                onSelectChunk?.(chunk.id);
                              }
                            }}
                            onPointerDown={(event) => {
                              event.stopPropagation();
                            }}
                            onClick={(event) => {
                              event.stopPropagation();
                              onSelectChunk?.(chunk.id);
                            }}
                          />
                          <text
                            x="12"
                            y={compact ? 27 : 15}
                            className="fill-foreground font-medium"
                            style={{ fontSize: compact ? labelSize : 11 }}
                            pointerEvents="none"
                          >
                            {trimGraphLabel(labelFromGraphText(chunk.name), compact ? 18 : 28)}
                          </text>
                          {!compact && (
                            <text
                              x="12"
                              y="29"
                              className="fill-muted-foreground text-[10px]"
                              pointerEvents="none"
                            >
                              {`${chunk.modules.length} modules${chunk.files.length > 0 ? ` · ${chunk.files[0]}` : ""}`}
                            </text>
                          )}
                          {chunk.entry && !compact ? (
                            <>
                              <rect
                                x={node.width - GROUP_PADDING * 2 - 56}
                                y="9"
                                width="44"
                                height="20"
                                rx="4"
                                ry="4"
                                className="fill-muted stroke-border"
                                strokeWidth="1"
                                pointerEvents="none"
                              />
                              <text
                                x={node.width - GROUP_PADDING * 2 - 34}
                                y="22"
                                textAnchor="middle"
                                className="fill-muted-foreground text-[10px] font-medium"
                                pointerEvents="none"
                              >
                                entry
                              </text>
                            </>
                          ) : null}
                        </g>
                      );
                    })
                  ) : (
                    <text
                      x={-node.width / 2 + GROUP_PADDING + 4}
                      y={-node.height / 2 + GROUP_HEADER_HEIGHT + GROUP_PADDING + 18}
                      className="fill-muted-foreground text-[11px]"
                    >
                      No chunks in this group
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <div className="break-all border-t px-3 py-2.5 text-[10px] leading-relaxed text-muted-foreground">
        {selectedChunk ? (
          <span>
            Selected chunk:{" "}
            <span className="font-medium text-foreground">{selectedChunk.name}</span>
            {` · ${selectedChunk.modules.length} modules · ${selectedChunk.groups.length} groups`}
          </span>
        ) : (
          <span>Click a chunk inside a group card to inspect its modules.</span>
        )}
      </div>
    </div>
  );
}
