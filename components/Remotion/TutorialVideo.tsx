import React from 'react';
import { Player } from '@remotion/player';
import { TutorialComposition } from './TutorialComposition';
import { TutorialStep } from '../../types';

interface Props {
  steps: TutorialStep[];
}

const TutorialVideo: React.FC<Props> = ({ steps }) => {
  if (!steps || steps.length === 0) {
    return <div className="text-slate-400 p-8 text-center flex items-center justify-center h-full w-full">No video content yet. Generate a lesson first.</div>;
  }

  // Calculate total duration across all steps
  const totalFrames = steps.reduce((sum, step) => {
    return sum + (Math.max(10, step.duration || 10) * 30); // 30 FPS
  }, 0);

  return (
    <div className="w-full h-full rounded-[2.5rem] overflow-hidden shadow-2xl relative bg-black/50 border border-white/10 flex items-center justify-center p-8">
      <Player
        component={TutorialComposition}
        inputProps={{ steps }}
        durationInFrames={totalFrames}
        compositionWidth={1920}
        compositionHeight={1080}
        fps={30}
        controls
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '32px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
        }}
      />
    </div>
  );
};

export default TutorialVideo;
