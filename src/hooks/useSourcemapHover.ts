import { SourceMapConsumer } from "source-map-js";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { bundleResultAtom, enableFormatCode } from "@/store/bundler";
import {
  type MappedPosition,
  enableSourcemapAtom,
  hoverPositionAtom,
  mappedPositionAtom,
  sourcemapDataAtom,
} from "@/store/sourcemap";
import { getColorIndexForSegment } from "@/hooks/useSegmentDecorations";
import type * as Monaco from "monaco-editor";

interface UseSourcemapHoverOptions {
  inputEditorRef: React.RefObject<Monaco.editor.IStandaloneCodeEditor | null>;
  outputEditorRef: React.RefObject<Monaco.editor.IStandaloneCodeEditor | null>;
  inputFiles: { filename: string }[];
  outputFiles: { filename: string }[];
  activeInputIndex: number;
  activeOutputIndex: number;
}

export function useSourcemapHover({
  inputEditorRef,
  outputEditorRef,
  inputFiles,
  outputFiles,
  activeInputIndex,
  activeOutputIndex,
}: UseSourcemapHoverOptions) {
  const [enableSourcemap, setEnableSourcemap] = useAtom(enableSourcemapAtom);
  const [formatCode, setFormatCode] = useAtom(enableFormatCode);
  const bundleResult = useAtomValue(bundleResultAtom);
  const setHoverPosition = useSetAtom(hoverPositionAtom);
  const setMappedPosition = useSetAtom(mappedPositionAtom);
  const setSourcemapData = useSetAtom(sourcemapDataAtom);

  // Cache for parsed consumers and pre-computed mappings by line
  interface CachedConsumer {
    consumer: SourceMapConsumer;
    // Map<generatedLine, Mapping[]> - sorted by generatedColumn
    mappingsByLine: Map<
      number,
      {
        genCol: number;
        genColEnd?: number;
        genLine: number;
        source: string;
        origLine: number;
        origCol: number;
        origColEnd?: number;
        name?: string;
      }[]
    >;
    // Map<source, Map<line, Mapping[]>>
    mappingsByOriginal: Map<string, Map<number, any[]>>;
  }

  const consumerCache = useRef<Map<string, CachedConsumer>>(new Map());

  // When sourcemap is enabled, disable format code
  const handleEnableSourcemap = useCallback(
    (enabled: boolean) => {
      setEnableSourcemap(enabled);
      if (enabled && formatCode) {
        setFormatCode(false);
      }
    },
    [setEnableSourcemap, formatCode, setFormatCode]
  );

  // Update sourcemap data when bundle result changes
  useEffect(() => {
    if (bundleResult?.sourcemaps) {
      setSourcemapData(bundleResult.sourcemaps);
      // Clear consumer cache when sourcemaps change
      consumerCache.current.clear();
    }
  }, [bundleResult?.sourcemaps, setSourcemapData]);

  // Get or create sourcemap consumer for a file
  const getConsumer = useCallback(
    (filename: string): CachedConsumer | null => {
      if (!bundleResult?.sourcemaps) return null;

      const cached = consumerCache.current.get(filename);
      if (cached) return cached;

      const sourcemapJson = bundleResult.sourcemaps.get(filename);
      if (!sourcemapJson) return null;

      try {
        const parsed = JSON.parse(sourcemapJson);
        const consumer = new SourceMapConsumer(parsed);
        const mappingsByLine = new Map<number, any[]>();
        const mappingsByOriginal = new Map<string, Map<number, any[]>>();

        // Pre-compute mappings organized by line and original source
        consumer.eachMapping((m) => {
          const mapping = {
            genCol: m.generatedColumn,
            genLine: m.generatedLine,
            source: m.source,
            origLine: m.originalLine,
            origCol: m.originalColumn,
            name: m.name,
            genColEnd: undefined,
            origColEnd: undefined,
          };

          if (!mappingsByLine.has(m.generatedLine)) {
            mappingsByLine.set(m.generatedLine, []);
          }
          mappingsByLine.get(m.generatedLine)!.push(mapping);

          if (m.source && m.originalLine !== null) {
            if (!mappingsByOriginal.has(m.source)) {
              mappingsByOriginal.set(m.source, new Map());
            }
            const sourceMap = mappingsByOriginal.get(m.source)!;
            if (!sourceMap.has(m.originalLine)) {
              sourceMap.set(m.originalLine, []);
            }
            sourceMap.get(m.originalLine)!.push(mapping);
          }
        });

        // Sort and compute ends for GENERATED
        for (const [, mappings] of mappingsByLine.entries()) {
          mappings.sort((a, b) => a.genCol - b.genCol);
          for (let i = 0; i < mappings.length; i++) {
            const m = mappings[i];
            const next = mappings[i + 1];
            if (next) m.genColEnd = next.genCol;
          }
        }

        // Sort and compute ends for ORIGINAL
        for (const [, lines] of mappingsByOriginal.entries()) {
          for (const [, mappings] of lines.entries()) {
            mappings.sort((a, b) => a.origCol - b.origCol);
            for (let i = 0; i < mappings.length; i++) {
              const m = mappings[i];
              const next = mappings[i + 1];
              if (next) m.origColEnd = next.origCol;
            }
          }
        }

        const cachedData = { consumer, mappingsByLine, mappingsByOriginal };
        consumerCache.current.set(filename, cachedData);
        return cachedData;
      } catch {
        // Silently ignore sourcemap parsing errors
        return null;
      }
    },
    [bundleResult?.sourcemaps]
  );

  // Handle hover on output editor - map to source
  const handleOutputHover = useCallback(
    (position: { lineNumber: number; column: number }) => {
      if (!enableSourcemap) return;

      const outputFile = outputFiles[activeOutputIndex];
      if (!outputFile) return;

      const cached = getConsumer(outputFile.filename);
      if (!cached) return;

      const { mappingsByLine } = cached;
      const lineMappings = mappingsByLine.get(position.lineNumber);

      if (!lineMappings) {
        setHoverPosition(null);
        setMappedPosition(null);
        return;
      }

      // Find the segment containing the mouse column
      // We want the last mapping where genCol <= hoverColumn
      let match = null;
      let checkCol = position.column - 1; // Monaco 1-based -> SourceMap 0-based

      // Linear search is fine for typical line length, but could binary search if needed
      for (const m of lineMappings) {
        if (m.genCol <= checkCol) {
          match = m;
        } else {
          break;
        }
      }

      // If we found a match, ensure we haven't gone past its end (if it has a defined end)
      // Though technically sourcemaps extend to next mapping

      if (match && match.source && match.origLine !== null) {
        let targetFile: { filename: string } | undefined;

        // Try to find the matching input file using various path formats
        const candidates = [
          match.source,
          match.source.replace(/^webpack:\/\/\//, ""),
          match.source.replace(/^\.\//, ""),
        ];

        for (const c of candidates) {
          targetFile = inputFiles.find(
            (f) => f.filename === c || c.endsWith(f.filename)
          );
          if (targetFile) break;
        }

        if (targetFile) {
          const inputIndex = inputFiles.indexOf(targetFile);

          // Determine Generated Range
          const genColStart = match.genCol;
          let genColEnd = match.genColEnd || match.genCol + 10;

          // Look up color index for this segment
          const colorIndex = getColorIndexForSegment(
            match.source,
            match.origLine,
            match.origCol
          );

          const mappedPos: MappedPosition = {
            originalFilename: targetFile.filename,
            originalLine: match.origLine,
            originalColumn: match.origCol, // Full segment start
            originalColumnEnd: match.origColEnd, // Full segment end
            generatedLine: position.lineNumber,
            generatedColumn: genColStart,
            generatedColumnEnd: genColEnd,
            isOriginalVisible: inputIndex === activeInputIndex,
            colorIndex,
          };

          setHoverPosition({
            source: "output",
            filename: outputFile.filename,
            line: position.lineNumber,
            column: position.column,
          });
          setMappedPosition(mappedPos);
          return;
        }
      }

      // No match found
      // setHoverPosition(null); // Optional: keep previous or clear?
    },
    [
      enableSourcemap,
      outputFiles,
      activeOutputIndex,
      getConsumer,
      inputFiles,
      activeInputIndex,
    ]
  );

  // Handle hover on input editor - map to output
  const handleInputHover = useCallback(
    (position: { lineNumber: number; column: number }) => {
      if (!enableSourcemap) return;

      const inputFile = inputFiles[activeInputIndex];
      if (!inputFile) return;

      let found = false;

      // Iterate output files to find where this source is mapped
      for (const outputFile of outputFiles) {
        const cached = getConsumer(outputFile.filename);
        if (!cached) continue;

        const { mappingsByOriginal } = cached;

        // Find key matching input file
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

        if (!sourceKey) continue;

        const sourceMappings = mappingsByOriginal.get(sourceKey)!;
        const lineMappings = sourceMappings.get(position.lineNumber);

        if (!lineMappings) continue;

        // Find segment
        const checkCol = position.column - 1;
        let match = null;

        for (const m of lineMappings) {
          if (m.origCol <= checkCol) {
            match = m;
          } else {
            break;
          }
        }

        // Check if we are past the segment
        // If origColEnd is undefined, assume segment is just the identifier (use name length or default)
        if (match) {
          let effectiveEnd: number;
          if (match.origColEnd !== undefined) {
            effectiveEnd = match.origColEnd;
          } else {
            // Estimate segment width: use name length if available, else default to start + 1
            const nameLen = match.name ? match.name.length : 1;
            effectiveEnd = match.origCol + nameLen;
          }

          // Check if cursor is past the effective segment end
          if (checkCol >= effectiveEnd) {
            match = null;
          }
        }

        if (match) {
          const genColStart = match.genCol;
          const genColEnd = match.genColEnd || match.genCol + 10;

          // Calculate effective source segment end
          let effectiveOrigEnd: number;
          if (match.origColEnd !== undefined) {
            effectiveOrigEnd = match.origColEnd;
          } else {
            const nameLen = match.name ? match.name.length : 1;
            effectiveOrigEnd = match.origCol + nameLen;
          }

          // Look up color index for this segment
          const colorIndex = getColorIndexForSegment(
            sourceKey,
            match.origLine,
            match.origCol
          );

          const mappedPos: MappedPosition = {
            originalFilename: inputFile.filename,
            originalLine: match.origLine,
            originalColumn: match.origCol, // Full segment start
            originalColumnEnd: effectiveOrigEnd, // Full segment end
            generatedLine: match.genLine,
            generatedColumn: genColStart,
            generatedColumnEnd: genColEnd,
            isOriginalVisible: true,
            colorIndex,
          };

          setHoverPosition({
            source: "input",
            filename: inputFile.filename,
            line: position.lineNumber,
            column: position.column,
          });
          setMappedPosition(mappedPos);
          found = true;
          break;
        }
      }

      if (!found) {
        setHoverPosition(null);
        setMappedPosition(null);
      }
    },
    [
      enableSourcemap,
      inputFiles,
      activeInputIndex,
      outputFiles,
      getConsumer,
      setHoverPosition,
      setMappedPosition,
    ]
  );

  // ... (rest of file: handleMouseLeave, effects)

  // Clear hover state when mouse leaves
  const handleMouseLeave = useCallback(() => {
    setHoverPosition(null);
    setMappedPosition(null);
  }, [setHoverPosition, setMappedPosition]);

  // Setup Monaco editor mouse event listeners
  useEffect(() => {
    const inputEditor = inputEditorRef.current;
    const outputEditor = outputEditorRef.current;

    if (!enableSourcemap) return;

    const disposables: Monaco.IDisposable[] = [];

    if (inputEditor) {
      disposables.push(
        inputEditor.onMouseMove((e: Monaco.editor.IEditorMouseEvent) => {
          if (e.target.position) {
            handleInputHover(e.target.position);
          }
        })
      );
      disposables.push(
        inputEditor.onMouseLeave(() => {
          handleMouseLeave();
        })
      );
    }

    if (outputEditor) {
      disposables.push(
        outputEditor.onMouseMove((e: Monaco.editor.IEditorMouseEvent) => {
          if (e.target.position) {
            handleOutputHover(e.target.position);
          }
        })
      );
      disposables.push(
        outputEditor.onMouseLeave(() => {
          handleMouseLeave();
        })
      );
    }

    return () => {
      for (const d of disposables) {
        d.dispose();
      }
    };
  }, [
    enableSourcemap,
    inputEditorRef,
    outputEditorRef,
    handleInputHover,
    handleOutputHover,
    handleMouseLeave,
  ]);

  // Cleanup consumers on unmount
  useEffect(() => {
    return () => {
      consumerCache.current.clear();
    };
  }, []);

  return {
    enableSourcemap,
    setEnableSourcemap: handleEnableSourcemap,
  };
}
