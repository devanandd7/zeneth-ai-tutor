
import React, { useState, useEffect } from 'react';
import { DiagramElement } from '../types';

interface Props {
  elements: DiagramElement[];
  highlightedIds: Set<string>;
}

const TypewriterLabel: React.FC<{ text: string }> = ({ text }) => {
  const [displayed, setDisplayed] = useState('');
  
  useEffect(() => {
    let current = '';
    const interval = setInterval(() => {
      if (current.length < text.length) {
        current = text.slice(0, current.length + 1);
        setDisplayed(current);
      } else {
        clearInterval(interval);
      }
    }, 40);
    return () => clearInterval(interval);
  }, [text]);

  return <span>{displayed}</span>;
};

const DiagramArea: React.FC<Props> = ({ elements, highlightedIds }) => {
  return (
    <div className="relative w-full h-full bg-[#020617] rounded-[2.5rem] overflow-hidden border border-white/10 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)]">
      {/* Dynamic Background */}
      <div className="absolute inset-0 opacity-10 pointer-events-none" 
           style={{ 
             backgroundImage: 'radial-gradient(circle, #334155 1px, transparent 1px)', 
             backgroundSize: '30px 30px' 
           }}>
      </div>
      
      {/* Studio Lighting */}
      <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-indigo-500/5 to-transparent pointer-events-none"></div>

      {elements.map((el) => {
        const isHighlighted = highlightedIds.has(el.id);
        
        return (
          <div
            key={el.id}
            className={`absolute transform -translate-x-1/2 -translate-y-1/2 transition-all duration-1000 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
              isHighlighted ? 'scale-110 z-20' : 'scale-100 z-10'
            }`}
            style={{ left: `${el.x}%`, top: `${el.y}%` }}
          >
            <div className="relative flex flex-col items-center">
              {el.type === 'emoji' ? (
                <>
                  <div className={`text-7xl mb-4 transition-all duration-500 ${isHighlighted ? 'drop-shadow-[0_0_20px_rgba(99,102,241,0.5)]' : 'drop-shadow-lg'}`}>
                    {el.content}
                  </div>
                  {el.label && (
                    <div className={`px-4 py-2 rounded-2xl border-2 font-bold text-sm tracking-tight glass transition-all duration-500 ${
                      isHighlighted ? 'border-indigo-500 text-white translate-y--2 shadow-indigo-500/20 shadow-xl' : 'border-white/10 text-slate-300'
                    }`}>
                      <TypewriterLabel text={el.label} />
                    </div>
                  )}
                </>
              ) : (
                <div 
                  className="text-indigo-400 transition-all duration-700"
                  style={{ transform: `rotate(${el.rotation || 0}deg)` }}
                >
                  <svg width="80" height="24" viewBox="0 0 80 24" fill="none" className="drop-shadow-glow">
                    <path d="M0 12H76M76 12L64 2M76 12L64 22" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {el.label && (
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-black uppercase tracking-widest text-indigo-300 glass-dark px-2 py-1 rounded">
                      <TypewriterLabel text={el.label} />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}

      <style>{`
        .drop-shadow-glow {
          filter: drop-shadow(0 0 8px rgba(99, 102, 241, 0.4));
        }
      `}</style>
    </div>
  );
};

export default DiagramArea;
