
import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

interface Props {
  text: string;
  speed: number;
  isPlaying: boolean;
  playbackSpeed: number;
}

const NarrativeArea: React.FC<Props> = ({ text, speed, isPlaying, playbackSpeed }) => {
  const [displayedText, setDisplayedText] = useState('');
  const [index, setIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDisplayedText('');
    setIndex(0);
  }, [text]);

  useEffect(() => {
    if (!isPlaying || index >= text.length) return;
    const timeout = setTimeout(() => {
      setDisplayedText(prev => prev + text[index]);
      setIndex(prev => prev + 1);
    }, (1000 / speed) / playbackSpeed);
    return () => clearTimeout(timeout);
  }, [index, text, isPlaying, speed, playbackSpeed]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayedText]);

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
        <div className="text-slate-100 text-lg leading-relaxed font-semibold narrative-markdown">
          <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
            {displayedText}
          </ReactMarkdown>
        </div>
        {isPlaying && index < text.length && (
          <span className="inline-block w-1.5 h-6 bg-indigo-500 ml-1 animate-pulse align-middle rounded-full" />
        )}
      </div>
    </div>
  );
};

export default NarrativeArea;
