import React from 'react';
import { Visualization, ChartData, CodeData } from '../types';
import StoryboardCanvas, { CanvasNode, CanvasEdge } from './StoryboardCanvas';

// ─── Main Props ──────────────────────────────────────────────────────────────
interface Props {
  canvasNodes: CanvasNode[];
  canvasEdges: CanvasEdge[];
  currentStepIndex: number;
  relativeTime: number;
  stepDurations: number[];
  stepTitles: string[];
  highlightedIds: Set<string>;
  visualization?: Visualization;
  currentTime: number;
  duration: number;
  onLoadingChange?: (isLoading: boolean) => void;
}

const VisualizationRenderer: React.FC<Props> = ({
  canvasNodes,
  canvasEdges,
  currentStepIndex,
  relativeTime,
  stepDurations,
  stepTitles,
  highlightedIds,
  visualization,
  currentTime,
  duration,
  onLoadingChange,
}) => {
  // The canvas is now always fullscreen — explanations are embedded inside diagram nodes.
  return (
    <div className="relative w-full h-full rounded-[2.5rem] bg-[#020617] overflow-hidden">
      <StoryboardCanvas
        nodes={canvasNodes}
        edges={canvasEdges}
        currentStepIndex={currentStepIndex}
        relativeTime={relativeTime}
        stepDurations={stepDurations}
        stepTitles={stepTitles}
        highlightedIds={highlightedIds}
      />
    </div>
  );
};

export default VisualizationRenderer;
