import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TUTORIAL_DATA as INITIAL_DATA } from './constants';
import { ActionType, DiagramElement, TutorialStep } from './types';
import VisualizationRenderer from './components/VisualizationRenderer';
import NarrativeArea from './components/NarrativeArea';
import AIChat from './components/AIChat';
import { generateSpeech } from './services/geminiService';
import { generateTutorialForTopic } from './services/groqService';

const App: React.FC = () => {
  const [started, setStarted] = useState(false);
  const [tutorialData, setTutorialData] = useState<TutorialStep[]>(INITIAL_DATA);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  
  // Modals & Panels
  const [showTopicModal, setShowTopicModal] = useState(false);
  const [showTranscript, setShowTranscript] = useState(true);
  const [showAssistant, setShowAssistant] = useState(false);
  
  const [topicInput, setTopicInput] = useState("");
  const [landingInput, setLandingInput] = useState("");
  
  const [visibleElements, setVisibleElements] = useState<DiagramElement[]>([]);
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set());
  const [processedEvents, setProcessedEvents] = useState<Set<string>>(new Set());

  const totalDuration = tutorialData.reduce((acc, step) => acc + step.duration, 0);
  const animationFrameRef = useRef<number>(0);
  const lastUpdateRef = useRef<number>(0);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const currentStep = tutorialData[currentStepIndex];
  const stepStartTime = tutorialData.slice(0, currentStepIndex).reduce((sum, s) => sum + s.duration, 0);

  const stopAudio = useCallback(() => {
    if (currentAudioSourceRef.current) {
      try { currentAudioSourceRef.current.stop(); } catch (e) {}
      currentAudioSourceRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  const resetStep = useCallback((index: number) => {
    setCurrentStepIndex(index);
    setVisibleElements([]);
    setHighlightedIds(new Set());
    setProcessedEvents(new Set());
    stopAudio();
  }, [stopAudio]);

  const speakText = async (text: string) => {
    stopAudio();
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    setIsLoadingAudio(true);
    const base64 = await generateSpeech(text);
    if (base64 && audioContextRef.current) {
      const bytes = atob(base64).split('').map(c => c.charCodeAt(0));
      const buffer = await decodeAudioData(new Uint8Array(bytes), audioContextRef.current, 24000, 1);
      const source = audioContextRef.current.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = playbackSpeed;
      source.connect(audioContextRef.current.destination);
      source.onended = () => setIsSpeaking(false);
      currentAudioSourceRef.current = source;
      setIsSpeaking(true);
      setIsLoadingAudio(false);
      source.start();
    } else {
      setIsLoadingAudio(false);
    }
  };

  async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }
    return buffer;
  }

  const handleNewTopic = async (topic: string) => {
    if (!topic.trim()) return;
    setIsPlaying(false);
    setIsGenerating(true);
    setShowTopicModal(false);
    stopAudio();
    
    try {
      const newData = await generateTutorialForTopic(topic);
      setTutorialData(newData);
      setCurrentTime(0);
      setCurrentStepIndex(0);
      setProcessedEvents(new Set());
      setVisibleElements([]);
      setHighlightedIds(new Set());
      setStarted(true);
      setIsPlaying(true);
    } catch (e) {
      alert("Lesson creation failed. Please try a different topic. Details: " + String(e));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSeek = (time: number) => {
    const clampedTime = Math.max(0, Math.min(totalDuration, time));
    setCurrentTime(clampedTime);
    let acc = 0;
    let newStep = 0;
    for (let i = 0; i < tutorialData.length; i++) {
      if (clampedTime < acc + tutorialData[i].duration) {
        newStep = i;
        break;
      }
      acc += tutorialData[i].duration;
    }
    if (newStep !== currentStepIndex) resetStep(newStep);
    else {
      setProcessedEvents(new Set());
      setVisibleElements([]);
      setHighlightedIds(new Set());
      stopAudio();
    }
  };

  const animate = useCallback((now: number) => {
    if (!isPlaying || isLoadingAudio) {
      lastUpdateRef.current = now;
      animationFrameRef.current = requestAnimationFrame(animate);
      return;
    }
    const deltaTime = (now - lastUpdateRef.current) / 1000;
    lastUpdateRef.current = now;
    setCurrentTime(prev => {
      const nextTime = prev + deltaTime * playbackSpeed;
      return nextTime >= totalDuration ? (setIsPlaying(false), totalDuration) : nextTime;
    });
    animationFrameRef.current = requestAnimationFrame(animate);
  }, [isPlaying, isLoadingAudio, playbackSpeed, totalDuration]);

  useEffect(() => {
    animationFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameRef.current);
  }, [animate]);

  useEffect(() => {
    const step = tutorialData[currentStepIndex];
    if (!step) return;
    const rel = currentTime - stepStartTime;
    step.timeline.forEach((event, idx) => {
      const key = `${currentStepIndex}-${idx}`;
      if (processedEvents.has(key)) return;
      if (rel >= event.time) {
        if (event.action === ActionType.DRAW && event.element) setVisibleElements(prev => [...prev, event.element!]);
        if (event.action === ActionType.HIGHLIGHT && event.target) setHighlightedIds(prev => new Set(prev).add(event.target!));
        if (event.action === ActionType.VOICE) speakText(step.narrative);
        setProcessedEvents(prev => new Set(prev).add(key));
      }
    });
    if (rel >= step.duration && currentStepIndex < tutorialData.length - 1) resetStep(currentStepIndex + 1);
  }, [currentTime, currentStepIndex, stepStartTime, processedEvents, resetStep, tutorialData]);

  if (!started && !isGenerating) {
    return (
      <div className="h-screen w-full flex items-center justify-center p-6 relative overflow-hidden">
        <div className="max-w-2xl w-full text-center animate-content z-10 transition-all duration-500">
          <div className="inline-flex items-center justify-center p-6 rounded-[2.5rem] glass-panel mb-12 shadow-2xl overflow-hidden relative">
             <div className="absolute inset-0 bg-indigo-500 blur-[80px] opacity-20"></div>
            <span className="text-7xl relative z-10">🎓</span>
          </div>
          <h1 className="text-6xl md:text-7xl font-black tracking-tight mb-6 text-white leading-[1.1]">
            Master Anything <br/> <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400">Instantly.</span>
          </h1>
          <p className="text-xl text-slate-400 font-medium mb-12 max-w-lg mx-auto leading-relaxed">
            Experience the future of education. A professional AI tutor that draws, speaks, and explains any concept in real-time.
          </p>
          
          <div className="relative group max-w-lg mx-auto">
            <input 
              className="w-full glass border border-white/10 rounded-full px-8 py-5 text-xl font-bold text-white focus:outline-none focus:border-indigo-500 focus:bg-white/10 transition-all shadow-2xl placeholder:text-slate-600 backdrop-blur-3xl"
              placeholder="What do you want to learn today?"
              value={landingInput}
              onChange={e => setLandingInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleNewTopic(landingInput)}
            />
            <button 
              onClick={() => handleNewTopic(landingInput)}
              className="absolute right-2 top-2 bottom-2 px-8 bg-white text-black font-black rounded-full hover:bg-indigo-50 hover:scale-[0.98] transition-all shadow-xl flex items-center gap-2"
            >
              Start <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M14 5l7 7m0 0l-7 7m7-7H3"/></svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex flex-col relative overflow-hidden bg-black">
      
      {/* Global Loading Overlay */}
      {isGenerating && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-2xl z-[200] flex flex-col items-center justify-center">
          <div className="relative">
            <div className="w-24 h-24 border-[4px] border-white/10 rounded-full"></div>
            <div className="absolute inset-0 w-24 h-24 border-[4px] border-indigo-500 border-t-transparent animate-spin rounded-full shadow-[0_0_30px_rgba(99,102,241,0.5)]"></div>
          </div>
          <h2 className="text-3xl font-black text-white mt-10 mb-3 animate-pulse">Architecting Lesson...</h2>
          <p className="text-indigo-400 font-mono text-xs uppercase tracking-[0.3em]">Synthesizing multi-modal concepts</p>
        </div>
      )}

      {/* Subject Modal */}
      {showTopicModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" onClick={() => setShowTopicModal(false)}></div>
          <div className="glass-panel w-full max-w-lg rounded-[2.5rem] p-10 shadow-2xl border border-white/10 z-10 animate-content relative overflow-hidden">
             {/* decorative glow */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 blur-[100px] rounded-full"></div>
            
            <h2 className="text-3xl font-black mb-3 text-white">New Lecture</h2>
            <p className="text-slate-400 mb-8 font-medium">I will architect a visual scenario, mechanics, and real-world impact for any topic you provide.</p>
            <input 
              autoFocus
              className="w-full glass border border-white/10 rounded-2xl px-6 py-4 text-lg font-bold focus:outline-none focus:border-indigo-400 focus:bg-white/10 transition-all mb-8 text-white placeholder:text-slate-600"
              placeholder="Topic name..."
              value={topicInput}
              onChange={e => setTopicInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleNewTopic(topicInput)}
            />
            <div className="flex gap-4">
              <button onClick={() => setShowTopicModal(false)} className="flex-1 py-4 font-bold rounded-2xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-colors">Cancel</button>
              <button onClick={() => handleNewTopic(topicInput)} className="flex-1 py-4 font-black rounded-2xl bg-white text-black hover:bg-indigo-50 transition-colors shadow-xl">Generate</button>
            </div>
          </div>
        </div>
      )}

      {/* Main Full-Screen Canvas Area */}
      <div className="absolute inset-0 z-0">
        <VisualizationRenderer
          visualization={currentStep?.visualization}
          elements={visibleElements}
          highlightedIds={highlightedIds}
        />
        {/* Dark vignette over canvas so controls pop */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black via-transparent to-black/40"></div>
      </div>

      {/* Top Navigation Bar (Floating) */}
      <div className="absolute top-6 left-6 right-6 z-40 flex justify-between items-start pointer-events-none">
        <div className="glass-dark px-6 py-4 rounded-3xl border border-white/10 shadow-2xl flex items-center gap-5 pointer-events-auto">
          <div className={`relative flex items-center justify-center w-12 h-12 rounded-full glass border ${isSpeaking ? 'border-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.5)]' : 'border-white/10'}`}>
            {isLoadingAudio ? <div className="w-5 h-5 border-[3px] border-indigo-500 border-t-transparent animate-spin rounded-full"></div> : <span className="text-xl">{isSpeaking ? '🎙️' : '🧠'}</span>}
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">{currentStep?.title || "Classroom"}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse"></span>
              <p className="text-[9px] font-black tracking-[0.2em] text-emerald-400/80 uppercase">Live Session Active</p>
            </div>
          </div>
        </div>

        <div className="flex gap-4 pointer-events-auto items-start">
           <button onClick={() => setShowAssistant(!showAssistant)} className="h-14 px-6 font-bold rounded-full glass-dark text-white hover:bg-white/10 border border-white/10 transition-all flex items-center gap-2 shadow-xl">
            <span className="text-indigo-400 text-lg group-hover:animate-spin">✧</span> 
            Ask AI
          </button>
          <button onClick={() => setShowTopicModal(true)} className="h-14 px-6 font-black rounded-full bg-white text-black hover:bg-slate-200 transition-all shadow-xl active:scale-95">
            + New Lesson
          </button>
        </div>
      </div>

      {/* Right Side: Slide-out AI Assistant Panel */}
      <div className={`absolute top-24 bottom-32 right-6 w-96 glass-panel rounded-3xl border border-white/10 shadow-2xl z-40 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${showAssistant ? 'translate-x-0 opacity-100' : 'translate-x-[120%] opacity-0 pointer-events-none'}`}>
        <AIChat context={currentStep?.title || ""} onPause={() => setIsPlaying(false)} onVisualUpdate={(vis, txt) => (setVisibleElements(p => [...p, ...vis]), speakText(txt))} />
      </div>

      {/* Bottom Area: Disappearing Transcript & Floating Dock */}
      <div className="absolute bottom-6 left-0 right-0 z-40 flex flex-col items-center gap-4 pointer-events-none">
        
        {/* Floating Transcript Panel */}
        <div className={`w-full max-w-4xl transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${showTranscript && (isPlaying || currentTime > 0) ? 'translate-y-0 opacity-100 pointer-events-auto' : 'translate-y-10 opacity-0 pointer-events-none'}`}>
          <div className="glass-panel mx-6 rounded-3xl p-6 border border-white/10 shadow-2xl h-48">
            <NarrativeArea text={currentStep?.narrative || ""} speed={40} isPlaying={isPlaying} playbackSpeed={playbackSpeed} />
          </div>
        </div>

        {/* Global Floating Control Dock */}
        <div className="glass-panel rounded-full h-16 border border-white/10 shadow-2xl flex items-center justify-between px-2 gap-4 pointer-events-auto w-[600px] max-w-[90vw]">
          
          {/* Main Play/Pause Button */}
          <button onClick={() => { setIsPlaying(!isPlaying); if(!isPlaying) lastUpdateRef.current = performance.now(); }} className={`w-12 h-12 flex items-center justify-center rounded-full transition-all shadow-xl hover:scale-105 active:scale-95 flex-shrink-0 ${isPlaying ? 'bg-indigo-600 border border-indigo-400 text-white' : 'bg-white text-black'}`}>
            {isPlaying ? <svg className="w-5 h-5 mx-auto" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg> : <svg className="w-6 h-6 ml-1" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>}
          </button>

          {/* Timeline Scrubber */}
          <div className="flex-grow flex flex-col justify-center px-2">
            <div className="relative h-2 bg-white/10 rounded-full cursor-pointer overflow-hidden group" onClick={e => handleSeek((e.nativeEvent.offsetX / e.currentTarget.offsetWidth) * totalDuration)}>
              <div className="absolute h-full bg-gradient-to-r from-indigo-500 to-cyan-400 shadow-[0_0_10px_rgba(99,102,241,0.5)] transition-all duration-200" style={{ width: `${(currentTime/totalDuration)*100}%` }}></div>
            </div>
            <div className="flex justify-between mt-1 text-[10px] font-black tracking-widest text-slate-500 uppercase mono">
              <span>{Math.floor(currentTime/60)}:{(currentTime%60).toFixed(0).padStart(2,'0')}</span>
              <span className="opacity-50 hidden sm:block">Timeline</span>
              <span>{Math.floor(totalDuration/60)}:{(totalDuration%60).toFixed(0).padStart(2,'0')}</span>
            </div>
          </div>

          {/* Controls (Speed & CC) */}
          <div className="flex items-center gap-1 bg-white/5 rounded-full p-1 flex-shrink-0">
             <button title="Toggle Transcript" onClick={() => setShowTranscript(!showTranscript)} className={`w-10 h-10 rounded-full text-[10px] font-black flex items-center justify-center transition-all ${showTranscript ? 'bg-white text-black shadow-md' : 'text-slate-400 hover:text-white'}`}>CC</button>
             <div className="w-[1px] h-6 bg-white/10 mx-1"></div>
             {[1, 1.5, 2].map(s => (
                <button key={s} onClick={() => { setPlaybackSpeed(s); stopAudio(); }} className={`w-10 h-10 rounded-full text-[11px] font-black transition-all ${playbackSpeed === s ? 'bg-indigo-500 text-white shadow-[0_0_10px_rgba(99,102,241,0.4)]' : 'text-slate-400 hover:text-white'}`}>{s}x</button>
              ))}
          </div>

        </div>
      </div>

    </div>
  );
};

export default App;
