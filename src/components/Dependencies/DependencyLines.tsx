import { useEffect, useState } from "react";

interface LineInfo {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  color: string;
}

interface DependencyLinesProps {
  lines: LineInfo[];
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export const getDepColor = (index: number, total: number): string => {
  const hue = ((index * 360) / Math.max(total, 1)) % 360;
  return `hsl(${hue}, 70%, 55%)`;
};

export default function DependencyLines({
  lines,
  containerRef,
}: DependencyLinesProps) {
  const [containerBounds, setContainerBounds] = useState<DOMRect | null>(null);

  useEffect(() => {
    const updateBounds = () => {
      if (containerRef.current) {
        setContainerBounds(containerRef.current.getBoundingClientRect());
      }
    };

    updateBounds();
    window.addEventListener("resize", updateBounds);
    window.addEventListener("scroll", updateBounds, true);

    return () => {
      window.removeEventListener("resize", updateBounds);
      window.removeEventListener("scroll", updateBounds, true);
    };
  }, [containerRef]);

  if (!containerBounds || lines.length === 0) return null;

  return (
    <svg
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 1000,
      }}
    >
      <defs>
        {lines.map((line, idx) => (
          <marker
            key={`circle-${idx}`}
            id={`dep-arrowhead-${idx}`}
            markerWidth="8"
            markerHeight="8"
            refX="4"
            refY="4"
            orient="auto"
          >
            <circle cx="4" cy="4" r="3" fill={line.color} />
          </marker>
        ))}
      </defs>
      {lines.map((line, idx) => {
        const midX = (line.startX + line.endX) / 2;
        const pathD = `M ${line.startX} ${line.startY} C ${midX} ${line.startY}, ${midX} ${line.endY}, ${line.endX} ${line.endY}`;

        return (
          <g key={idx}>
            <path
              d={pathD}
              fill="none"
              stroke="rgba(0,0,0,0.3)"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <path
              d={pathD}
              fill="none"
              stroke={line.color}
              strokeWidth="2"
              strokeLinecap="round"
              markerEnd={`url(#dep-arrowhead-${idx})`}
            />
          </g>
        );
      })}
    </svg>
  );
}
