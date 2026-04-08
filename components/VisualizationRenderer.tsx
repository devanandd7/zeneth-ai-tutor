import React from 'react';
import { Visualization } from '../types';
import StoryboardCanvas, { CanvasNode, CanvasEdge } from './StoryboardCanvas';

interface Props {
  canvasNodes: CanvasNode[];
  canvasEdges: CanvasEdge[];
  currentStepIndex: number;
  relativeTime: number;
  stepDurations: number[];
  stepTitles: string[];
  stepNarratives: string[];
  highlightedIds: Set<string>;
  visualization?: Visualization;
  currentTime: number;
  duration: number;
  onLoadingChange?: (isLoading: boolean) => void;
  isSpeaking?: boolean;
  onFocusModeChange?: (v: boolean) => void;
}

const VisualizationRenderer: React.FC<Props> = ({
  canvasNodes, canvasEdges,
  currentStepIndex, relativeTime, stepDurations, stepTitles, stepNarratives,
  highlightedIds, isSpeaking, onFocusModeChange,
}) => {
  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: '#020810' }}>
      <StoryboardCanvas
        nodes={canvasNodes}
        edges={canvasEdges}
        currentStepIndex={currentStepIndex}
        relativeTime={relativeTime}
        stepDurations={stepDurations}
        stepTitles={stepTitles}
        stepNarratives={stepNarratives}
        highlightedIds={highlightedIds}
        isSpeaking={isSpeaking}
        onFocusModeChange={onFocusModeChange}
      />
    </div>
  );
};

export default VisualizationRenderer;
