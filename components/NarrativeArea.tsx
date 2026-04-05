
import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

import remarkGfm from 'remark-gfm';

interface Props {
  text: string;
  speed: number;
  isPlaying: boolean;
  playbackSpeed: number;
}

const NarrativeArea: React.FC<Props> = ({ text, speed, isPlaying, playbackSpeed }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [text]);

  return (
    <div className="h-full flex flex-col relative">
      <div className="flex items-center gap-3 mb-4 text-indigo-400 font-black text-[10px] uppercase tracking-[0.2em]">
        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
        Interactive Transcript
      </div>
      <div
        ref={scrollRef}
        className="flex-grow overflow-y-auto pr-4 scroll-smooth"
      >
        <div className="text-slate-100 text-base leading-relaxed font-semibold narrative-markdown animate-fade-in-up">
          <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>
            {text}
          </ReactMarkdown>
        </div>
        {isPlaying && (
          <span className="inline-block w-1.5 h-6 bg-indigo-500 ml-1 animate-pulse align-middle rounded-full mt-2" />
        )}
      </div>
    </div>
  );
};

export default NarrativeArea;
