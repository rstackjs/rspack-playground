import { normalizePath } from "@/lib/normalizePath";

export type Point = {
  x: number;
  y: number;
};

export type ViewState = {
  panX: number;
  panY: number;
  scale: number;
};

export const normalizeGraphText = normalizePath;

export function labelFromGraphText(name: string) {
  const normalized = normalizeGraphText(name);
  const segments = normalized.split("/");
  return segments[segments.length - 1] || normalized || "item";
}

export function trimGraphLabel(value: string, maxLength = 26) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

export function includesGraphText(values: Array<string | undefined>, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;

  return values.some((value) => (value || "").toLowerCase().includes(normalizedQuery));
}

export function clampScale(scale: number, min = 0.45, max = 2.4) {
  return Math.min(Math.max(scale, min), max);
}

export function getSvgPoint(svg: SVGSVGElement, clientX: number, clientY: number) {
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  return point.matrixTransform(ctm.inverse());
}

export function projectPointToRect(
  center: Point,
  target: Point,
  width: number,
  height: number,
  inset = 0,
): Point {
  const halfWidth = Math.max(width / 2 - inset, 1);
  const halfHeight = Math.max(height / 2 - inset, 1);
  const deltaX = target.x - center.x;
  const deltaY = target.y - center.y;

  if (deltaX === 0 && deltaY === 0) {
    return center;
  }

  const scale =
    1 /
    Math.max(
      Math.abs(deltaX) / halfWidth || Number.MIN_VALUE,
      Math.abs(deltaY) / halfHeight || Number.MIN_VALUE,
    );

  return {
    x: center.x + deltaX * scale,
    y: center.y + deltaY * scale,
  };
}

export function buildCurvedPath(start: Point, end: Point) {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const direction = deltaX >= 0 ? 1 : -1;
  const horizontalTension = Math.max(Math.abs(deltaX) * 0.4, 52);
  const verticalTension = deltaY * 0.16;
  const control1 = {
    x: start.x + direction * horizontalTension,
    y: start.y + verticalTension,
  };
  const control2 = {
    x: end.x - direction * horizontalTension,
    y: end.y - verticalTension,
  };

  return [
    `M ${start.x} ${start.y}`,
    `C ${control1.x} ${control1.y},`,
    `${control2.x} ${control2.y},`,
    `${end.x} ${end.y}`,
  ].join(" ");
}
