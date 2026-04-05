import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { getImageForTopic, buildPollinationsUrl } from '../services/imageService';


// ─── Public Types ────────────────────────────────────────────────────────────

export interface CanvasNode {
  id: string;
  label: string;
  detail?: string;
  stepIndex: number;
  indexInStep: number;
  totalInStep: number;
  nodeType?: 'flow' | 'emoji' | 'input' | 'process' | 'decision' | 'output' | 'data' | 'image' | string;
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

const CANVAS_W = 4000;
const CANVAS_H = 4000;
const NODE_W = 280;
const NODE_H = 320;
const PORT_R = 6;        // port circle radius
const COL_GAP = 360;     // center-to-center horizontal
const ROW_GAP = 420;     // center-to-center vertical within step
const STEP_GAP = 180;    // extra gap between steps
const CX = CANVAS_W / 2;
const START_Y = 220;

// Per-step accent colors
const ACCENTS = ['#818cf8', '#34d399', '#fb7185', '#fbbf24', '#60a5fa', '#a78bfa'];

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

    // Calculate In-Degree and Out-Degree
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

    // ── INTELLIGENT DIAGRAM TYPE DETECTION ──
    // Detect Cycle: Every node exactly 1 in and 1 out, and exactly num_nodes edges
    const isCycle = stepNodes.length > 2 && 
                    stepEdges.length === stepNodes.length && 
                    Array.from(inDegree.values()).every(v => v === 1) &&
                    Array.from(outDegree.values()).every(v => v === 1);

    if (isCycle) {
      // Circle Layout
      const radius = 220 + stepNodes.length * 30; // dynamic radius based on node count
      // Find a start node (e.g. earliest indexInStep)
      const startNode = stepNodes.slice().sort((a, b) => a.indexInStep - b.indexInStep)[0];
      
      let currId = startNode.id;
      const cycleOrdered: CanvasNode[] = [];
      const visited = new Set<string>();
      
      while (!visited.has(currId) && cycleOrdered.length < stepNodes.length) {
        visited.add(currId);
        cycleOrdered.push(stepNodes.find(n => n.id === currId)!);
        const nextId = adj.get(currId)?.[0];
        if (!nextId) break;
        currId = nextId;
      }
      
      cycleOrdered.forEach((n, idx) => {
        // -PI/2 so first node points Up (12 o'clock)
        const angle = -Math.PI / 2 + (idx * 2 * Math.PI) / cycleOrdered.length;
        posMap[n.id] = {
          x: CX + Math.cos(angle) * (radius * 1.2), // wider ellipse look
          y: currentY + radius + Math.sin(angle) * radius
        };
      });
      
      currentY += (radius * 2) + STEP_GAP + NODE_H;
    } 
    else {
      // ── Tree / Hierarchy / Flowchart (DAG Layout) ──
      
      // Find root nodes (inDegree 0)
      let roots = stepNodes.filter(n => inDegree.get(n.id) === 0);
      
      if (roots.length === 0 && stepNodes.length > 0) {
         // Fallback if graph is weirdly cyclic but not a perfect cycle
         roots = [stepNodes.slice().sort((a,b) => a.indexInStep - b.indexInStep)[0]];
      }

      // BFS to assign Topological Levels (Tree Drop-Down logic)
      const levels = new Map<string, number>();
      roots.forEach(r => levels.set(r.id, 0));
      
      const queue = [...roots];
      while (queue.length > 0) {
        const curr = queue.shift()!;
        const currLvl = levels.get(curr.id)!;
        
        adj.get(curr.id)?.forEach(child => {
           const existing = levels.get(child) || -1;
           if (currLvl + 1 > existing) {
              levels.set(child, currLvl + 1);
              if (!queue.includes(stepNodes.find(n => n.id === child)!)) {
                 queue.push(stepNodes.find(n => n.id === child)!);
              }
           }
        });
      }

      // Handle unreached/floating nodes (give them level 0)
      stepNodes.forEach(n => {
        if (!levels.has(n.id)) levels.set(n.id, 0);
      });

      // Group Topologically and compute Coordinates
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
        // Small screen logical wrap (max columns per level constraint isn't strict here since canvas is infinitely zoomable, 
        // but we space them evenly relative to center).
        const rowW = (rowNodes.length - 1) * COL_GAP;
        const startX = CX - rowW / 2;
        
        rowNodes.forEach((n, idx) => {
          posMap[n.id] = {
            x: n.nodeType === 'emoji' ? CX - 120 + (idx * 240) : startX + idx * COL_GAP,
            y: currentY + L * ROW_GAP
          };
        });
      }

      currentY += (maxLevel + 1) * ROW_GAP + STEP_GAP;
    }
  }

  return { posMap, stepStart };
}

// ─── Bezier Path ─────────────────────────────────────────────────────────────
// ReactFlow style: vertical → exit bottom-center, enter top-center (S-curve)
//                  horizontal → exit right-center, enter left-center

function bezierPath(fx: number, fy: number, tx: number, ty: number): string {
  const dx = Math.abs(tx - fx);
  const dy = Math.abs(ty - fy);

  if (dy >= dx) {
    // Vertical flow
    const sx = fx;
    const sy = fy + NODE_H / 2 + PORT_R;
    const ex = tx;
    const ey = ty - NODE_H / 2 - PORT_R;
    const mid = (sy + ey) / 2;
    return `M ${sx},${sy} C ${sx},${mid} ${ex},${mid} ${ex},${ey}`;
  } else {
    // Horizontal flow
    const sx = fx + NODE_W / 2 + PORT_R;
    const sy = fy;
    const ex = tx - NODE_W / 2 - PORT_R;
    const ey = ty;
    const mid = (sx + ex) / 2;
    return `M ${sx},${sy} C ${mid},${sy} ${mid},${ey} ${ex},${ey}`;
  }
}

// ─── ImageNode Sub-Component ──────────────────────────────────────────────────
// Renders a visual image inside the canvas. Uses Wikipedia thumbnail API for
// real photos, with Pollinations AI as fallback. Both work as img src (no CORS).

interface VisualNodeCardProps {
  node: CanvasNode;
  pos: { x: number; y: number };
  isRev: boolean;
  isCur: boolean;
  isPast: boolean;
  accent: string;
}

const VisualNodeCard: React.FC<VisualNodeCardProps> = ({ node, pos, isRev, isCur, isPast, accent }) => {
  const safePrompt = encodeURIComponent(
    (node.label ? node.label.replace(/[^a-zA-Z0-9\s]/g, '') : 'educational diagram') + ' detailed illustration'
  );
  
  const pollinationsUrl = `https://image.pollinations.ai/prompt/${safePrompt}?width=800&height=450&seed=${node.id.replace(/[^0-9]/g, '').slice(0,6) || '42'}`;
  
  const [imgSrc, setImgSrc] = useState<string>(node.imageUrl || pollinationsUrl);
  const [loaded, setLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const fetchWiki = async () => {
      if (node.imageUrl && node.imageUrl.length > 5 && !node.imageUrl.includes('pollinations')) return;
      try {
        const term = encodeURIComponent(node.label.replace(/[^\w\s]/g, '').trim());
        const res = await fetch(`https://en.wikipedia.org/w/api.php?action=query&origin=*&format=json&generator=search&gsrnamespace=0&gsrlimit=1&gsrsearch=${term}&prop=pageimages&piprop=thumbnail&pithumbsize=800`, {
          signal: AbortSignal.timeout(3500)
        });
        if (!res.ok) return;
        const data = await res.json();
        const pages = data?.query?.pages;
        if (pages) {
          const pageId = Object.keys(pages)[0];
          const url = pages[pageId]?.thumbnail?.source;
          if (url) {
             setImgSrc(url);
          }
        }
      } catch {
        // Keep fallback
      }
    };
    fetchWiki();
  }, [node.label, node.imageUrl]);

  return (
    <div style={{
      position: 'absolute',
      left: pos.x - NODE_W / 2,
      top: pos.y - NODE_H / 2,
      width: NODE_W,
      height: NODE_H,
      opacity: isRev ? (isCur ? 1 : isPast ? 0.65 : 0.85) : 0,
      transform: isRev ? `scale(${isCur ? 1.05 : 1}) translateY(0)` : 'scale(0.85) translateY(28px)',
      transition: 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
      zIndex: isCur ? 15 : node.nodeType === 'image' ? 5 : 2,
      pointerEvents: 'none',
      background: isCur ? `linear-gradient(180deg, ${accent}22 0%, rgba(5,13,26,0.98) 100%)` : isPast ? 'rgba(8,16,30,0.85)' : 'rgba(10,20,40,0.95)',
      borderRadius: 20,
      border: `1.5px solid ${isCur ? `${accent}88` : isPast ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.1)'}`,
      borderTop: `3px solid ${isCur ? accent : isPast ? `${accent}44` : `${accent}66`}`,
      boxShadow: isCur ? `0 0 24px ${accent}40, 0 16px 40px rgba(0,0,0,0.8)` : '0 6px 20px rgba(0,0,0,0.6)',
      backdropFilter: 'blur(24px)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* ── Visual Context Image (Top half) ── */}
      <div style={{ width: '100%', height: '52%', position: 'relative', flexShrink: 0, backgroundColor: 'rgba(0,0,0,0.4)', overflow: 'hidden' }}>
        {(!loaded || hasError) && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(90deg, rgba(30,40,60,0.8) 0%, rgba(50,70,100,0.5) 50%, rgba(30,40,60,0.8) 100%)',
            backgroundSize: '200% 100%',
            animation: hasError ? 'none' : 'shimmer 1.5s infinite',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ color: accent, fontSize: 32, opacity: 0.5 }}>{hasError ? '🖼️' : '🖼️'}</div>
          </div>
        )}
        {!hasError && (
          <img
            src={imgSrc}
            alt={node.label}
            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: loaded ? 1 : 0, transition: 'opacity 0.6s ease' }}
            onLoad={() => setLoaded(true)}
            onError={() => {
              if (imgSrc.includes('pollinations') && !imgSrc.includes('fallback=1')) {
                setImgSrc(`${pollinationsUrl}&fallback=1`);
              } else {
                setHasError(true);
              }
            }}
          />
        )}
        {/* Soft blend edge */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 40, background: 'linear-gradient(to top, rgba(0,0,0,0.6), transparent)', pointerEvents: 'none' }} />
      </div>

      {/* ── Metadata & Text (Bottom half) ── */}
      <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', flexGrow: 1, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          color: isCur ? '#f8fafc' : isPast ? '#94a3b8' : '#e2e8f0',
          fontSize: 14,
          fontWeight: 800,
          lineHeight: 1.3,
          textAlign: 'center',
          fontFamily: 'Inter, system-ui, sans-serif',
          letterSpacing: '-0.01em',
          wordBreak: 'break-word',
          textShadow: isCur ? '0 2px 4px rgba(0,0,0,0.5)' : 'none',
        }}>
          {node.label}
        </div>
        
        {node.detail && (
          <div style={{
            marginTop: 8,
            color: isCur ? '#cbd5e1' : isPast ? '#475569' : '#64748b',
            fontSize: 11.5,
            fontWeight: 500,
            lineHeight: 1.45,
            textAlign: 'center',
            fontFamily: 'Inter, system-ui, sans-serif',
            opacity: isRev ? 1 : 0,
            transition: 'opacity 0.8s ease',
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

// ─── Component ───────────────────────────────────────────────────────────────

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
        const at = n.totalInStep <= 1 ? 0 : (n.indexInStep / n.totalInStep) * dur * 0.80;
        if (relativeTime >= at) s.add(n.id);
      }
    });
    return s;
  }, [nodes, currentStepIndex, relativeTime, stepDurations]);

  // ── Transform State & Interaction ──────────────────────────────────────────
  const [camX, setCamX] = useState(0);
  const [camY, setCamY] = useState(0);
  const [camZoom, setCamZoom] = useState(0.75);
  const [isManual, setIsManual] = useState(false);
  
  const isDragging = useRef(false);
  const lastPtr = useRef({ x: 0, y: 0 });

  // Auto-follow logic
  useEffect(() => {
    if (isManual) return;
    const focus = nodes.filter(n => n.stepIndex === currentStepIndex);
    if (!focus.length) {
      setCamX(size.w / 2 - CX * camZoom);
      setCamY(size.h / 2 - START_Y * camZoom);
      return;
    }
    
    // Get absolute points for all nodes in this step
    const pts = focus.map(n => layout.posMap[n.id] || { x: CX, y: START_Y });
    
    // Calculate bounding box of the active step
    const minX = Math.min(...pts.map(p => p.x));
    const maxX = Math.max(...pts.map(p => p.x));
    const minY = Math.min(...pts.map(p => p.y));
    const maxY = Math.max(...pts.map(p => p.y));

    // Add padding for professional presentation (accommodating for NODE_W + extra breathing space)
    const paddingX = 180 + NODE_W; // 90px padding on each side + node width
    const paddingY = 160 + NODE_H; // 80px top/bottom padding + node height
    
    const contentW = (maxX - minX) + paddingX;
    const contentH = (maxY - minY) + paddingY;

    // Calculate smart zoom necessary to fit within the div container (size)
    const targetZoomX = size.w / (contentW || 1);
    const targetZoomY = size.h / (contentH || 1);
    
    // Pick the optimal zoom, limiting extremes
    let optimalZoom = Math.min(targetZoomX, targetZoomY, 1.15); // max zoom 1.15
    optimalZoom = Math.max(optimalZoom, 0.4); // min zoom 0.4 so it never becomes tiny dust

    // Set center axis to the middle of the bounding box
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
    const dx = e.clientX - lastPtr.current.x;
    const dy = e.clientY - lastPtr.current.y;
    lastPtr.current = { x: e.clientX, y: e.clientY };
    setCamX(x => x + dx);
    setCamY(y => y + dy);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handleWheel = (e: React.WheelEvent) => {
    // Zoom around center of screen (simple zoom)
    const zoomSensitivity = 0.0015;
    const delta = -e.deltaY * zoomSensitivity;
    setCamZoom(z => Math.max(0.2, Math.min(2.5, z + delta)));
    setIsManual(true);
  };

  const activeId = useMemo(() =>
    nodes
      .filter(n => n.stepIndex === currentStepIndex && revealed.has(n.id))
      .sort((a, b) => b.indexInStep - a.indexInStep)[0]?.id ?? null,
    [nodes, currentStepIndex, revealed]);

  const cameraStr = `translate(${camX}px, ${camY}px) scale(${camZoom})`;

  // ── Edges ─────────────────────────────────────────────────────────────────
  const edgePaths = useMemo(() => {
    const map = new Map(nodes.map(n => [n.id, n]));
    return edges.map(e => {
      const fn = map.get(e.from);
      const tn = map.get(e.to);
      if (!fn || !tn) return null;
      const fp = layout.posMap[fn.id];
      const tp = layout.posMap[tn.id];
      if (!fp || !tp) return null;
      const d = bezierPath(fp.x, fp.y, tp.x, tp.y);
      const vis = revealed.has(e.from) && revealed.has(e.to);
      // label midpoint (approx)
      const lx = (fp.x + tp.x) / 2;
      const ly = (fp.y + tp.y) / 2 - 10;
      return { id: e.id, d, lx, ly, label: e.label, vis, si: fn.stepIndex };
    }).filter(Boolean) as { id: string; d: string; lx: number; ly: number; label?: string; vis: boolean; si: number }[];
  }, [nodes, edges, revealed, layout]);

  const stepCount = stepDurations.length;

  return (
    <div 
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-[#050B14] select-none"
      style={{
        background: 'radial-gradient(ellipse at 50% 20%, #0b1628 0%, #050d1a 70%)',
        touchAction: 'none', 
        cursor: isManual ? (isDragging.current ? 'grabbing' : 'grab') : 'default'
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onWheel={handleWheel}
    >
      {/* Dot grid — ReactFlow style */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'radial-gradient(circle, rgba(148,163,184,0.18) 1px, transparent 1px)',
        backgroundSize: '28px 28px',
      }} />

      {isManual && (
        <button 
          onClick={() => { setIsManual(false); setCamZoom(0.75); }}
          className="absolute top-6 left-1/2 -translate-x-1/2 px-5 py-2 bg-indigo-500/20 hover:bg-indigo-500/40 border border-indigo-500/50 rounded-full text-indigo-300 text-[10px] font-black uppercase tracking-widest cursor-pointer backdrop-blur-md z-50 transition-all hover:scale-105 active:scale-95 shadow-xl"
        >
          Reset Camera
        </button>
      )}

      {/* ── Virtual interactive canvas ── */}
      <div style={{
        position: 'absolute',
        width: CANVAS_W, height: CANVAS_H,
        transform: cameraStr,
        transformOrigin: '0 0',
        transition: isDragging.current ? 'none' : 'transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
        willChange: 'transform',
      }}>

        {/* ── SVG: arrows + edges ── */}
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
                {/* subtle glow */}
                <path d={ep.d} fill="none" stroke={color} strokeWidth="5" strokeOpacity="0.07" strokeLinecap="round" />
                {/* main line */}
                <path
                  d={ep.d} fill="none"
                  stroke={color} strokeWidth="1.5" strokeOpacity="0.6"
                  strokeLinecap="round"
                  markerEnd={`url(#arr-${ep.si % ACCENTS.length})`}
                />
              </g>
            );
          })}
        </svg>

        {/* ── HTML Edge Labels ── */}
        {edgePaths.map(ep => {
          if (!ep.label || !ep.vis) return null;
          const color = ACCENTS[ep.si % ACCENTS.length];
          return (
            <div key={`label-${ep.id}`} style={{
              position: 'absolute',
              left: ep.lx,
              top: ep.ly - 2, // shifted slightly
              transform: 'translate(-50%, -50%)',
              background: '#0a1428',
              border: `1px solid ${color}40`,
              color: color,
              fontSize: '10px',
              fontWeight: 700,
              padding: '4px 10px',
              borderRadius: '12px',
              opacity: ep.vis ? 0.95 : 0,
              transition: 'opacity 0.9s ease',
              pointerEvents: 'none',
              fontFamily: 'Inter, system-ui, sans-serif',
              whiteSpace: 'nowrap',
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
              zIndex: 10,
            }}>
              {ep.label}
            </div>
          );
        })}

        {/* ── Nodes + Step headers ── */}
        {nodes.map(node => {
          const pos = layout.posMap[node.id] || { x: CX, y: START_Y };
          const isRev = revealed.has(node.id);
          const isCur = node.id === activeId;
          const isPast = node.stepIndex < currentStepIndex;
          const accent = ACCENTS[node.stepIndex % ACCENTS.length];

          // ── Emoji node ──
          if (node.nodeType === 'emoji') {
            return (
              <div key={node.id} style={{
                position: 'absolute',
                left: pos.x - 56, top: pos.y - 48,
                textAlign: 'center', width: 112,
                opacity: isRev ? (isCur ? 1 : isPast ? 0.5 : 0.8) : 0,
                transform: isRev ? `scale(${isCur ? 1.1 : 1}) translateY(0)` : 'scale(0.6) translateY(20px)',
                transition: 'all 0.7s cubic-bezier(0.16, 1, 0.3, 1)',
                pointerEvents: 'none',
              }}>
                <div style={{ fontSize: 46, lineHeight: 1, filter: isCur ? `drop-shadow(0 0 14px ${accent}aa)` : 'none' }}>
                  {node.emojiContent}
                </div>
                {node.label && (
                  <div style={{ marginTop: 6, color: isCur ? '#e2e8f0' : '#64748b', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                    {node.label}
                  </div>
                )}
              </div>
            );
          }

          // ── Visual / Image Node ──
          if (node.nodeType === 'image') {
            return <VisualNodeCard key={node.id} node={node} pos={pos} isRev={isRev} isCur={isCur} isPast={isPast} accent={accent} />;
          }

          // ── Step section label (renders once per step, above first node in step) ──
          const isFirstInStep = node.indexInStep === 0;
          const stepY = layout.stepStart[node.stepIndex] ?? START_Y;
          const stepTitle = stepTitles[node.stepIndex];

          // ── Flow node ──
          return (
            <React.Fragment key={node.id}>
              {isFirstInStep && stepTitle && (
                <div style={{
                  position: 'absolute',
                  left: CX - 220, top: stepY - 68,
                  display: 'flex', alignItems: 'center', gap: 8,
                  opacity: node.stepIndex <= currentStepIndex && isRev ? 1 : 0,
                  transition: 'opacity 0.7s ease',
                  pointerEvents: 'none',
                  zIndex: 20,
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: accent, boxShadow: `0 0 6px ${accent}` }} />
                  <span style={{
                    color: accent, fontSize: 10, fontWeight: 900,
                    letterSpacing: '0.12em', textTransform: 'uppercase',
                    fontFamily: 'Inter, system-ui, sans-serif',
                  }}>
                    {stepTitle}
                  </span>
                  <div style={{ height: 1, width: 80, background: `linear-gradient(90deg, ${accent}55, transparent)` }} />
                </div>
              )}

              {node.nodeType === 'decision' ? (
                <div style={{
                  position: 'absolute',
                  left: pos.x - NODE_W / 2,
                  top: pos.y - NODE_H / 2,
                  width: NODE_W,
                  opacity: isRev ? (isCur ? 1 : isPast ? 0.55 : 0.82) : 0,
                  transform: isRev ? `translateY(0) scale(${isCur ? 1.04 : 1})` : 'translateY(24px) scale(0.88)',
                  transition: 'all 0.7s cubic-bezier(0.16, 1, 0.3, 1)',
                  zIndex: isCur ? 10 : 1,
                  pointerEvents: 'none',
                }}>
                  {/* Top port circle */}
                  <div style={{ position: 'absolute', top: -PORT_R, left: '50%', transform: 'translateX(-50%)', width: PORT_R * 2, height: PORT_R * 2, borderRadius: '50%', background: '#050d1a', border: `1.5px solid ${isRev ? accent : 'rgba(71,85,105,0.4)'}`, zIndex: 2 }} />
                  
                  <div style={{ position: 'relative', width: NODE_W, height: NODE_H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {/* Diamond background */}
                    <div style={{
                      position: 'absolute',
                      width: NODE_H * 1.2, height: NODE_H * 1.2,
                      background: isCur ? `linear-gradient(135deg, ${accent}33 0%, rgba(8,16,32,0.95) 100%)` : isPast ? 'rgba(8,16,30,0.85)' : 'rgba(10,20,40,0.95)',
                      border: `1.5px solid ${isCur ? accent : isPast ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)'}`,
                      transform: 'rotate(45deg)',
                      boxShadow: isCur ? `0 0 20px ${accent}40, 0 8px 32px rgba(0,0,0,0.6)` : '0 4px 16px rgba(0,0,0,0.5)',
                      borderRadius: 8,
                      transition: 'all 0.7s cubic-bezier(0.16, 1, 0.3, 1)',
                    }} />
                    {/* Content */}
                    <div style={{ position: 'relative', zIndex: 10, textAlign: 'center', padding: 12 }}>
                      <div style={{ color: isCur ? '#f8fafc' : isPast ? '#64748b' : '#94a3b8', fontSize: 11.5, fontWeight: 800, lineHeight: 1.3, letterSpacing: '0.02em', wordBreak: 'break-word' }}>
                        {node.label}
                      </div>
                    </div>
                  </div>

                  {/* Bottom port circle */}
                  <div style={{ position: 'absolute', bottom: -PORT_R, left: '50%', transform: 'translateX(-50%)', width: PORT_R * 2, height: PORT_R * 2, borderRadius: '50%', background: '#050d1a', border: `1.5px solid ${isRev ? accent : 'rgba(71,85,105,0.4)'}`, zIndex: 2 }} />
                </div>
              ) : (
                <VisualNodeCard node={node} pos={pos} isRev={isRev} isCur={isCur} isPast={isPast} accent={accent} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* ── Step progress pills ── */}
      {stepCount > 1 && (
        <div style={{
          position: 'absolute', top: 16, left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex', gap: 6, zIndex: 30,
        }}>
          {Array.from({ length: stepCount }).map((_, i) => {
            const c = ACCENTS[i % ACCENTS.length];
            return (
              <div key={i} style={{
                width: i === currentStepIndex ? 24 : 6,
                height: 6, borderRadius: 3,
                background: i <= currentStepIndex ? c : 'rgba(255,255,255,0.1)',
                opacity: i === currentStepIndex ? 1 : i < currentStepIndex ? 0.6 : 0.25,
                transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
              }} />
            );
          })}
        </div>
      )}

      {/* Shimmer keyframe */}
      <style>{`
        @keyframes shimmer {
          0% { opacity: 0.4; transform: scaleX(0.3); }
          50% { opacity: 1; transform: scaleX(1); }
          100% { opacity: 0.4; transform: scaleX(0.3); }
        }
      `}</style>
    </div>
  );
};

export default StoryboardCanvas;
