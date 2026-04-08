import React, { useMemo } from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, Sequence, Audio, continueRender, delayRender } from 'remotion';
import { TutorialStep, FlowData, ActionType } from '../../types';
import VisualizationRenderer from '../VisualizationRenderer';

export const TutorialComposition: React.FC<{ steps: TutorialStep[] }> = ({ steps }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const currentTime = frame / fps;

  const stepDurations = useMemo(() => steps.map(s => Math.max(10, s.duration || 10)), [steps]);
  const stepTitles = useMemo(() => steps.map(s => s.title), [steps]);
  const stepNarratives = useMemo(() => steps.map(s => s.narrative || ''), [steps]);

  // Find which step we're in
  let currentStepIndex = 0;
  let accumulatedTime = 0;
  for (let i = 0; i < stepDurations.length; i++) {
    if (currentTime < accumulatedTime + stepDurations[i]) {
      currentStepIndex = i;
      break;
    }
    accumulatedTime += stepDurations[i];
  }
  if (currentStepIndex >= steps.length) currentStepIndex = steps.length - 1;

  const stepStartTime = stepDurations.slice(0, currentStepIndex).reduce((sum, d) => sum + d, 0);
  const relativeTime = currentTime - stepStartTime;
  const currentStep = steps[currentStepIndex];

  // Re-build canvas nodes/edges exactly as App.tsx does
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

  // Highlighted IDs based on timeline events
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

  // Frame offsets for each step's audio Sequence
  const stepFrameOffsets = useMemo(() => {
    const offsets: number[] = [];
    let acc = 0;
    for (const d of stepDurations) {
      offsets.push(Math.round(acc * fps));
      acc += d;
    }
    return offsets;
  }, [stepDurations, fps]);

  // Total frames for the whole video
  const totalFrames = useMemo(
    () => stepDurations.reduce((sum, d) => sum + Math.round(d * fps), 0),
    [stepDurations, fps]
  );

  return (
    <AbsoluteFill style={{ backgroundColor: '#020617', color: 'white' }}>
      {/* Main visual canvas */}
      <VisualizationRenderer
        canvasNodes={canvasNodes}
        canvasEdges={canvasEdges}
        currentStepIndex={currentStepIndex}
        relativeTime={relativeTime}
        stepDurations={stepDurations}
        stepTitles={stepTitles}
        stepNarratives={stepNarratives}
        highlightedIds={highlightedIds}
        visualization={currentStep?.visualization}
        currentTime={relativeTime}
        duration={currentStep?.duration || 1}
        isSpeaking={true}
      />

      {/* ── Audio Tracks: one Sequence per step ────────────────────────────── */}
      {steps.map((step, i) => {
        // Skip steps without a generated audioUrl
        if (!step.audioUrl) {
          console.warn(`[Remotion] Step ${i} ("${step.title}") has NO audioUrl — no audio will play`);
          return null;
        }

        const durationFrames = Math.round(stepDurations[i] * fps);
        const fromFrame = stepFrameOffsets[i];

        console.log(`[Remotion] Step ${i} audio: from=${fromFrame} dur=${durationFrames} url=${step.audioUrl.slice(0, 60)}`);

        return (
          <Sequence key={`audio-${i}`} from={fromFrame} durationInFrames={durationFrames}>
            <Audio
              src={step.audioUrl}
              volume={1}
              // startFrom keeps audio aligned even if Remotion seeks mid-step
              startFrom={0}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
