import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import { hoverPositionAtom, mappedPositionAtom } from "@/store/sourcemap";
import { getColorForSegment } from "@/utils/segmentColors";
import type * as Monaco from "monaco-editor";

interface SourcemapOverlayProps {
  inputEditorRef: React.RefObject<Monaco.editor.IStandaloneCodeEditor | null>;
  outputEditorRef: React.RefObject<Monaco.editor.IStandaloneCodeEditor | null>;
  inputPanelRef: React.RefObject<HTMLDivElement | null>;
  outputPanelRef: React.RefObject<HTMLDivElement | null>;
  inputFiles: { filename: string }[];
  activeInputIndex: number;
  enabled: boolean;
}

interface BoxPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export default function SourcemapOverlay({
  inputEditorRef,
  outputEditorRef,
  inputPanelRef,
  outputPanelRef,
  inputFiles,
  activeInputIndex,
  enabled,
}: SourcemapOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hoverPosition = useAtomValue(hoverPositionAtom);
  const mappedPosition = useAtomValue(mappedPositionAtom);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Update canvas dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      const canvas = canvasRef.current;
      if (canvas?.parentElement) {
        const rect = canvas.parentElement.getBoundingClientRect();
        setDimensions({ width: rect.width, height: rect.height });
      }
    };

    // Initial update with a small delay to ensure parent is properly sized
    const timeoutId = setTimeout(updateDimensions, 100);

    // Use ResizeObserver for more reliable resize detection
    let resizeObserver: ResizeObserver | null = null;
    const canvas = canvasRef.current;
    if (canvas?.parentElement) {
      resizeObserver = new ResizeObserver(updateDimensions);
      resizeObserver.observe(canvas.parentElement);
    }

    window.addEventListener("resize", updateDimensions);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("resize", updateDimensions);
      resizeObserver?.disconnect();
    };
  }, [enabled]); // Re-run when enabled changes

  // Draw highlighting boxes and connecting line
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !enabled) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!hoverPosition || !mappedPosition) return;

    const inputEditor = inputEditorRef.current;
    const outputEditor = outputEditorRef.current;
    const inputPanel = inputPanelRef.current;
    const outputPanel = outputPanelRef.current;

    if (!inputEditor || !outputEditor || !inputPanel || !outputPanel) return;

    // Get panel positions relative to canvas parent
    const canvasParent = canvas.parentElement;
    if (!canvasParent) return;
    const canvasRect = canvasParent.getBoundingClientRect();

    // Calculate box positions
    let sourceBox: BoxPosition | null = null;
    let outputBox: BoxPosition | null = null;

    // Get the line height from editor - use multiple fallbacks
    let lineHeight = 20; // sensible default
    try {
      // Try to get from editor options
      const optionValue = outputEditor.getOption(66 /* EditorOption.lineHeight */);
      if (typeof optionValue === 'number' && optionValue > 0) {
        lineHeight = optionValue;
      } else {
        // Fallback: calculate from font size
        const fontSize = outputEditor.getOption(52 /* EditorOption.fontSize */) as number;
        if (typeof fontSize === 'number' && fontSize > 0) {
          lineHeight = Math.round(fontSize * 1.5);
        }
      }
    } catch {
      // Keep default
    }

    // Helper to calculate box from position
    const getBoxForPosition = (
      editor: Monaco.editor.IStandaloneCodeEditor,
      line: number,
      column: number, // 0-based
      editorDom: HTMLElement,
      panelRect: DOMRect,
      columnEnd?: number // 0-based
    ): BoxPosition | null => {
      const model = editor.getModel();
      if (!model) return null;

      let startColumn = column + 1;
      let endColumn = column + 2; // Default to 1 char width

      if (columnEnd !== undefined) {
        endColumn = columnEnd + 1;
        // Ensure sanity
        if (endColumn <= startColumn) endColumn = startColumn + 1;
      } else {
        // Try to find the word at the position
        // Monaco uses 1-based columns for getWordAtPosition
        const word = model.getWordAtPosition({
          lineNumber: line,
          column: column + 1,
        });

        if (word) {
          startColumn = word.startColumn;
          endColumn = word.endColumn;
        }
      }

      // Get accurate coordinates
      const startCoords = editor.getScrolledVisiblePosition({
        lineNumber: line,
        column: startColumn,
      });
      const endCoords = editor.getScrolledVisiblePosition({
        lineNumber: line,
        column: endColumn,
      });

      if (!startCoords || !endCoords) return null;

      const editorRect = editorDom.getBoundingClientRect();
      const left = editorRect.left - canvasRect.left + startCoords.left;
      const top = editorRect.top - canvasRect.top + startCoords.top;
      const width = endCoords.left - startCoords.left;

      // Ensure minimum width of 4px just in case
      const finalWidth = Math.max(width, 4);

      // Make the box tighter around text (don't fill full line height)
      // Usually text is centered in line height. 
      // Let's take 85% of line height and center it.
      const boxHeight = Math.floor(lineHeight * 0.85);
      const verticalPadding = Math.floor((lineHeight - boxHeight) / 2);

      return {
        x: left,
        y: top + verticalPadding,
        width: finalWidth,
        height: boxHeight,
      };
    };

    if (hoverPosition.source === "output") {
      // Hovering on output, show mapping to source
      const outputEditorDom = outputEditor.getDomNode();
      const inputEditorDom = inputEditor.getDomNode();
      if (!outputEditorDom || !inputEditorDom) return;

      // Get output position
      outputBox = getBoxForPosition(
        outputEditor,
        mappedPosition.generatedLine,
        mappedPosition.generatedColumn,
        outputEditorDom,
        canvasRect,
        mappedPosition.generatedColumnEnd
      );

      // Check if source file is visible
      if (mappedPosition.isOriginalVisible) {
        // Get source position
        sourceBox = getBoxForPosition(
          inputEditor,
          mappedPosition.originalLine,
          mappedPosition.originalColumn,
          inputEditorDom,
          canvasRect,
          mappedPosition.originalColumnEnd
        );
      } else {
        // Source file not visible - try to point to specific file tab
        // We look up the specific tab element using data-filename
        // IMPORTANT: Scope to inputPanel to avoid finding output tabs
        const selector = `[data-filename="${mappedPosition.originalFilename.replace(
          /"/g,
          '\\"'
        )}"]`;
        const tabElement = inputPanel.querySelector(selector);

        if (tabElement) {
          const tabRect = tabElement.getBoundingClientRect();
          // Sanity check: ensure the tab is visible in the viewport
          if (
            tabRect.left >= 0 &&
            tabRect.top >= 0 &&
            tabRect.left < window.innerWidth &&
            tabRect.top < window.innerHeight
          ) {
            sourceBox = {
              x: tabRect.left - canvasRect.left,
              y: tabRect.top - canvasRect.top,
              width: tabRect.width,
              height: tabRect.height,
            };
          } else {
            // Tab is scrolled out of view, use header fallback
            const inputPanelRect = inputPanel.getBoundingClientRect();
            sourceBox = {
              x: inputPanelRect.left - canvasRect.left + 20,
              y: inputPanelRect.top - canvasRect.top + 35,
              width: Math.min(200, inputPanelRect.width - 40),
              height: 24,
            };
          }
        } else {
          // Tab not found, fallback to header
          const inputPanelRect = inputPanel.getBoundingClientRect();
          sourceBox = {
            x: inputPanelRect.left - canvasRect.left + 20,
            y: inputPanelRect.top - canvasRect.top + 35,
            width: Math.min(200, inputPanelRect.width - 40),
            height: 24,
          };
        }
      }
    } else {
      // Hovering on input, show mapping to output
      const outputEditorDom = outputEditor.getDomNode();
      const inputEditorDom = inputEditor.getDomNode();
      if (!outputEditorDom || !inputEditorDom) return;

      // Get input position
      sourceBox = getBoxForPosition(
        inputEditor,
        mappedPosition.originalLine,
        mappedPosition.originalColumn,
        inputEditorDom,
        canvasRect,
        mappedPosition.originalColumnEnd
      );

      // Get output position
      outputBox = getBoxForPosition(
        outputEditor,
        mappedPosition.generatedLine,
        mappedPosition.generatedColumn,
        outputEditorDom,
        canvasRect,
        mappedPosition.generatedColumnEnd
      );
    }

    if (!sourceBox || !outputBox) {
      return;
    }

    // Get dynamic color based on segment colorIndex
    const colorIndex = mappedPosition.colorIndex ?? 0;
    const segmentColor = getColorForSegment(colorIndex);
    const strokeColor = segmentColor.border;
    const fillColor = segmentColor.bg;

    // Draw source highlight box
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.strokeRect(sourceBox.x, sourceBox.y, sourceBox.width, sourceBox.height);
    ctx.fillStyle = fillColor;
    ctx.fillRect(sourceBox.x, sourceBox.y, sourceBox.width, sourceBox.height);

    // Draw output highlight box
    ctx.strokeStyle = strokeColor;
    ctx.strokeRect(outputBox.x, outputBox.y, outputBox.width, outputBox.height);
    ctx.fillStyle = fillColor;
    ctx.fillRect(outputBox.x, outputBox.y, outputBox.width, outputBox.height);

    // Draw connecting bezier curve
    const startX = sourceBox.x + sourceBox.width;
    const startY = sourceBox.y + sourceBox.height / 2;
    const endX = outputBox.x;
    const endY = outputBox.y + outputBox.height / 2;

    // Control points for bezier curve
    const controlOffset = Math.min(Math.abs(endX - startX) / 2, 100);
    const cp1X = startX + controlOffset;
    const cp1Y = startY;
    const cp2X = endX - controlOffset;
    const cp2Y = endY;

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, endX, endY);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([]); // solid line
    ctx.stroke();

    // Draw arrow at the end
    const arrowSize = 8;
    const angle = Math.atan2(endY - cp2Y, endX - cp2X);
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(
      endX - arrowSize * Math.cos(angle - Math.PI / 6),
      endY - arrowSize * Math.sin(angle - Math.PI / 6),
    );
    ctx.moveTo(endX, endY);
    ctx.lineTo(
      endX - arrowSize * Math.cos(angle + Math.PI / 6),
      endY - arrowSize * Math.sin(angle + Math.PI / 6),
    );
    ctx.setLineDash([]);
    ctx.stroke();
  }, [
    enabled,
    hoverPosition,
    mappedPosition,
    inputEditorRef,
    outputEditorRef,
    inputPanelRef,
    outputPanelRef,
    inputFiles,
    activeInputIndex,
    dimensions,
  ]);

  if (!enabled) return null;

  return (
    <canvas
      ref={canvasRef}
      width={dimensions.width}
      height={dimensions.height}
      className="absolute inset-0 pointer-events-none z-50"
      style={{ width: "100%", height: "100%" }}
    />
  );
}
