import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Highlight, themes } from 'prism-react-renderer';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { ReactFlow, Background, Controls } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import 'katex/dist/katex.min.css';

import { Visualization, ChartData, CodeData, FlowData, DiagramElement } from '../types';
import DiagramArea from './DiagramArea';

// ─── Palette ─────────────────────────────────────────────────────────────────
const CHART_COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6'];

// ─── Mermaid Renderer ─────────────────────────────────────────────────────────
const MermaidChart: React.FC<{ chart: string }> = ({ chart }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({ startOnLoad: false, theme: 'dark', themeVariables: { primaryColor: '#6366f1', primaryTextColor: '#e2e8f0', edgeLabelBackground: '#1e293b', lineColor: '#6366f1' } });
        const id = `mermaid-${Math.random().toString(36).slice(2)}`;
        const { svg: rendered } = await mermaid.render(id, chart);
        if (!cancelled) setSvg(rendered);
      } catch (e) {
        console.error('Mermaid error:', e);
      }
    })();
    return () => { cancelled = true; };
  }, [chart]);

  return (
    <div ref={ref} className="w-full h-full flex items-center justify-center p-6">
      {svg
        ? <div className="w-full max-h-full overflow-auto" dangerouslySetInnerHTML={{ __html: svg }} />
        : <div className="text-slate-400 text-sm animate-pulse">Rendering diagram…</div>
      }
    </div>
  );
};

// ─── KaTeX Renderer ───────────────────────────────────────────────────────────
const KaTeXView: React.FC<{ formula: string }> = ({ formula }) => (
  <div className="w-full h-full flex items-center justify-center p-8">
    <div className="glass-dark border border-indigo-500/20 rounded-3xl p-10 max-w-2xl w-full text-center">
      <div className="text-indigo-400 text-xs uppercase tracking-widest mb-6 font-black">Mathematical Formula</div>
      <div className="text-white text-2xl katex-block">
        <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
          {`$$${formula}$$`}
        </ReactMarkdown>
      </div>
    </div>
  </div>
);

// ─── Code Renderer ────────────────────────────────────────────────────────────
const CodeView: React.FC<{ data: CodeData }> = ({ data }) => (
  <div className="w-full h-full flex flex-col p-4 overflow-hidden">
    {data.title && (
      <div className="flex items-center gap-3 mb-3 px-4">
        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
        <span className="text-indigo-400 text-xs font-black uppercase tracking-widest">{data.title}</span>
      </div>
    )}
    <div className="flex-grow overflow-auto rounded-2xl border border-white/10">
      <div className="flex items-center gap-2 px-4 py-3 bg-slate-900 border-b border-white/5">
        <span className="w-3 h-3 rounded-full bg-red-500/70" />
        <span className="w-3 h-3 rounded-full bg-yellow-500/70" />
        <span className="w-3 h-3 rounded-full bg-green-500/70" />
        <span className="ml-3 text-slate-500 text-xs font-mono">{data.language}</span>
      </div>
      <Highlight theme={themes.nightOwl} code={data.code.trim()} language={data.language as any}>
        {({ className, style, tokens, getLineProps, getTokenProps }) => (
          <pre className={`${className} p-5 text-sm overflow-auto m-0`} style={{ ...style, background: '#0f172a' }}>
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })} className="table-row">
                <span className="table-cell pr-4 select-none text-slate-600 text-right min-w-[2rem]">{i + 1}</span>
                <span className="table-cell">
                  {line.map((token, key) => <span key={key} {...getTokenProps({ token })} />)}
                </span>
              </div>
            ))}
          </pre>
        )}
      </Highlight>
    </div>
  </div>
);

// ─── Chart Renderer ───────────────────────────────────────────────────────────
const ChartView: React.FC<{ data: ChartData }> = ({ data }) => {
  const flatData = data.labels.map((label, i) => {
    const entry: Record<string, any> = { name: label };
    data.datasets.forEach(ds => { entry[ds.name] = ds.values[i] ?? 0; });
    return entry;
  });

  const sharedProps = {
    data: flatData,
    margin: { top: 10, right: 20, left: 0, bottom: 0 }
  };

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

// ─── React Flow Renderer ──────────────────────────────────────────────────────
const FlowView: React.FC<{ data: FlowData }> = ({ data }) => {
  const nodes = data.nodes.map((n, i) => ({
    id: n.id,
    data: { label: n.label },
    position: { x: n.x ?? (i % 3) * 200 + 50, y: n.y ?? Math.floor(i / 3) * 120 + 50 },
    style: { background: '#1e293b', color: '#e2e8f0', border: '2px solid #6366f1', borderRadius: 12, padding: '8px 16px', fontSize: 13, fontWeight: 700 }
  }));
  const edges = data.edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: e.label,
    style: { stroke: '#6366f1', strokeWidth: 2 },
    labelStyle: { fill: '#94a3b8', fontSize: 11 }
  }));

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow nodes={nodes} edges={edges} fitView nodesDraggable={false} elementsSelectable={false}>
        <Background color="#1e293b" gap={20} />
        <Controls style={{ background: '#0f172a', border: '1px solid #334155' }} />
      </ReactFlow>
    </div>
  );
};

// ─── Markdown Renderer ────────────────────────────────────────────────────────
const MarkdownView: React.FC<{ content: string }> = ({ content }) => (
  <div className="w-full h-full overflow-auto p-8">
    <div className="prose-invert prose-max-none">
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
        {content}
      </ReactMarkdown>
    </div>
  </div>
);

// ─── Main Smart Renderer ──────────────────────────────────────────────────────
interface Props {
  visualization?: Visualization;
  elements: DiagramElement[];
  highlightedIds: Set<string>;
}

const VisualizationRenderer: React.FC<Props> = ({ visualization, elements, highlightedIds }) => {
  // Always show emoji whiteboard on the left (25%) when a rich viz is present
  const hasRichViz = visualization && visualization.type !== 'emoji';

  return (
    <div className="relative w-full h-full bg-[#020617] rounded-[2.5rem] overflow-hidden border border-white/10 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] flex">
      {/* Dot Grid Background */}
      <div className="absolute inset-0 opacity-5 pointer-events-none"
        style={{ backgroundImage: 'radial-gradient(circle, #6366f1 1px, transparent 1px)', backgroundSize: '28px 28px' }} />

      {/* Studio glow */}
      <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-indigo-500/5 to-transparent pointer-events-none" />

      {hasRichViz ? (
        <>
          {/* Left: Emoji Canvas (mini) */}
          <div className="relative z-10 flex-shrink-0 border-r border-white/5"
            style={{ width: elements.length > 0 ? '25%' : '0' }}>
            {elements.length > 0 && (
              <DiagramArea elements={elements} highlightedIds={highlightedIds} />
            )}
          </div>

          {/* Right: Rich Visualization */}
          <div className="flex-grow relative z-10 overflow-hidden">
            {/* Header badge */}
            <div className="absolute top-4 right-4 z-20">
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-indigo-400 glass-dark border border-indigo-500/20 rounded-full px-3 py-1">
                {{ mermaid: '🗺 Diagram', katex: '🧮 Formula', code: '💻 Code', chart: '📊 Chart', flow: '🔗 Flow Graph', markdown: '📄 Notes' }[visualization.type] ?? ''}
              </span>
            </div>

            {visualization.type === 'mermaid' && <MermaidChart chart={visualization.data as string} />}
            {visualization.type === 'katex' && <KaTeXView formula={visualization.data as string} />}
            {visualization.type === 'code' && <CodeView data={visualization.data as CodeData} />}
            {visualization.type === 'chart' && <ChartView data={visualization.data as ChartData} />}
            {visualization.type === 'flow' && <FlowView data={visualization.data as FlowData} />}
            {visualization.type === 'markdown' && <MarkdownView content={visualization.data as string} />}
          </div>
        </>
      ) : (
        /* Full emoji whiteboard */
        <div className="w-full h-full z-10">
          <DiagramArea elements={elements} highlightedIds={highlightedIds} />
        </div>
      )}
    </div>
  );
};

export default VisualizationRenderer;
