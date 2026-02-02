// Segment color palette for sourcemap visualization
// 16 distinct pastel colors with good contrast

const SEGMENT_COLORS = [
  { bg: "rgba(255, 99, 132, 0.25)", border: "rgba(255, 99, 132, 0.8)" }, // Pink
  { bg: "rgba(54, 162, 235, 0.25)", border: "rgba(54, 162, 235, 0.8)" }, // Blue
  { bg: "rgba(255, 206, 86, 0.25)", border: "rgba(255, 206, 86, 0.8)" }, // Yellow
  { bg: "rgba(75, 192, 192, 0.25)", border: "rgba(75, 192, 192, 0.8)" }, // Teal
  { bg: "rgba(153, 102, 255, 0.25)", border: "rgba(153, 102, 255, 0.8)" }, // Purple
  { bg: "rgba(255, 159, 64, 0.25)", border: "rgba(255, 159, 64, 0.8)" }, // Orange
  { bg: "rgba(46, 204, 113, 0.25)", border: "rgba(46, 204, 113, 0.8)" }, // Green
  { bg: "rgba(231, 76, 60, 0.25)", border: "rgba(231, 76, 60, 0.8)" }, // Red
  { bg: "rgba(52, 152, 219, 0.25)", border: "rgba(52, 152, 219, 0.8)" }, // Light Blue
  { bg: "rgba(155, 89, 182, 0.25)", border: "rgba(155, 89, 182, 0.8)" }, // Violet
  { bg: "rgba(241, 196, 15, 0.25)", border: "rgba(241, 196, 15, 0.8)" }, // Gold
  { bg: "rgba(26, 188, 156, 0.25)", border: "rgba(26, 188, 156, 0.8)" }, // Turquoise
  { bg: "rgba(230, 126, 34, 0.25)", border: "rgba(230, 126, 34, 0.8)" }, // Carrot
  { bg: "rgba(149, 165, 166, 0.25)", border: "rgba(149, 165, 166, 0.8)" }, // Gray
  { bg: "rgba(211, 84, 0, 0.25)", border: "rgba(211, 84, 0, 0.8)" }, // Pumpkin
  { bg: "rgba(142, 68, 173, 0.25)", border: "rgba(142, 68, 173, 0.8)" }, // Amethyst
];

export interface SegmentColor {
  bg: string;
  border: string;
}

/**
 * Get a color for a segment based on its index.
 * Colors cycle through the palette.
 */
export function getColorForSegment(index: number): SegmentColor {
  return SEGMENT_COLORS[index % SEGMENT_COLORS.length];
}

/**
 * Generate a consistent color index from a segment's position.
 * This ensures the same segment always gets the same color.
 */
export function getColorIndex(
  source: string,
  line: number,
  column: number
): number {
  // Simple hash combining source, line, and column
  let hash = 0;
  for (let i = 0; i < source.length; i++) {
    hash = (hash << 5) - hash + source.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  hash = (hash << 5) - hash + line;
  hash = (hash << 5) - hash + column;
  return Math.abs(hash) % SEGMENT_COLORS.length;
}

export { SEGMENT_COLORS };
