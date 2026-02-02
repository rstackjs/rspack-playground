import { useEffect, useRef } from "react";
import { useAtomValue } from "jotai";
import { enableSourcemapAtom, sourcemapDataAtom } from "@/store/sourcemap";
import { SourceMapConsumer } from "source-map-js";
import type * as Monaco from "monaco-editor";

interface UseSegmentDecorationsOptions {
  inputEditorRef: React.RefObject<Monaco.editor.IStandaloneCodeEditor | null>;
  outputEditorRef: React.RefObject<Monaco.editor.IStandaloneCodeEditor | null>;
  inputFiles: { filename: string }[];
  outputFiles: { filename: string }[];
  activeInputIndex: number;
  activeOutputIndex: number;
}

// Store mapping from segment position to color index
export const segmentColorMap = new Map<string, number>();

function getSegmentKey(filename: string, line: number, column: number): string {
  return `${filename}:${line}:${column}`;
}

export function useSegmentDecorations({
  inputEditorRef,
  outputEditorRef,
  inputFiles,
  outputFiles,
  activeInputIndex,
  activeOutputIndex,
}: UseSegmentDecorationsOptions) {
  const enableSourcemap = useAtomValue(enableSourcemapAtom);
  const sourcemapData = useAtomValue(sourcemapDataAtom);

  const inputDecorationsRef = useRef<string[]>([]);
  const outputDecorationsRef = useRef<string[]>([]);
  const colorIndexCounter = useRef(0);

  useEffect(() => {
    const inputEditor = inputEditorRef.current;
    const outputEditor = outputEditorRef.current;

    if (!enableSourcemap || !inputEditor || !outputEditor) {
      // Clear decorations when disabled
      if (inputEditor && inputDecorationsRef.current.length > 0) {
        inputDecorationsRef.current = inputEditor.deltaDecorations(
          inputDecorationsRef.current,
          []
        );
      }
      if (outputEditor && outputDecorationsRef.current.length > 0) {
        outputDecorationsRef.current = outputEditor.deltaDecorations(
          outputDecorationsRef.current,
          []
        );
      }
      segmentColorMap.clear();
      return;
    }

    const outputFile = outputFiles[activeOutputIndex];
    const inputFile = inputFiles[activeInputIndex];
    if (!outputFile || !inputFile) return;

    const rawSourcemap = sourcemapData.get(outputFile.filename);
    if (!rawSourcemap) return;

    try {
      const parsed = JSON.parse(rawSourcemap);
      const consumer = new SourceMapConsumer(parsed);

      const inputDecorations: Monaco.editor.IModelDeltaDecoration[] = [];
      const outputDecorations: Monaco.editor.IModelDeltaDecoration[] = [];

      // Reset color counter for consistent colors
      colorIndexCounter.current = 0;
      segmentColorMap.clear();

      // Collect all mappings
      const mappingsByGenLine = new Map<number, any[]>();
      const mappingsByOriginal = new Map<string, Map<number, any[]>>();

      consumer.eachMapping((m) => {
        if (m.generatedLine !== null && m.generatedColumn !== null) {
          if (!mappingsByGenLine.has(m.generatedLine)) {
            mappingsByGenLine.set(m.generatedLine, []);
          }
          mappingsByGenLine.get(m.generatedLine)!.push({
            genCol: m.generatedColumn,
            genLine: m.generatedLine,
            source: m.source,
            origLine: m.originalLine,
            origCol: m.originalColumn,
            name: m.name,
          });
        }

        if (m.source && m.originalLine !== null) {
          if (!mappingsByOriginal.has(m.source)) {
            mappingsByOriginal.set(m.source, new Map());
          }
          const sourceMap = mappingsByOriginal.get(m.source)!;
          if (!sourceMap.has(m.originalLine)) {
            sourceMap.set(m.originalLine, []);
          }
          sourceMap.get(m.originalLine)!.push({
            origCol: m.originalColumn,
            origLine: m.originalLine,
            genCol: m.generatedColumn,
            genLine: m.generatedLine,
            name: m.name,
          });
        }
      });

      // Compute ends for generated mappings
      for (const [, mappings] of mappingsByGenLine.entries()) {
        mappings.sort((a, b) => a.genCol - b.genCol);
        for (let i = 0; i < mappings.length; i++) {
          const m = mappings[i];
          const next = mappings[i + 1];
          m.genColEnd = next ? next.genCol : m.genCol + (m.name?.length || 5);
        }
      }

      // Compute ends for original mappings
      for (const [, lines] of mappingsByOriginal.entries()) {
        for (const [, mappings] of lines.entries()) {
          mappings.sort((a, b) => a.origCol - b.origCol);
          for (let i = 0; i < mappings.length; i++) {
            const m = mappings[i];
            const next = mappings[i + 1];
            m.origColEnd = next
              ? next.origCol
              : m.origCol + (m.name?.length || 5);
          }
        }
      }

      // Create output decorations
      for (const [line, mappings] of mappingsByGenLine.entries()) {
        for (const m of mappings) {
          const colorIndex = colorIndexCounter.current++;

          // Store color mapping for hover lookup
          if (m.source && m.origLine) {
            const key = getSegmentKey(m.source, m.origLine, m.origCol);
            segmentColorMap.set(key, colorIndex);
          }

          outputDecorations.push({
            range: {
              startLineNumber: line,
              startColumn: m.genCol + 1, // Monaco is 1-based
              endLineNumber: line,
              endColumn: m.genColEnd + 1,
            },
            options: {
              inlineClassName: `segment-bg-${colorIndex % 16}`,
              // Use CSS classes for styling
            },
          });
        }
      }

      // Create input decorations for the active file
      let sourceKey: string | undefined;
      for (const key of mappingsByOriginal.keys()) {
        if (
          key === inputFile.filename ||
          key.endsWith(inputFile.filename) ||
          inputFile.filename.endsWith(key)
        ) {
          sourceKey = key;
          break;
        }
      }

      if (sourceKey) {
        const sourceLines = mappingsByOriginal.get(sourceKey)!;
        for (const [line, mappings] of sourceLines.entries()) {
          for (const m of mappings) {
            // Look up color from the output mapping
            const key = getSegmentKey(sourceKey, m.origLine, m.origCol);
            const colorIndex =
              segmentColorMap.get(key) ?? colorIndexCounter.current++;
            segmentColorMap.set(key, colorIndex);

            inputDecorations.push({
              range: {
                startLineNumber: line,
                startColumn: m.origCol + 1,
                endLineNumber: line,
                endColumn: m.origColEnd + 1,
              },
              options: {
                inlineClassName: `segment-bg-${colorIndex % 16}`,
              },
            });
          }
        }
      }

      // Apply decorations
      inputDecorationsRef.current = inputEditor.deltaDecorations(
        inputDecorationsRef.current,
        inputDecorations
      );
      outputDecorationsRef.current = outputEditor.deltaDecorations(
        outputDecorationsRef.current,
        outputDecorations
      );
    } catch {
      // Silently ignore sourcemap parsing errors
    }
  }, [
    enableSourcemap,
    sourcemapData,
    inputEditorRef,
    outputEditorRef,
    inputFiles,
    outputFiles,
    activeInputIndex,
    activeOutputIndex,
  ]);

  return { segmentColorMap };
}

// Export helper for hover to get color index
export function getColorIndexForSegment(
  filename: string,
  line: number,
  column: number
): number | undefined {
  // Try exact match first
  const key = getSegmentKey(filename, line, column);
  if (segmentColorMap.has(key)) {
    return segmentColorMap.get(key);
  }

  // Try with webpack prefix
  const webpackKey = getSegmentKey(`webpack:///${filename}`, line, column);
  if (segmentColorMap.has(webpackKey)) {
    return segmentColorMap.get(webpackKey);
  }

  return undefined;
}
