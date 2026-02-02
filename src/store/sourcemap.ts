import { atom } from "jotai";

// Toggle sourcemap visualization (mutually exclusive with format output)
export const enableSourcemapAtom = atom(false);

// Parsed sourcemap data from bundle result: Map<output filename, raw sourcemap JSON>
export const sourcemapDataAtom = atom<Map<string, string>>(new Map());

// Current hover position in the editor
export interface EditorPosition {
  source: "input" | "output";
  filename: string;
  line: number;
  column: number;
}
export const hoverPositionAtom = atom<EditorPosition | null>(null);

// Mapped position computed from hover position and sourcemap
export interface MappedPosition {
  originalFilename: string;
  originalLine: number;
  originalColumn: number;
  originalColumnEnd?: number;
  generatedLine: number;
  generatedColumn: number;
  generatedColumnEnd?: number;
  // Whether the original file is currently visible in the input editor
  isOriginalVisible: boolean;
  // Color index for segment visualization
  colorIndex?: number;
}
export const mappedPositionAtom = atom<MappedPosition | null>(null);
