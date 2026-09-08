import { Minus, Plus, RotateCcw } from "lucide-react";
import { useEffect, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";

export function useGraphRenderScale(
  svgRef: RefObject<SVGSVGElement | null>,
  frame: { width: number; height: number },
  zoom: number,
) {
  const [fitScale, setFitScale] = useState(1);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width && height) setFitScale(Math.min(width / frame.width, height / frame.height));
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, [svgRef, frame.width, frame.height]);
  return fitScale * zoom;
}

export default function GraphControls({
  scale,
  onZoom,
  onReset,
}: {
  scale: number;
  onZoom: (factor: number) => void;
  onReset: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="Graph controls">
      <Button
        variant="ghost"
        size="icon"
        className="size-6 text-muted-foreground"
        aria-label="Zoom out"
        title="Zoom out"
        onClick={() => onZoom(1 / 1.15)}
      >
        <Minus className="size-3" />
      </Button>
      <span
        className="w-8 text-center text-[10px] tabular-nums text-muted-foreground"
        aria-live="polite"
      >
        {Math.round(scale * 100)}%
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-6 text-muted-foreground"
        aria-label="Zoom in"
        title="Zoom in"
        onClick={() => onZoom(1.15)}
      >
        <Plus className="size-3" />
      </Button>
      <span className="mx-1 h-3 w-px bg-border" />
      <Button
        variant="ghost"
        size="icon"
        className="size-6 text-muted-foreground"
        aria-label="Reset graph"
        title="Reset graph"
        onClick={onReset}
      >
        <RotateCcw className="size-3" />
      </Button>
    </div>
  );
}
