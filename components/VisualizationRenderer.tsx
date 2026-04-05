import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Highlight, themes } from 'prism-react-renderer';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import 'katex/dist/katex.min.css';

import { Visualization, ChartData, CodeData } from '../types';
import StoryboardCanvas, { CanvasNode, CanvasEdge } from './StoryboardCanvas';

// ─── Palette ─────────────────────────────────────────────────────────────────
const CHART_COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6'];

import remarkGfm from 'remark-gfm';

// ─── Markdown + Math Renderer ──────────────────────────────────────────────────
const MarkdownMathView: React.FC<{ content: string, currentTime: number, duration: number }> = ({ content, currentTime, duration }) => {
  // Sync the markdown reveal with the audio pacing by chunks
  const blocks = content.split('\\n\\n');
  const progress = Math.min(1, Math.max(0, currentTime / (duration || 0.1)));
  const visibleBlocks = Math.floor(progress * blocks.length) + 1;
  const visibleContent = blocks.slice(0, visibleBlocks).join('\\n\\n');

  return (
    <div className="w-full h-full flex flex-col p-6 overflow-y-auto">
      <div className="glass-dark border border-indigo-500/20 rounded-2xl p-6 max-w-4xl mx-auto w-full transition-all duration-300">
        <div className="text-emerald-400 text-xs uppercase tracking-widest mb-8 font-black flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Detailed Explanation
        </div>
        <div className="prose prose-invert prose-sm max-w-none prose-headings:text-indigo-300 prose-headings:text-sm prose-a:text-indigo-400 katex-block animate-fade-in-up" style={{ fontSize: '13px', lineHeight: '1.7' }}>
          <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>
            {visibleContent}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
};

// ─── Code Renderer ────────────────────────────────────────────────────────────
const CodeView: React.FC<{ data: CodeData, currentTime: number, duration: number }> = ({ data, currentTime, duration }) => {
  return (
    <div className="w-full h-full flex flex-col p-6 overflow-y-auto">
      
      {/* ── Syntax Highlighting Block ── */}
      <div className="w-full shrink-0 flex flex-col p-4 overflow-hidden mb-6 border border-white/5 bg-slate-900/30 rounded-2xl">
        {data.title && (
          <div className="flex items-center gap-3 mb-3 px-4">
            <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            <span className="text-indigo-400 text-xs font-black uppercase tracking-widest">{data.title}</span>
          </div>
        )}
        <div className="flex-grow overflow-auto rounded-xl border border-white/10 bg-slate-900">
          <div className="flex items-center gap-2 px-4 py-3 bg-slate-950/50 border-b border-white/5">
            <span className="w-3 h-3 rounded-full bg-red-500/70" />
            <span className="w-3 h-3 rounded-full bg-yellow-500/70" />
            <span className="w-3 h-3 rounded-full bg-green-500/70" />
            <span className="ml-3 text-slate-500 text-xs font-mono">{data.language}</span>
          </div>
          <Highlight theme={themes.nightOwl} code={data.code.trim()} language={data.language as any}>
            {({ className, style, tokens, getLineProps, getTokenProps }) => {
              const progress = Math.min(1, Math.max(0, currentTime / (duration || 0.1)));
              const visibleLines = Math.floor(progress * tokens.length) + 1;
              return (
                <pre className={`${className} p-5 text-sm overflow-auto m-0`} style={{ ...style, background: '#0f172a' }}>
                  {tokens.map((line, i) => (
                    <div key={i} {...getLineProps({ line })} className="table-row transition-all duration-500"
                      style={{ opacity: i < visibleLines ? 1 : 0, transform: i < visibleLines ? 'translateX(0)' : 'translateX(-10px)' }}>
                      <span className="table-cell pr-4 select-none text-slate-600 text-right min-w-[2rem]">{i + 1}</span>
                      <span className="table-cell">{line.map((token, key) => <span key={key} {...getTokenProps({ token })} />)}</span>
                    </div>
                  ))}
                </pre>
              );
            }}
          </Highlight>
        </div>
      </div>

      {/* ── Explainatory Markdown Caption ── */}
      {data.caption && (
        <div className="w-full shrink-0 prose prose-invert prose-lg max-w-none prose-headings:text-indigo-300 prose-a:text-indigo-400 katex-block bg-white/5 p-6 rounded-2xl border border-white/10 mt-auto shadow-xl">
          <ReactMarkdown remarkPlugins={[remarkMath, remarkGfm]} rehypePlugins={[rehypeKatex]}>
            {data.caption}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
};

// ─── Chart Renderer ───────────────────────────────────────────────────────────
const ChartView: React.FC<{ data: ChartData }> = ({ data }) => {
  const flatData = data.labels.map((label, i) => {
    const entry: Record<string, any> = { name: label };
    data.datasets.forEach(ds => { entry[ds.name] = ds.values[i] ?? 0; });
    return entry;
  });
  const sharedProps = { data: flatData, margin: { top: 10, right: 20, left: 0, bottom: 0 } };
  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
      <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: '#334155' }} />
      <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={{ stroke: '#334155' }} />
      <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12, color: '#f1f5f9' }} />
      <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
    </>
  );
  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-6">
      {data.title && <p className="text-indigo-400 text-xs font-black uppercase tracking-widest mb-4">{data.title}</p>}
      <ResponsiveContainer width="100%" height="85%">
        {data.chartType === 'line'
          ? <LineChart {...sharedProps}>{axes}{data.datasets.map((ds, i) => <Line key={ds.name} type="monotone" dataKey={ds.name} stroke={ds.color ?? CHART_COLORS[i]} strokeWidth={3} dot={{ r: 5, fill: ds.color ?? CHART_COLORS[i] }} />)}</LineChart>
          : data.chartType === 'area'
          ? <AreaChart {...sharedProps}>{axes}{data.datasets.map((ds, i) => <Area key={ds.name} type="monotone" dataKey={ds.name} stroke={ds.color ?? CHART_COLORS[i]} fill={`${ds.color ?? CHART_COLORS[i]}33`} strokeWidth={3} />)}</AreaChart>
          : data.chartType === 'pie'
          ? <PieChart><Pie data={flatData} dataKey={data.datasets[0]?.name} nameKey="name" cx="50%" cy="50%" outerRadius="70%" label>{flatData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}</Pie><Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 12, color: '#f1f5f9' }} /><Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} /></PieChart>
          : <BarChart {...sharedProps}>{axes}{data.datasets.map((ds, i) => <Bar key={ds.name} dataKey={ds.name} fill={ds.color ?? CHART_COLORS[i]} radius={[6, 6, 0, 0]} />)}</BarChart>
        }
      </ResponsiveContainer>
    </div>
  );
};

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
  // Non-storyboard types rendered fullscreen in split-view
  const isSpecialViz = visualization && ['katex', 'code', 'chart', 'markdown'].includes(visualization.type);

  return (
    <div className="relative w-full h-full flex flex-row overflow-hidden rounded-[2.5rem] bg-[#020617]">
      {/* ── Unified Storyboard Canvas (Left side) ── */}
      <div 
        className="relative h-full transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{ width: isSpecialViz ? '62%' : '100%' }}
      >
        <StoryboardCanvas
          nodes={canvasNodes}
          edges={canvasEdges}
          currentStepIndex={currentStepIndex}
          relativeTime={relativeTime}
          stepDurations={stepDurations}
          stepTitles={stepTitles}
          highlightedIds={highlightedIds}
        />
        
        {/* Subtle right shadow fading when split screen is active */}
        {isSpecialViz && (
          <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-black/50 to-transparent pointer-events-none z-10" />
        )}
      </div>

      {/* ── Special viz panel (Right Side) ── */}
      <div 
        className="relative h-full bg-gradient-to-b from-[#0a1428] to-[#020617] border-l border-white/5 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] z-20"
        style={{ 
          width: isSpecialViz ? '38%' : '0%',
          opacity: isSpecialViz ? 1 : 0,
        }}
      >
        {/* We use an inner wrapper with fixed dimensions so content doesn't text-wrap awkwardly during the width CSS transition */}
        <div className="absolute top-0 left-0 w-[40vw] h-full p-6 pt-16 pb-20 flex items-center justify-center">
          <div className="absolute top-6 right-6 z-30">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-400 glass-dark border border-indigo-500/30 rounded-full px-4 py-2 shadow-[0_0_20px_rgba(99,102,241,0.2)]">
              {isSpecialViz && { katex: '🧮 Math Execution', code: '💻 Code Implementation', chart: '📊 Data Analytics', markdown: '📝 Key Notes' }[visualization!.type]}
            </span>
          </div>
          
          <div className="w-full h-full max-h-[85vh] relative glass-panel border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col bg-[#050D1A]/80 backdrop-blur-3xl">
             <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-cyan-500/5 pointer-events-none"></div>
             {isSpecialViz && (visualization!.type === 'katex' || visualization!.type === 'markdown') && <MarkdownMathView content={visualization!.data as string} currentTime={currentTime} duration={duration} />}
             {isSpecialViz && visualization!.type === 'code' && <CodeView data={visualization!.data as CodeData} currentTime={currentTime} duration={duration} />}
             {isSpecialViz && visualization!.type === 'chart' && <ChartView data={visualization!.data as ChartData} />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VisualizationRenderer;
