import React, { useMemo } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, Sequence, Audio } from 'remotion';
import { TutorialStep, FlowData, ActionType } from '../../types';
import VisualizationRenderer from '../VisualizationRenderer';

export const TutorialComposition: React.FC<{ steps: TutorialStep[] }> = ({ steps }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const currentTime = frame / fps;

  // Calculate timelines exactly like App.tsx
  const stepDurations = useMemo(() => steps.map(s => Math.max(10, s.duration || 10)), [steps]);
  const stepTitles = useMemo(() => steps.map(s => s.title), [steps]);

  // Find which step index we are in currently based on frame time
  let currentStepIndex = 0;
  let accumulatedTime = 0;
  for (let i = 0; i < stepDurations.length; i++) {
    if (currentTime < accumulatedTime + stepDurations[i]) {
      currentStepIndex = i;
      break;
    }
    accumulatedTime += stepDurations[i];
  }
  // Clamp it
  if (currentStepIndex >= steps.length) currentStepIndex = steps.length - 1;

  const stepStartTime = stepDurations.slice(0, currentStepIndex).reduce((sum, d) => sum + d, 0);
  const relativeTime = currentTime - stepStartTime;
  
  const currentStep = steps[currentStepIndex];

  // Re-build nodes exactly as the App does
  const { canvasNodes, canvasEdges } = useMemo(() => {
    const allNodes: any[] = [];
    const allEdges: any[] = [];
    const seenNodeIds = new Set<string>();

    steps.forEach((step, stepIndex) => {
      const vis = step.visualization;
      const stepNodes: any[] = [];
      const stepEdges: any[] = [];
      
      if (vis && vis.type === 'flow') {
        const data = vis.data as FlowData;
        if (data.nodes) stepNodes.push(...data.nodes);
        if (data.edges) stepEdges.push(...data.edges);
      }
      
      if (vis && vis.flowData) {
        if (vis.flowData.nodes) stepNodes.push(...vis.flowData.nodes);
        if (vis.flowData.edges) stepEdges.push(...vis.flowData.edges);
      }

      if (step.timeline) {
        step.timeline.forEach((event: any) => {
          if (event.action === ActionType.DRAW && event.element && (event.element.type === 'emoji' || !event.element.type)) {
            stepNodes.push({ ...event.element, nodeType: 'emoji' });
          }
        });
      }

      const totalInStep = stepNodes.length;

      stepNodes.forEach((n, indexInStep) => {
        const uniqueId = `step${stepIndex}-${n.id}`;
        if (!seenNodeIds.has(uniqueId)) {
          seenNodeIds.add(uniqueId);
          allNodes.push({
            id: uniqueId,
            label: n.label || '',
            stepIndex,
            indexInStep,
            totalInStep,
            nodeType: n.nodeType || 'flow',
            detail: n.detail,
            emojiContent: n.content,
            imageUrl: n.imageUrl,
          });
        }
      });

      stepEdges.forEach((e) => {
        const edgeId = e.id || `${e.source}-${e.target}`;
        allEdges.push({
          id: `step${stepIndex}-${edgeId}`,
          from: `step${stepIndex}-${e.source}`,
          to: `step${stepIndex}-${e.target}`,
          label: e.label,
        });
      });
    });

    return { canvasNodes: allNodes, canvasEdges: allEdges };
  }, [steps]);

  // Compute what emojis/nodes are actively highlighted via timeline
  const highlightedIds = useMemo(() => {
    const ids = new Set<string>();
    steps.forEach((step, sIdx) => {
      const isPast = sIdx < currentStepIndex;
      const isCurrent = sIdx === currentStepIndex;
      if (!isPast && !isCurrent) return;
      
      const sRefTime = isCurrent ? relativeTime : stepDurations[sIdx];
      
      step.timeline.forEach((event) => {
        if (event.action === ActionType.HIGHLIGHT && event.target && event.time <= sRefTime) {
          ids.add(event.target);
        }
      });
    });
    return ids;
  }, [steps, currentStepIndex, relativeTime, stepDurations]);

  // Pre-calculate frame offsets for audio sequences
  const stepFrameOffsets = useMemo(() => {
    const offsets: number[] = [];
    let acc = 0;
    for (const d of stepDurations) {
      offsets.push(acc * fps);
      acc += d;
    }
    return offsets;
  }, [stepDurations, fps]);

  return (
    <AbsoluteFill style={{ backgroundColor: '#020617', color: 'white' }}>
       {/* Inject the entire VisualizationRenderer precisely hooked into the video frame engine */}
       <VisualizationRenderer
          canvasNodes={canvasNodes}
          canvasEdges={canvasEdges}
          currentStepIndex={currentStepIndex}
          relativeTime={relativeTime}
          stepDurations={stepDurations}
          stepTitles={stepTitles}
          highlightedIds={highlightedIds}
          visualization={currentStep?.visualization}
          currentTime={relativeTime}
          duration={currentStep?.duration || 1}
       />
       
       {/* Audio tracks for each step — synced to their step's start frame */}
       {steps.map((step, i) => {
         if (!step.audioUrl) return null;
         const durationFrames = Math.round(stepDurations[i] * fps);
         return (
           <Sequence key={`audio-${i}`} from={stepFrameOffsets[i]} durationInFrames={durationFrames}>
             <Audio src={step.audioUrl} volume={1} />
           </Sequence>
         );
       })}
    </AbsoluteFill>
  );
};
