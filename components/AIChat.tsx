import React, { useState } from 'react';
import { askTutorWithVisuals } from '../services/groqService';
import { DiagramElement } from '../types';

interface Props {
  context: string;
  onPause: () => void;
  onVisualUpdate: (visuals: DiagramElement[], text: string) => void;
}

const AIChat: React.FC<Props> = ({ context, onPause, onVisualUpdate }) => {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    onPause();
    const userMsg = query;
    setQuery('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);

    const result = await askTutorWithVisuals(userMsg, context);
    setMessages(prev => [...prev, { role: 'ai', text: result.text }]);
    onVisualUpdate(result.visuals, result.text);
    
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-full bg-transparent w-full">
      {/* Header */}
      <div className="p-5 border-b border-white/10 glass">
        <h3 className="font-bold text-white flex items-center gap-2 text-lg">
          <span className="text-xl animate-pulse drop-shadow-[0_0_8px_rgba(99,102,241,0.8)]">✨</span> Intelligent Assistant
        </h3>
        <p className="text-[10px] text-indigo-300/80 uppercase tracking-[0.2em] mt-1 font-bold">Ask anything about {context || "the lesson"}</p>
      </div>
      
      {/* Chat Area */}
      <div className="flex-grow overflow-y-auto p-5 space-y-5 scroll-smooth relative">
        {messages.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 rounded-full glass border border-white/10 mb-4 flex items-center justify-center shadow-2xl">
              <span className="text-2xl pointer-events-none">🤖</span>
            </div>
            <p className="text-white/60 text-sm italic font-medium">"Could you explain the difference again?"</p>
            <p className="text-white/30 text-[10px] mt-2 tracking-widest uppercase">Answers appear on whiteboard</p>
          </div>
        )}
        
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-content`}>
            {m.role === 'ai' && (
               <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-400 mr-2 flex-shrink-0 mt-1 shadow-[0_0_10px_rgba(99,102,241,0.5)]"></div>
            )}
            <div className={`p-4 rounded-3xl text-[13px] leading-relaxed max-w-[85%] font-medium ${
              m.role === 'user' 
                ? 'bg-indigo-600 border border-indigo-400 text-white rounded-br-sm shadow-xl shadow-indigo-500/20' 
                : 'glass text-slate-200 border border-white/10 rounded-tl-sm shadow-2xl'
            }`}>
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start animate-pulse mb-2">
            <div className="w-6 h-6 rounded-full bg-white/10 mr-2"></div>
            <div className="glass border border-white/10 p-4 rounded-3xl rounded-tl-sm flex gap-2 items-center">
              <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"></div>
              <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.2s]"></div>
              <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.4s]"></div>
            </div>
          </div>
        )}
      </div>

      {/* Input Form */}
      <form onSubmit={handleSend} className="p-4 glass-dark border-t border-white/5 pb-6">
        <div className="relative group">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type your question..."
            className="w-full pl-5 pr-14 py-4 rounded-full bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-indigo-500 focus:bg-white/10 transition-all font-medium placeholder:text-white/30 shadow-inner"
          />
          <button type="submit" disabled={!query.trim() || loading} className="absolute right-2 top-2 bottom-2 w-10 flex items-center justify-center bg-white text-black rounded-full hover:bg-indigo-50 transition-all active:scale-90 disabled:opacity-50 shadow-lg">
            <svg className="w-4 h-4 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        </div>
      </form>
    </div>
  );
};

export default AIChat;
