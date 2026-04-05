import React, { useMemo, useRef, useEffect, useState } from 'react';

// ─── Public Types ────────────────────────────────────────────────────────────

export interface CanvasNode {
  id: string;
  label: string;
  detail?: string;
  stepIndex: number;
  indexInStep: number;
  totalInStep: number;
  nodeType?: 'flow' | 'emoji' | 'input' | 'process' | 'decision' | 'output' | 'data' | 'image' | 'explanation' | 'example' | 'formula' | string;
  emojiContent?: string;
  imageUrl?: string;
}

export interface CanvasEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
}

interface Props {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  currentStepIndex: number;
  relativeTime: number;
  stepDurations: number[];
  stepTitles?: string[];
  highlightedIds?: Set<string>;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CANVAS_W = 4800;
const CANVAS_H = 5000;
const NODE_W = 280;
const NODE_H = 300;
const EXPLAIN_W = 380;   // wider for text nodes
const EXPLAIN_H = 220;   // text-only nodes are shorter
const PORT_R = 6;
const COL_GAP = 380;
const ROW_GAP = 380;
const STEP_GAP = 200;
const CX = CANVAS_W / 2;
const START_Y = 220;

// Per-step accent colors
const ACCENTS = ['#818cf8', '#34d399', '#fb7185', '#fbbf24', '#60a5fa', '#a78bfa'];

// Node type icon map for text nodes
const NODE_TYPE_ICON: Record<string, string> = {
  explanation: '💡',
  example: '🌍',
  formula: '📐',
  input: '🟢',
  output: '🏁',
  process: '⚙️',
  decision: '🔶',
  data: '📊',
  flow: '→',
};

// ─── Layout ──────────────────────────────────────────────────────────────────

export interface LayoutData {
  posMap: Record<string, { x: number; y: number }>;
  stepStart: Record<number, number>;
}

export function computeGraphLayout(nodes: CanvasNode[], edges: CanvasEdge[]): LayoutData {
  const posMap: Record<string, { x: number; y: number }> = {};
  const stepStart: Record<number, number> = {};

  // Group nodes by stepIndex
  const steps = new Map<number, CanvasNode[]>();
  nodes.forEach(n => {
    if (!steps.has(n.stepIndex)) steps.set(n.stepIndex, []);
    steps.get(n.stepIndex)!.push(n);
  });

  let currentY = START_Y;
  const stepIndices = Array.from(steps.keys()).sort((a, b) => a - b);

  for (const sIdx of stepIndices) {
    stepStart[sIdx] = currentY;
    const stepNodes = steps.get(sIdx)!;
    const stepNodeIds = new Set(stepNodes.map(n => n.id));
    const stepEdges = edges.filter(e => stepNodeIds.has(e.from) && stepNodeIds.has(e.to));

    const inDegree = new Map<string, number>();
    const outDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();

    stepNodes.forEach(n => {
      inDegree.set(n.id, 0);
      outDegree.set(n.id, 0);
      adj.set(n.id, []);
    });

    stepEdges.forEach(e => {
      adj.get(e.from)?.push(e.to);
      inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1);
      outDegree.set(e.from, (outDegree.get(e.from) || 0) + 1);
    });

    // ── CYCLE DETECTION ──
    const isCycle = stepNodes.length > 2 &&
      stepEdges.length === stepNodes.length &&
      Array.from(inDegree.values()).every(v => v === 1) &&
      Array.from(outDegree.values()).every(v => v === 1);

    if (isCycle) {
      const radius = 240 + stepNodes.length * 32;
      const startNode = stepNodes.slice().sort((a, b) => a.indexInStep - b.indexInStep)[0];
      let currId = startNode.id;
      const cycleOrdered: CanvasNode[] = [];
      const visited = new Set<string>();
      while (!visited.has(currId) && cycleOrdered.length < stepNodes.length) {
        visited.add(currId);
        const n = stepNodes.find(n => n.id === currId);
        if (n) cycleOrdered.push(n);
        const nextId = adj.get(currId)?.[0];
        if (!nextId) break;
        currId = nextId;
      }
      cycleOrdered.forEach((n, idx) => {
        const angle = -Math.PI / 2 + (idx * 2 * Math.PI) / cycleOrdered.length;
        posMap[n.id] = {
          x: CX + Math.cos(angle) * radius * 1.3,
          y: currentY + radius + Math.sin(angle) * radius,
        };
      });
      currentY += radius * 2 + STEP_GAP + NODE_H;
    } else {
      let roots = stepNodes.filter(n => inDegree.get(n.id) === 0);
      if (roots.length === 0 && stepNodes.length > 0) {
        roots = [stepNodes.slice().sort((a, b) => a.indexInStep - b.indexInStep)[0]];
      }

      const levels = new Map<string, number>();
      roots.forEach(r => levels.set(r.id, 0));
      const queue = [...roots];
      while (queue.length > 0) {
        const curr = queue.shift()!;
        const currLvl = levels.get(curr.id)!;
        adj.get(curr.id)?.forEach(child => {
          const existing = levels.get(child) ?? -1;
          if (currLvl + 1 > existing) {
            levels.set(child, currLvl + 1);
            const childNode = stepNodes.find(n => n.id === child);
            if (childNode && !queue.includes(childNode)) queue.push(childNode);
          }
        });
      }

      stepNodes.forEach(n => { if (!levels.has(n.id)) levels.set(n.id, 0); });

      const nodesByLevel = new Map<number, CanvasNode[]>();
      let maxLevel = 0;
      stepNodes.forEach(n => {
        const lvl = levels.get(n.id) || 0;
        maxLevel = Math.max(maxLevel, lvl);
        if (!nodesByLevel.has(lvl)) nodesByLevel.set(lvl, []);
        nodesByLevel.get(lvl)!.push(n);
      });

      for (let L = 0; L <= maxLevel; L++) {
        const rowNodes = nodesByLevel.get(L) || [];
        const rowW = (rowNodes.length - 1) * COL_GAP;
        const startX = CX - rowW / 2;
        rowNodes.forEach((n, idx) => {
          posMap[n.id] = {
            x: n.nodeType === 'emoji' ? CX - 120 + idx * 240 : startX + idx * COL_GAP,
            y: currentY + L * ROW_GAP,
          };
        });
      }

      currentY += (maxLevel + 1) * ROW_GAP + STEP_GAP;
    }
  }

  return { posMap, stepStart };
}

// ─── Bezier Path ─────────────────────────────────────────────────────────────

function bezierPath(fx: number, fy: number, tx: number, ty: number, fromH: number = NODE_H, toH: number = NODE_H, fromW: number = NODE_W, toW: number = NODE_W): string {
  const dx = Math.abs(tx - fx);
  const dy = Math.abs(ty - fy);
  if (dy >= dx) {
    const sx = fx;
    const sy = fy + fromH / 2 + PORT_R;
    const ex = tx;
    const ey = ty - toH / 2 - PORT_R;
    const mid = (sy + ey) / 2;
    return `M ${sx},${sy} C ${sx},${mid} ${ex},${mid} ${ex},${ey}`;
  } else {
    const sx = fx + fromW / 2 + PORT_R;
    const sy = fy;
    const ex = tx - toW / 2 - PORT_R;
    const ey = ty;
    const mid = (sx + ex) / 2;
    return `M ${sx},${sy} C ${mid},${sy} ${mid},${ey} ${ex},${ey}`;
  }
}

// ─── VisualNodeCard — Image + Text (with graceful fallback) ─────────────────

interface VisualNodeCardProps {
  node: CanvasNode;
  pos: { x: number; y: number };
  isRev: boolean;
  isCur: boolean;
  isPast: boolean;
  accent: string;
  w?: number;
  h?: number;
}

const VisualNodeCard: React.FC<VisualNodeCardProps> = ({ node, pos, isRev, isCur, isPast, accent, w = NODE_W, h = NODE_H }) => {
  const safePrompt = encodeURIComponent(
    (node.label ? node.label.replace(/[^a-zA-Z0-9\s]/g, '') : 'educational diagram') + ' detailed educational illustration'
  );
  const pollinationsUrl = `https://image.pollinations.ai/prompt/${safePrompt}?width=800&height=450&seed=${parseInt(node.id.replace(/\D/g, '').slice(0, 6) || '42', 10) % 9999}`;

  const [imgSrc, setImgSrc] = useState<string>(node.imageUrl || pollinationsUrl);
  const [imgStatus, setImgStatus] = useState<'loading' | 'loaded' | 'error'>('loading');

  useEffect(() => {
    // Reset on node change
    setImgStatus('loading');
    setImgSrc(node.imageUrl || pollinationsUrl);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  useEffect(() => {
    const fetchWiki = async () => {
      if (node.imageUrl && node.imageUrl.length > 5 && !node.imageUrl.includes('pollinations')) return;
      try {
        const term = encodeURIComponent(node.label.replace(/[^\w\s]/g, '').trim());
        const res = await fetch(
          `https://en.wikipedia.org/w/api.php?action=query&origin=*&format=json&generator=search&gsrnamespace=0&gsrlimit=1&gsrsearch=${term}&prop=pageimages&piprop=thumbnail&pithumbsize=800`,
          { signal: AbortSignal.timeout(4000) }
        );
        if (!res.ok) return;
        const data = await res.json();
        const pages = data?.query?.pages;
        if (pages) {
          const url = pages[Object.keys(pages)[0]]?.thumbnail?.source;
          if (url) { setImgSrc(url); setImgStatus('loading'); }
        }
      } catch { /* keep fallback */ }
    };
    fetchWiki();
  }, [node.label, node.imageUrl]);

  const showImage = imgStatus !== 'error';
  const imgH = showImage ? '50%' : '0%';

  return (
    <div style={{
      position: 'absolute',
      left: pos.x - w / 2,
      top: pos.y - h / 2,
      width: w,
      height: h,
      opacity: isRev ? (isCur ? 1 : isPast ? 0.65 : 0.85) : 0,
      transform: isRev ? `scale(${isCur ? 1.05 : 1}) translateY(0)` : 'scale(0.85) translateY(28px)',
      transition: 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
      zIndex: isCur ? 15 : 2,
      pointerEvents: 'none',
      background: isCur
        ? `linear-gradient(180deg, ${accent}20 0%, rgba(5,13,26,0.98) 100%)`
        : isPast ? 'rgba(8,16,30,0.88)' : 'rgba(10,20,40,0.94)',
      borderRadius: 20,
      border: `1.5px solid ${isCur ? `${accent}99` : isPast ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.10)'}`,
      borderTop: `3px solid ${isCur ? accent : isPast ? `${accent}44` : `${accent}66`}`,
      boxShadow: isCur
        ? `0 0 32px ${accent}40, 0 16px 48px rgba(0,0,0,0.85)`
        : '0 6px 24px rgba(0,0,0,0.6)',
      backdropFilter: 'blur(20px)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* ── Image (top half — hidden when error) ── */}
      {showImage && (
        <div style={{ width: '100%', height: imgH, position: 'relative', flexShrink: 0, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.35)', transition: 'height 0.4s ease' }}>
          {imgStatus === 'loading' && (
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(90deg, rgba(20,30,55,0.9) 0%, rgba(40,55,90,0.6) 50%, rgba(20,30,55,0.9) 100%)',
              backgroundSize: '200% 100%',
              animation: 'imgShimmer 1.8s infinite',
            }} />
          )}
          <img
            src={imgSrc}
            alt={node.label}
            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: imgStatus === 'loaded' ? 1 : 0, transition: 'opacity 0.5s ease' }}
            onLoad={() => setImgStatus('loaded')}
            onError={() => {
              // Try Pollinations fallback once
              if (imgSrc !== pollinationsUrl && !imgSrc.includes('fallback=1')) {
                setImgSrc(pollinationsUrl + '&fallback=1');
              } else {
                setImgStatus('error'); // Silently remove image section
              }
            }}
          />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 36, background: 'linear-gradient(to top, rgba(5,13,26,0.8), transparent)', pointerEvents: 'none' }} />
        </div>
      )}

      {/* ── Text content (always shown) ── */}
      <div style={{ padding: showImage ? '14px 18px' : '20px 20px', display: 'flex', flexDirection: 'column', flexGrow: 1, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          color: isCur ? '#f8fafc' : isPast ? '#94a3b8' : '#e2e8f0',
          fontSize: showImage ? 13.5 : 15,
          fontWeight: 800,
          lineHeight: 1.35,
          textAlign: 'center',
          fontFamily: 'Inter, system-ui, sans-serif',
          letterSpacing: '-0.01em',
          wordBreak: 'break-word',
        }}>
          {node.label}
        </div>
        {node.detail && (
          <div style={{
            marginTop: 8,
            color: isCur ? '#cbd5e1' : isPast ? '#475569' : '#64748b',
            fontSize: showImage ? 11 : 12.5,
            fontWeight: 500,
            lineHeight: 1.5,
            textAlign: 'center',
            fontFamily: 'Inter, system-ui, sans-serif',
            opacity: isRev ? 1 : 0,
            transition: 'opacity 0.8s ease',
            maxHeight: showImage ? 72 : 120,
            overflow: 'hidden',
          }}>
            {node.detail}
          </div>
        )}
        {isCur && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            height: 3, borderRadius: 3,
            background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
            animation: 'shimmer 2s infinite',
          }} />
        )}
      </div>

      {/* ── Ports ── */}
      <div style={{ position: 'absolute', top: -PORT_R, left: '50%', transform: 'translateX(-50%)', width: PORT_R * 2, height: PORT_R * 2, borderRadius: '50%', background: '#050d1a', border: `1.5px solid ${isRev ? accent : 'rgba(71,85,105,0.4)'}`, zIndex: 2 }} />
      <div style={{ position: 'absolute', bottom: -PORT_R, left: '50%', transform: 'translateX(-50%)', width: PORT_R * 2, height: PORT_R * 2, borderRadius: '50%', background: '#050d1a', border: `1.5px solid ${isRev ? accent : 'rgba(71,85,105,0.4)'}`, zIndex: 2 }} />
    </div>
  );
};

// ─── TeacherNode — Text-only explanation/example node ────────────────────────

interface TeacherNodeProps {
  node: CanvasNode;
  pos: { x: number; y: number };
  isRev: boolean;
  isCur: boolean;
  isPast: boolean;
  accent: string;
}

const TEACHER_NODE_COLORS: Record<string, { bg: string; border: string; tag: string; tagText: string }> = {
  explanation: {
    bg: 'linear-gradient(135deg, rgba(129,140,248,0.12) 0%, rgba(5,13,26,0.97) 100%)',
    border: '#818cf855',
    tag: 'rgba(129,140,248,0.18)',
    tagText: '#a5b4fc',
  },
  example: {
    bg: 'linear-gradient(135deg, rgba(52,211,153,0.12) 0%, rgba(5,13,26,0.97) 100%)',
    border: '#34d39955',
    tag: 'rgba(52,211,153,0.18)',
    tagText: '#6ee7b7',
  },
  formula: {
    bg: 'linear-gradient(135deg, rgba(251,191,36,0.12) 0%, rgba(5,13,26,0.97) 100%)',
    border: '#fbbf2455',
    tag: 'rgba(251,191,36,0.18)',
    tagText: '#fde68a',
  },
};

const TeacherNode: React.FC<TeacherNodeProps> = ({ node, pos, isRev, isCur, isPast, accent }) => {
  const theme = TEACHER_NODE_COLORS[node.nodeType || ''] ?? {
    bg: `linear-gradient(135deg, ${accent}12 0%, rgba(5,13,26,0.97) 100%)`,
    border: `${accent}55`,
    tag: `${accent}22`,
    tagText: accent,
  };
  const icon = NODE_TYPE_ICON[node.nodeType || ''] ?? '📌';
  const tagLabel = node.nodeType ? node.nodeType.charAt(0).toUpperCase() + node.nodeType.slice(1) : 'Note';

  return (
    <div style={{
      position: 'absolute',
      left: pos.x - EXPLAIN_W / 2,
      top: pos.y - EXPLAIN_H / 2,
      width: EXPLAIN_W,
      minHeight: EXPLAIN_H,
      opacity: isRev ? (isCur ? 1 : isPast ? 0.6 : 0.82) : 0,
      transform: isRev ? `scale(${isCur ? 1.04 : 1}) translateY(0)` : 'scale(0.88) translateY(20px)',
      transition: 'all 0.75s cubic-bezier(0.16, 1, 0.3, 1)',
      zIndex: isCur ? 12 : 2,
      pointerEvents: 'none',
      background: theme.bg,
      borderRadius: 18,
      border: `1.5px solid ${theme.border}`,
      borderLeft: `4px solid ${isCur ? accent : theme.border}`,
      boxShadow: isCur
        ? `0 0 28px ${accent}30, 0 12px 36px rgba(0,0,0,0.75), 4px 0 0 ${accent}40`
        : '0 4px 20px rgba(0,0,0,0.55)',
      backdropFilter: 'blur(20px)',
      overflow: 'hidden',
      padding: '18px 20px 22px',
    }}>
      {/* Tag badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <span style={{ fontSize: 15 }}>{icon}</span>
        <span style={{
          background: theme.tag,
          color: theme.tagText,
          fontSize: 9.5,
          fontWeight: 800,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          padding: '3px 9px',
          borderRadius: 999,
          fontFamily: 'Inter, system-ui, sans-serif',
        }}>{tagLabel}</span>
      </div>

      {/* Title */}
      <div style={{
        color: isCur ? '#f1f5f9' : isPast ? '#94a3b8' : '#e2e8f0',
        fontSize: 13.5,
        fontWeight: 800,
        lineHeight: 1.35,
        fontFamily: 'Inter, system-ui, sans-serif',
        letterSpacing: '-0.01em',
        marginBottom: 8,
        wordBreak: 'break-word',
      }}>
        {node.label}
      </div>

      {/* Detail / explanation text */}
      {node.detail && (
        <div style={{
          color: isCur ? '#cbd5e1' : isPast ? '#475569' : '#64748b',
          fontSize: 12,
          fontWeight: 450,
          lineHeight: 1.6,
          fontFamily: 'Inter, system-ui, sans-serif',
          opacity: isRev ? 1 : 0,
          transition: 'opacity 0.9s ease 0.2s',
          wordBreak: 'break-word',
        }}>
          {node.detail}
        </div>
      )}

      {/* Active glow bar */}
      {isCur && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: 3, borderRadius: 3,
          background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
          animation: 'shimmer 2s infinite',
        }} />
      )}

      {/* Ports */}
      <div style={{ position: 'absolute', top: -PORT_R, left: '50%', transform: 'translateX(-50%)', width: PORT_R * 2, height: PORT_R * 2, borderRadius: '50%', background: '#050d1a', border: `1.5px solid ${isRev ? accent : 'rgba(71,85,105,0.3)'}`, zIndex: 2 }} />
      <div style={{ position: 'absolute', bottom: -PORT_R, left: '50%', transform: 'translateX(-50%)', width: PORT_R * 2, height: PORT_R * 2, borderRadius: '50%', background: '#050d1a', border: `1.5px solid ${isRev ? accent : 'rgba(71,85,105,0.3)'}`, zIndex: 2 }} />
    </div>
  );
};

// ─── DecisionNode — Diamond shape ────────────────────────────────────────────

interface DecisionNodeProps {
  node: CanvasNode;
  pos: { x: number; y: number };
  isRev: boolean;
  isCur: boolean;
  isPast: boolean;
  accent: string;
}

const DecisionNode: React.FC<DecisionNodeProps> = ({ node, pos, isRev, isCur, isPast, accent }) => (
  <div style={{
    position: 'absolute',
    left: pos.x - NODE_W / 2,
    top: pos.y - NODE_H / 2,
    width: NODE_W,
    height: NODE_H,
    opacity: isRev ? (isCur ? 1 : isPast ? 0.55 : 0.82) : 0,
    transform: isRev ? `translateY(0) scale(${isCur ? 1.05 : 1})` : 'translateY(24px) scale(0.88)',
    transition: 'all 0.7s cubic-bezier(0.16, 1, 0.3, 1)',
    zIndex: isCur ? 10 : 1,
    pointerEvents: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }}>
    <div style={{ position: 'absolute', top: -PORT_R, left: '50%', transform: 'translateX(-50%)', width: PORT_R * 2, height: PORT_R * 2, borderRadius: '50%', background: '#050d1a', border: `1.5px solid ${isRev ? accent : 'rgba(71,85,105,0.4)'}`, zIndex: 2 }} />
    <div style={{
      position: 'absolute',
      width: NODE_H * 1.1, height: NODE_H * 1.1,
      background: isCur ? `linear-gradient(135deg, ${accent}30 0%, rgba(8,16,32,0.96) 100%)` : isPast ? 'rgba(8,16,30,0.85)' : 'rgba(10,20,40,0.95)',
      border: `1.5px solid ${isCur ? accent : isPast ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.11)'}`,
      transform: 'rotate(45deg)',
      boxShadow: isCur ? `0 0 24px ${accent}40, 0 8px 32px rgba(0,0,0,0.6)` : '0 4px 16px rgba(0,0,0,0.5)',
      borderRadius: 10,
      transition: 'all 0.7s cubic-bezier(0.16, 1, 0.3, 1)',
    }} />
    <div style={{ position: 'relative', zIndex: 10, textAlign: 'center', padding: 12 }}>
      <div style={{ color: isCur ? '#f8fafc' : isPast ? '#64748b' : '#94a3b8', fontSize: 11.5, fontWeight: 800, lineHeight: 1.35, letterSpacing: '0.02em', wordBreak: 'break-word' }}>
        {node.label}
      </div>
    </div>
    <div style={{ position: 'absolute', bottom: -PORT_R, left: '50%', transform: 'translateX(-50%)', width: PORT_R * 2, height: PORT_R * 2, borderRadius: '50%', background: '#050d1a', border: `1.5px solid ${isRev ? accent : 'rgba(71,85,105,0.4)'}`, zIndex: 2 }} />
  </div>
);

// ─── Main StoryboardCanvas Component ─────────────────────────────────────────

const StoryboardCanvas: React.FC<Props> = ({
  nodes,
  edges,
  currentStepIndex,
  relativeTime,
  stepDurations,
  stepTitles = [],
  highlightedIds = new Set(),
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 900, h: 600 });

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(e => {
      const r = e[0]?.contentRect;
      if (r) setSize({ w: r.width, h: r.height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => computeGraphLayout(nodes, edges), [nodes, edges]);

  // ── Reveal ────────────────────────────────────────────────────────────────
  const revealed = useMemo(() => {
    const s = new Set<string>();
    nodes.forEach(n => {
      if (n.stepIndex < currentStepIndex) {
        s.add(n.id);
      } else if (n.stepIndex === currentStepIndex) {
        const dur = stepDurations[currentStepIndex] ?? 20;
        const at = n.totalInStep <= 1 ? 0 : (n.indexInStep / n.totalInStep) * dur * 0.8;
        if (relativeTime >= at) s.add(n.id);
      }
    });
    return s;
  }, [nodes, currentStepIndex, relativeTime, stepDurations]);

  // ── Camera ────────────────────────────────────────────────────────────────
  const [camX, setCamX] = useState(0);
  const [camY, setCamY] = useState(0);
  const [camZoom, setCamZoom] = useState(0.72);
  const [isManual, setIsManual] = useState(false);
  const isDragging = useRef(false);
  const lastPtr = useRef({ x: 0, y: 0 });

  // Helper: get effective node width/height for a node type
  const getNodeSize = (n: CanvasNode) => {
    if (n.nodeType === 'explanation' || n.nodeType === 'example' || n.nodeType === 'formula') {
      return { w: EXPLAIN_W, h: EXPLAIN_H };
    }
    return { w: NODE_W, h: NODE_H };
  };

  useEffect(() => {
    if (isManual) return;
    const focus = nodes.filter(n => n.stepIndex === currentStepIndex);
    if (!focus.length) {
      setCamX(size.w / 2 - CX * camZoom);
      setCamY(size.h / 2 - START_Y * camZoom);
      return;
    }
    const pts = focus.map(n => layout.posMap[n.id] || { x: CX, y: START_Y });
    const minX = Math.min(...pts.map(p => p.x));
    const maxX = Math.max(...pts.map(p => p.x));
    const minY = Math.min(...pts.map(p => p.y));
    const maxY = Math.max(...pts.map(p => p.y));
    const contentW = (maxX - minX) + 200 + NODE_W;
    const contentH = (maxY - minY) + 160 + NODE_H;
    let optimalZoom = Math.min(size.w / (contentW || 1), size.h / (contentH || 1), 1.1);
    optimalZoom = Math.max(optimalZoom, 0.35);
    const ax = (minX + maxX) / 2;
    const ay = (minY + maxY) / 2;
    setCamX(size.w / 2 - ax * optimalZoom);
    setCamY(size.h / 2 - ay * optimalZoom);
    setCamZoom(optimalZoom);
  }, [currentStepIndex, layout, size, isManual, nodes]);

  const handlePointerDown = (e: React.PointerEvent) => {
    isDragging.current = true;
    lastPtr.current = { x: e.clientX, y: e.clientY };
    setIsManual(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging.current) return;
    setCamX(x => x + e.clientX - lastPtr.current.x);
    setCamY(y => y + e.clientY - lastPtr.current.y);
    lastPtr.current = { x: e.clientX, y: e.clientY };
  };
  const handlePointerUp = (e: React.PointerEvent) => {
    isDragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const handleWheel = (e: React.WheelEvent) => {
    setCamZoom(z => Math.max(0.18, Math.min(2.5, z - e.deltaY * 0.0015)));
    setIsManual(true);
  };

  const activeId = useMemo(() =>
    nodes
      .filter(n => n.stepIndex === currentStepIndex && revealed.has(n.id))
      .sort((a, b) => b.indexInStep - a.indexInStep)[0]?.id ?? null,
    [nodes, currentStepIndex, revealed]);

  const cameraStr = `translate(${camX}px, ${camY}px) scale(${camZoom})`;

  // ── Edges with proper node sizes ─────────────────────────────────────────
  const edgePaths = useMemo(() => {
    const map = new Map(nodes.map(n => [n.id, n]));
    return edges.map(e => {
      const fn = map.get(e.from);
      const tn = map.get(e.to);
      if (!fn || !tn) return null;
      const fp = layout.posMap[fn.id];
      const tp = layout.posMap[tn.id];
      if (!fp || !tp) return null;
      const fromSize = getNodeSize(fn);
      const toSize = getNodeSize(tn);
      const d = bezierPath(fp.x, fp.y, tp.x, tp.y, fromSize.h, toSize.h, fromSize.w, toSize.w);
      const vis = revealed.has(e.from) && revealed.has(e.to);
      return { id: e.id, d, lx: (fp.x + tp.x) / 2, ly: (fp.y + tp.y) / 2 - 10, label: e.label, vis, si: fn.stepIndex };
    }).filter(Boolean) as { id: string; d: string; lx: number; ly: number; label?: string; vis: boolean; si: number }[];
  }, [nodes, edges, revealed, layout]);

  const stepCount = stepDurations.length;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden select-none"
      style={{
        background: 'radial-gradient(ellipse at 50% 15%, #0c1a2e 0%, #050d1a 65%, #020810 100%)',
        touchAction: 'none',
        cursor: isManual ? (isDragging.current ? 'grabbing' : 'grab') : 'default',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onWheel={handleWheel}
    >
      {/* Dot-grid background */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'radial-gradient(circle, rgba(148,163,184,0.15) 1px, transparent 1px)',
        backgroundSize: '30px 30px',
      }} />

      {/* Reset camera button */}
      {isManual && (
        <button
          onClick={() => { setIsManual(false); setCamZoom(0.72); }}
          style={{
            position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)',
            zIndex: 50, padding: '6px 20px',
            background: 'rgba(99,102,241,0.2)', border: '1px solid rgba(99,102,241,0.5)',
            borderRadius: 999, color: '#a5b4fc', fontSize: 10, fontWeight: 900,
            letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer',
            backdropFilter: 'blur(12px)', transition: 'all 0.2s',
          }}
        >
          ⟳ Reset View
        </button>
      )}

      {/* ── Virtual infinite canvas ── */}
      <div style={{
        position: 'absolute',
        width: CANVAS_W, height: CANVAS_H,
        transform: cameraStr,
        transformOrigin: '0 0',
        transition: isDragging.current ? 'none' : 'transform 0.65s cubic-bezier(0.16, 1, 0.3, 1)',
        willChange: 'transform',
      }}>
        {/* ── SVG: Edges ── */}
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
          <defs>
            {ACCENTS.map((color, i) => (
              <marker key={i} id={`arr-${i}`} markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                <circle cx="4" cy="4" r="2.5" fill={color} />
              </marker>
            ))}
          </defs>
          {edgePaths.map(ep => {
            const color = ACCENTS[ep.si % ACCENTS.length];
            return (
              <g key={ep.id} style={{ opacity: ep.vis ? 1 : 0, transition: 'opacity 0.9s ease' }}>
                <path d={ep.d} fill="none" stroke={color} strokeWidth="6" strokeOpacity="0.06" strokeLinecap="round" />
                <path d={ep.d} fill="none" stroke={color} strokeWidth="1.8" strokeOpacity="0.65" strokeLinecap="round" markerEnd={`url(#arr-${ep.si % ACCENTS.length})`} />
              </g>
            );
          })}
        </svg>

        {/* ── Edge labels ── */}
        {edgePaths.map(ep => {
          if (!ep.label || !ep.vis) return null;
          const color = ACCENTS[ep.si % ACCENTS.length];
          return (
            <div key={`lbl-${ep.id}`} style={{
              position: 'absolute', left: ep.lx, top: ep.ly,
              transform: 'translate(-50%, -50%)',
              background: '#080f1f', border: `1px solid ${color}40`, color,
              fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 12,
              opacity: 0.95, pointerEvents: 'none', whiteSpace: 'nowrap',
              fontFamily: 'Inter, system-ui, sans-serif',
              boxShadow: '0 2px 8px rgba(0,0,0,0.5)', zIndex: 10,
            }}>
              {ep.label}
            </div>
          );
        })}

        {/* ── Nodes ── */}
        {nodes.map(node => {
          const pos = layout.posMap[node.id] || { x: CX, y: START_Y };
          const isRev = revealed.has(node.id);
          const isCur = node.id === activeId;
          const isPast = node.stepIndex < currentStepIndex;
          const accent = ACCENTS[node.stepIndex % ACCENTS.length];

          // ── Floating emoji annotation ──
          if (node.nodeType === 'emoji') {
            return (
              <div key={node.id} style={{
                position: 'absolute', left: pos.x - 56, top: pos.y - 48,
                textAlign: 'center', width: 112,
                opacity: isRev ? (isCur ? 1 : isPast ? 0.5 : 0.8) : 0,
                transform: isRev ? `scale(${isCur ? 1.1 : 1})` : 'scale(0.6) translateY(20px)',
                transition: 'all 0.7s cubic-bezier(0.16, 1, 0.3, 1)',
                pointerEvents: 'none',
              }}>
                <div style={{ fontSize: 46, lineHeight: 1, filter: isCur ? `drop-shadow(0 0 14px ${accent}aa)` : 'none' }}>
                  {node.emojiContent}
                </div>
                {node.label && (
                  <div style={{ marginTop: 6, color: isCur ? '#e2e8f0' : '#64748b', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    {node.label}
                  </div>
                )}
              </div>
            );
          }

          // ── Decision diamond ──
          if (node.nodeType === 'decision') {
            return (
              <React.Fragment key={node.id}>
                {node.indexInStep === 0 && stepTitles[node.stepIndex] && renderStepHeader(node, stepTitles, layout, currentStepIndex, isRev, accent)}
                <DecisionNode node={node} pos={pos} isRev={isRev} isCur={isCur} isPast={isPast} accent={accent} />
              </React.Fragment>
            );
          }

          // ── Teacher text nodes (explanation, example, formula) ──
          if (node.nodeType === 'explanation' || node.nodeType === 'example' || node.nodeType === 'formula') {
            return (
              <React.Fragment key={node.id}>
                {node.indexInStep === 0 && stepTitles[node.stepIndex] && renderStepHeader(node, stepTitles, layout, currentStepIndex, isRev, accent)}
                <TeacherNode node={node} pos={pos} isRev={isRev} isCur={isCur} isPast={isPast} accent={accent} />
              </React.Fragment>
            );
          }

          // ── Visual / Image node ──
          if (node.nodeType === 'image') {
            return (
              <React.Fragment key={node.id}>
                {node.indexInStep === 0 && stepTitles[node.stepIndex] && renderStepHeader(node, stepTitles, layout, currentStepIndex, isRev, accent)}
                <VisualNodeCard node={node} pos={pos} isRev={isRev} isCur={isCur} isPast={isPast} accent={accent} />
              </React.Fragment>
            );
          }

          // ── Standard flow nodes (input, output, process, data, etc.) ──
          return (
            <React.Fragment key={node.id}>
              {node.indexInStep === 0 && stepTitles[node.stepIndex] && renderStepHeader(node, stepTitles, layout, currentStepIndex, isRev, accent)}
              <VisualNodeCard node={node} pos={pos} isRev={isRev} isCur={isCur} isPast={isPast} accent={accent} />
            </React.Fragment>
          );
        })}
      </div>

      {/* ── Step progress pills ── */}
      {stepCount > 1 && (
        <div style={{ position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6, zIndex: 30 }}>
          {Array.from({ length: stepCount }).map((_, i) => {
            const c = ACCENTS[i % ACCENTS.length];
            return (
              <div key={i} style={{
                width: i === currentStepIndex ? 24 : 7, height: 7, borderRadius: 4,
                background: i <= currentStepIndex ? c : 'rgba(255,255,255,0.1)',
                opacity: i === currentStepIndex ? 1 : i < currentStepIndex ? 0.65 : 0.22,
                transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
              }} />
            );
          })}
        </div>
      )}

      {/* Global keyframes */}
      <style>{`
        @keyframes shimmer {
          0% { opacity: 0.35; transform: scaleX(0.3); }
          50% { opacity: 1; transform: scaleX(1); }
          100% { opacity: 0.35; transform: scaleX(0.3); }
        }
        @keyframes imgShimmer {
          0%,100% { background-position: -200% center; }
          50% { background-position: 200% center; }
        }
      `}</style>
    </div>
  );
};

// ─── Helper: Step section header ─────────────────────────────────────────────

function renderStepHeader(node: CanvasNode, stepTitles: string[], layout: LayoutData, currentStepIndex: number, isRev: boolean, accent: string) {
  const stepY = layout.stepStart[node.stepIndex] ?? START_Y;
  const stepTitle = stepTitles[node.stepIndex];
  if (!stepTitle) return null;
  return (
    <div style={{
      position: 'absolute', left: CX - 240, top: stepY - 72,
      display: 'flex', alignItems: 'center', gap: 10,
      opacity: node.stepIndex <= currentStepIndex && isRev ? 1 : 0,
      transition: 'opacity 0.7s ease', pointerEvents: 'none', zIndex: 20,
    }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: accent, boxShadow: `0 0 8px ${accent}` }} />
      <span style={{ color: accent, fontSize: 11, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: 'Inter, system-ui, sans-serif' }}>
        {stepTitle}
      </span>
      <div style={{ height: 1, width: 100, background: `linear-gradient(90deg, ${accent}55, transparent)` }} />
    </div>
  );
}

export default StoryboardCanvas;
