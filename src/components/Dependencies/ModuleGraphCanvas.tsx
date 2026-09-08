import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  RspackDependency,
  RspackModuleCategory,
  RspackModuleDeps,
} from "@/lib/bundle/dependency";
import { cn } from "@/lib/utils";
import GraphControls from "./GraphControls";
import {
  clampScale,
  getGraphFrame,
  getSvgPoint,
  labelFromGraphText,
  normalizeGraphText,
  trimGraphLabel,
  type Point,
  type ViewState,
} from "./graphCanvasUtils";

interface ModuleGraphCanvasProps {
  modules: RspackModuleDeps[];
  currentModuleId?: string | null;
  selectedModuleId?: string | null;
  onSelectModule?: (moduleId: string) => void;
  className?: string;
}

interface GraphNode {
  id: string;
  name: string;
  category: RspackModuleCategory;
  isVirtual: boolean;
  inDegree: number;
  outDegree: number;
}

interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  kind: "dep" | "presentational" | "block";
  isDynamicImport: boolean;
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

function inferCategory(name: string, fallback?: RspackModuleCategory) {
  if (fallback) return fallback;
  const normalized = normalizeGraphText(name);
  if (!normalized) return "runtime";
  if (normalized.includes("node_modules")) return "dependency";
  return "source";
}

function collectDependencies(module: RspackModuleDeps) {
  return [
    ...module.deps.map((dep) => ({ dep, kind: "dep" as const })),
    ...(module.presentationalDeps ?? []).map((dep) => ({
      dep,
      kind: "presentational" as const,
    })),
    ...(module.blocks ?? []).flatMap((block) =>
      (block.dependencies ?? []).map((dep) => ({
        dep,
        kind: "block" as const,
      })),
    ),
  ];
}

function isDynamicImportEdge(_dep: RspackDependency, kind: GraphEdge["kind"]) {
  return kind === "block";
}

function buildGraph(modules: RspackModuleDeps[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes = new Map<string, GraphNode>();
  const aliases = new Map<string, string>();

  const registerAlias = (key: string | undefined, id: string) => {
    const normalized = normalizeGraphText(key);
    if (normalized) {
      aliases.set(normalized, id);
    }
  };

  for (const module of modules) {
    nodes.set(module.id, {
      id: module.id,
      name: module.name || module.path || module.id,
      category: module.category,
      isVirtual: false,
      inDegree: 0,
      outDegree: 0,
    });
    aliases.set(module.id, module.id);
    registerAlias(module.id, module.id);
    registerAlias(module.name, module.id);
    registerAlias(module.path, module.id);
  }

  const ensureVirtualNode = (dep: RspackDependency) => {
    const rawKey = dep.targetModuleId || dep.targetModuleName || dep.targetModule;
    const normalized = normalizeGraphText(rawKey);
    if (!normalized) return null;

    const existingId = aliases.get(normalized);
    if (existingId) {
      return existingId;
    }

    const id = `virtual:${normalized}`;
    if (!nodes.has(id)) {
      nodes.set(id, {
        id,
        name: dep.targetModuleName || dep.userRequest || normalized,
        category: inferCategory(normalized, dep.targetModuleCategory),
        isVirtual: true,
        inDegree: 0,
        outDegree: 0,
      });
    }
    aliases.set(normalized, id);
    return id;
  };

  const resolveTargetId = (dep: RspackDependency) => {
    const directId = dep.targetModuleId;
    if (directId && nodes.has(directId)) {
      return directId;
    }

    for (const key of [dep.targetModuleName, dep.targetModule]) {
      const normalized = normalizeGraphText(key);
      const resolvedId = aliases.get(normalized);
      if (resolvedId) {
        return resolvedId;
      }
    }

    return ensureVirtualNode(dep);
  };

  const edges = new Map<string, GraphEdge>();

  for (const module of modules) {
    for (const item of collectDependencies(module)) {
      const targetId = resolveTargetId(item.dep);
      if (!targetId || targetId === module.id) continue;

      const edgeId = `${module.id}->${targetId}:${item.kind}`;
      if (edges.has(edgeId)) continue;

      edges.set(edgeId, {
        id: edgeId,
        sourceId: module.id,
        targetId,
        kind: item.kind,
        isDynamicImport: isDynamicImportEdge(item.dep, item.kind),
      });
    }
  }

  for (const edge of edges.values()) {
    nodes.get(edge.sourceId)!.outDegree += 1;
    nodes.get(edge.targetId)!.inDegree += 1;
  }

  return {
    nodes: [...nodes.values()].sort((a, b) => {
      const categoryOrder = {
        source: 0,
        dependency: 1,
        runtime: 2,
      } satisfies Record<RspackModuleCategory, number>;

      return (
        categoryOrder[a.category] - categoryOrder[b.category] ||
        Number(a.isVirtual) - Number(b.isVirtual) ||
        a.name.localeCompare(b.name)
      );
    }),
    edges: [...edges.values()],
  };
}

function buildLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  currentModuleId?: string | null,
): LayoutResult {
  if (nodes.length === 0) {
    return {
      positions: {},
      width: 920,
      height: 520,
    };
  }

  const nodeIds = nodes.map((node) => node.id);
  const adjacency = new Map<string, Set<string>>();
  const incoming = new Map<string, Set<string>>();
  const outgoing = new Map<string, Set<string>>();

  for (const id of nodeIds) {
    adjacency.set(id, new Set());
    incoming.set(id, new Set());
    outgoing.set(id, new Set());
  }

  for (const edge of edges) {
    adjacency.get(edge.sourceId)?.add(edge.targetId);
    adjacency.get(edge.targetId)?.add(edge.sourceId);
    incoming.get(edge.targetId)?.add(edge.sourceId);
    outgoing.get(edge.sourceId)?.add(edge.targetId);
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const remaining = new Set(nodeIds);
  const components: string[][] = [];

  while (remaining.size > 0) {
    const preferredStart =
      currentModuleId && remaining.has(currentModuleId)
        ? currentModuleId
        : remaining.values().next().value;
    if (!preferredStart) break;
    const queue = [preferredStart];
    const component: string[] = [];
    remaining.delete(preferredStart);

    while (queue.length > 0) {
      const id = queue.shift();
      if (!id) continue;
      component.push(id);

      for (const neighbor of adjacency.get(id) ?? []) {
        if (!remaining.has(neighbor)) continue;
        remaining.delete(neighbor);
        queue.push(neighbor);
      }
    }

    components.push(component);
  }

  components.sort((left, right) => {
    const leftHasCurrent = currentModuleId ? left.includes(currentModuleId) : false;
    const rightHasCurrent = currentModuleId ? right.includes(currentModuleId) : false;

    return Number(rightHasCurrent) - Number(leftHasCurrent) || right.length - left.length;
  });

  const positions: Record<string, Point> = {};
  let yOffset = 110;
  let maxX = 0;

  for (const component of components) {
    const root =
      (currentModuleId && component.includes(currentModuleId)
        ? currentModuleId
        : [...component].sort((left, right) => {
            const leftNode = nodeById.get(left)!;
            const rightNode = nodeById.get(right)!;
            const leftScore = leftNode.outDegree * 3 - leftNode.inDegree;
            const rightScore = rightNode.outDegree * 3 - rightNode.inDegree;

            return (
              rightScore - leftScore ||
              Number(rightNode.category === "source") - Number(leftNode.category === "source") ||
              leftNode.name.localeCompare(rightNode.name)
            );
          })[0]) ?? component[0];
    const levels = new Map<string, number>();

    if (currentModuleId && component.includes(currentModuleId)) {
      levels.set(currentModuleId, 0);

      const forwardQueue = [currentModuleId];
      while (forwardQueue.length > 0) {
        const id = forwardQueue.shift();
        if (!id) continue;
        const level = levels.get(id) ?? 0;

        for (const neighbor of outgoing.get(id) ?? []) {
          if (!component.includes(neighbor)) continue;
          const nextLevel = level + 1;
          if (
            !levels.has(neighbor) ||
            Math.abs(nextLevel) < Math.abs(levels.get(neighbor) ?? Infinity)
          ) {
            levels.set(neighbor, nextLevel);
            forwardQueue.push(neighbor);
          }
        }
      }

      const backwardQueue = [currentModuleId];
      while (backwardQueue.length > 0) {
        const id = backwardQueue.shift();
        if (!id) continue;
        const level = levels.get(id) ?? 0;

        for (const neighbor of incoming.get(id) ?? []) {
          if (!component.includes(neighbor)) continue;
          const nextLevel = level - 1;
          if (
            !levels.has(neighbor) ||
            Math.abs(nextLevel) < Math.abs(levels.get(neighbor) ?? Infinity)
          ) {
            levels.set(neighbor, nextLevel);
            backwardQueue.push(neighbor);
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
    } else {
      levels.set(root, 0);
      const queue = [root];

      while (queue.length > 0) {
        const id = queue.shift();
        if (!id) continue;
        const level = levels.get(id) ?? 0;

        for (const neighbor of adjacency.get(id) ?? []) {
          if (levels.has(neighbor)) continue;
          levels.set(neighbor, level + 1);
          queue.push(neighbor);
        }
      }
    }

    const unresolved = component.filter((id) => !levels.has(id));
    const currentMaxLevel = levels.size > 0 ? Math.max(...Array.from(levels.values())) : 0;
    for (const [index, id] of unresolved.entries()) {
      levels.set(id, currentMaxLevel + 1 + index);
    }

    const columns = new Map<number, string[]>();
    for (const id of component) {
      const level = levels.get(id) ?? 0;
      if (!columns.has(level)) {
        columns.set(level, []);
      }
      columns.get(level)?.push(id);
    }

    const sortedLevels = [...columns.keys()].sort((left, right) => left - right);
    for (const level of sortedLevels) {
      columns.get(level)?.sort((left, right) => {
        const leftNode = nodeById.get(left)!;
        const rightNode = nodeById.get(right)!;
        return (
          Number(rightNode.category === "source") - Number(leftNode.category === "source") ||
          rightNode.outDegree - leftNode.outDegree ||
          leftNode.name.localeCompare(rightNode.name)
        );
      });
    }

    const columnHeight = Math.max(
      ...sortedLevels.map((level) => columns.get(level)?.length ?? 0),
      1,
    );
    const componentHeight = Math.max(columnHeight * 110, 220);
    const centerY = yOffset + componentHeight / 2;

    for (const level of sortedLevels) {
      const column = columns.get(level) ?? [];
      const x = 150 + level * 250;
      const totalHeight = Math.max((column.length - 1) * 104, 0);
      const yStart = centerY - totalHeight / 2;

      column.forEach((id, index) => {
        positions[id] = {
          x,
          y: yStart + index * 104,
        };
      });

      maxX = Math.max(maxX, x);
    }

    yOffset += componentHeight + 170;
  }

  return {
    positions,
    width: Math.max(maxX + 220, 960),
    height: Math.max(yOffset - 40, 560),
  };
}

const MODULE_EDGE_COLOR = "var(--graph-edge)";
const MODULE_EDGE_ARROW_COLOR = "var(--graph-edge)";
const MODULE_EDGE_MARKER_ID = "module-graph-arrow";

const MODULE_NODE_WIDTH = 220;
const MODULE_NODE_HEIGHT = 76;

export default function ModuleGraphCanvas({
  modules,
  currentModuleId,
  selectedModuleId,
  onSelectModule,
  className,
}: ModuleGraphCanvasProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const viewRef = useRef<ViewState>({ panX: 0, panY: 0, scale: 1 });
  const dragRef = useRef<DragState | null>(null);

  const graph = useMemo(() => buildGraph(modules), [modules]);
  const [layoutAnchorId, setLayoutAnchorId] = useState<string | null>(null);
  const layout = useMemo(
    () => buildLayout(graph.nodes, graph.edges, layoutAnchorId),
    [graph.edges, graph.nodes, layoutAnchorId],
  );

  const [view, setView] = useState<ViewState>({
    panX: 0,
    panY: 0,
    scale: 1,
  });
  const [nodeOverrides, setNodeOverrides] = useState<Record<string, Point>>({});
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    selectedModuleId ?? currentModuleId ?? graph.nodes[0]?.id ?? null,
  );

  useEffect(() => {
    setLayoutAnchorId((previousAnchorId) => {
      if (previousAnchorId && graph.nodes.some((node) => node.id === previousAnchorId)) {
        return previousAnchorId;
      }

      return currentModuleId ?? graph.nodes[0]?.id ?? null;
    });
  }, [currentModuleId, graph.nodes]);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  useEffect(() => {
    setSelectedNodeId(selectedModuleId ?? currentModuleId ?? graph.nodes[0]?.id ?? null);
  }, [currentModuleId, graph.nodes, selectedModuleId]);

  useEffect(() => {
    setNodeOverrides({});
    setView({ panX: 0, panY: 0, scale: 1 });
  }, [modules]);

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
          width: MODULE_NODE_WIDTH,
          height: MODULE_NODE_HEIGHT,
        })),
      ),
    [graph.nodes, layout.positions],
  );

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

  const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) : undefined;

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

  const handleNodePointerDown = (event: ReactPointerEvent<SVGGElement>, nodeId: string) => {
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

    const node = nodeById.get(nodeId);
    if (!node) return;

    dragRef.current = {
      kind: "node",
      nodeId,
      startWorld: worldPoint,
      startNode: node.position,
    };
    setSelectedNodeId(nodeId);
    if (!node.isVirtual) {
      onSelectModule?.(nodeId);
    }
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
          "flex h-[360px] items-center justify-center rounded-lg border bg-muted/20 text-sm text-muted-foreground",
          className,
        )}
      >
        No module graph data available.
      </div>
    );
  }

  return (
    <div className={cn("overflow-hidden rounded-md border bg-card", className)}>
      <div className="flex h-11 items-center justify-between gap-2 border-b bg-muted/40 px-3">
        <h3 className="text-[11px] font-medium">Module graph</h3>
        <GraphControls
          scale={view.scale}
          onZoom={updateScale}
          onReset={() => {
            setView({ panX: 0, panY: 0, scale: 1 });
            setNodeOverrides({});
          }}
        />
      </div>

      <div className="graph-stage h-[340px] overflow-hidden">
        <svg
          ref={svgRef}
          viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
          className="h-full w-full touch-none select-none overscroll-none cursor-grab active:cursor-grabbing"
          aria-label="Module graph interactive canvas"
          onPointerDown={handleCanvasPointerDown}
        >
          <defs>
            <marker
              id={MODULE_EDGE_MARKER_ID}
              markerWidth="6"
              markerHeight="6"
              refX="6"
              refY="3"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path d="M 0 0 L 6 3 L 0 6 z" fill={MODULE_EDGE_ARROW_COLOR} />
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

              const deltaX = target.position.x - source.position.x;
              const sameColumn = Math.abs(deltaX) < MODULE_NODE_WIDTH;
              const direction = sameColumn || deltaX < 0 ? -1 : 1;
              // Side ports keep long edges clear of other cards in the same column.
              const start = {
                x: source.position.x + direction * (MODULE_NODE_WIDTH / 2 + 2),
                y: source.position.y,
              };
              const end = {
                x: target.position.x + (sameColumn ? -1 : -direction) * (MODULE_NODE_WIDTH / 2 + 8),
                y: target.position.y,
              };
              const laneX = Math.min(start.x, end.x) - 28;
              const tension = Math.max(Math.abs(end.x - start.x) / 2, 12);
              const control1X = sameColumn ? laneX : start.x + direction * tension;
              const control2X = sameColumn ? laneX : end.x - direction * tension;
              return (
                <path
                  key={edge.id}
                  d={`M ${start.x} ${start.y} C ${control1X} ${start.y}, ${control2X} ${end.y}, ${end.x} ${end.y}`}
                  fill="none"
                  stroke={MODULE_EDGE_COLOR}
                  strokeWidth={1.5}
                  strokeOpacity={1}
                  markerEnd={`url(#${MODULE_EDGE_MARKER_ID})`}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={edge.isDynamicImport ? "8 6" : undefined}
                />
              );
            })}

            {positionedNodes.map((node) => {
              const isActive = currentModuleId === node.id;
              const isSelected = selectedNodeId === node.id;

              return (
                <g
                  key={node.id}
                  transform={`translate(${node.position.x} ${node.position.y})`}
                  onPointerDown={(event) => handleNodePointerDown(event, node.id)}
                  onClick={() => {
                    setSelectedNodeId(node.id);
                    if (!node.isVirtual) {
                      onSelectModule?.(node.id);
                    }
                  }}
                  className="graph-node cursor-grab active:cursor-grabbing"
                  role="button"
                  tabIndex={0}
                  aria-label={`Inspect module ${node.name}`}
                  aria-pressed={isSelected}
                  data-graph-node={node.id}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedNodeId(node.id);
                      if (!node.isVirtual) onSelectModule?.(node.id);
                    }
                  }}
                >
                  <title>{node.name}</title>
                  <rect
                    x={-MODULE_NODE_WIDTH / 2}
                    y={-MODULE_NODE_HEIGHT / 2}
                    rx="7"
                    ry="7"
                    width={MODULE_NODE_WIDTH}
                    height={MODULE_NODE_HEIGHT}
                    strokeWidth={isSelected || isActive ? 1.5 : 1}
                    strokeDasharray={node.isVirtual ? "6 5" : undefined}
                    data-selected={isActive || isSelected}
                    className="graph-node-surface"
                  />
                  <circle
                    cx="-91"
                    cy="-16"
                    r="3"
                    className={
                      node.category === "source"
                        ? "fill-chart-2"
                        : node.category === "dependency"
                          ? "fill-chart-1"
                          : "fill-chart-3"
                    }
                  />
                  <text x="-80" y="-12" className="fill-muted-foreground text-[9px]">
                    {node.category === "dependency"
                      ? "Package"
                      : node.category === "runtime"
                        ? "Runtime"
                        : "Source"}
                    {node.isVirtual ? " · reference" : ""}
                  </text>
                  <text x="-94" y="9" className="fill-foreground text-[16px] font-medium">
                    {trimGraphLabel(labelFromGraphText(node.name), 20)}
                  </text>
                  <text x="-94" y="26" className="fill-muted-foreground text-[9px] font-mono">
                    {trimGraphLabel(normalizeGraphText(node.name), 34)}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>

      <div className="break-all border-t px-3 py-2.5 text-[10px] leading-relaxed text-muted-foreground">
        {selectedNode ? (
          <span>
            Selected: <span className="font-medium text-foreground">{selectedNode.name}</span>
          </span>
        ) : (
          <span>Select a node to inspect its neighborhood.</span>
        )}
      </div>
    </div>
  );
}
