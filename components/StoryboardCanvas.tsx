import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';

// ─── Public Types ────────────────────────────────────────────────────────────

export interface CanvasNode {
  id: string;
  label: string;
  detail?: string;
  stepIndex: number;
  indexInStep: number;
  totalInStep: number;
  nodeType?:
  | 'flow' | 'emoji' | 'input' | 'process' | 'decision' | 'output' | 'data' | 'image'
  // Legacy teacher nodes
  | 'explanation' | 'example' | 'formula'
  // NEW: rich text nodes from groqservice
  | 'definition' | 'insight' | 'note' | 'summary' | 'qa' | 'formula_text'
  | string;
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
  stepNarratives?: string[];
  highlightedIds?: Set<string>;
  isSpeaking?: boolean;
  onFocusModeChange?: (v: boolean) => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CANVAS_W = 6000;
const CANVAS_H = 6000;
const NODE_W = 300;
const NODE_H = 320;
// Text nodes are wider and taller to accommodate detailed content
const TEXT_W = 420;
const TEXT_H = 260;
// Legacy teacher node sizes
const EXPLAIN_W = 400;
const EXPLAIN_H = 230;
const PORT_R = 7;

const H_GAP = 60;
const V_GAP = 70;
const STEP_SEP = 120;
const MAX_COLS = 4;
const CX = CANVAS_W / 2;
const START_Y = 280;

const ACCENTS = ['#818cf8', '#34d399', '#fb7185', '#fbbf24', '#60a5fa', '#a78bfa'];

// ─── Text node type sets ──────────────────────────────────────────────────────

/** New rich-text node types introduced in groqservice */
const RICH_TEXT_TYPES = new Set([
  'definition', 'insight', 'note', 'summary', 'qa', 'formula_text',
]);

/** Legacy teacher-node types (kept for backward compat) */
const LEGACY_TEACHER_TYPES = new Set(['explanation', 'example', 'formula']);

// ─── Global Image Cache ───────────────────────────────────────────────────────

const imageCache = new Map<string, string>();

// ─── Node dimension helper ────────────────────────────────────────────────────

function nodeSize(nt?: string): { w: number; h: number } {
  if (RICH_TEXT_TYPES.has(nt || '')) return { w: TEXT_W, h: TEXT_H };
  if (LEGACY_TEACHER_TYPES.has(nt || '')) return { w: EXPLAIN_W, h: EXPLAIN_H };
  if (nt === 'image') return { w: 300, h: 280 };
  if (nt === 'emoji') return { w: 120, h: 100 };
  return { w: NODE_W, h: NODE_H };
}

// ─── Rich Text Node Themes ────────────────────────────────────────────────────
// Each text node type has a unique visual language so students can instantly
// identify what kind of content they're reading.

interface TextNodeTheme {
  bg: string;
  borderColor: string;
  accentBar: string;      // left-border accent color
  tagBg: string;
  tagText: string;
  icon: string;
  label: string;
  detailColor: string;
  labelColor: string;
}

const RICH_TEXT_THEMES: Record<string, TextNodeTheme> = {
  definition: {
    bg: 'linear-gradient(145deg, rgba(30,64,175,0.18) 0%, rgba(5,13,26,0.97) 100%)',
    borderColor: 'rgba(96,165,250,0.35)',
    accentBar: '#3b82f6',
    tagBg: 'rgba(59,130,246,0.18)',
    tagText: '#93c5fd',
    icon: '📖',
    label: 'Definition',
    detailColor: '#94b8d8',
    labelColor: '#bfdbfe',
  },
  insight: {
    bg: 'linear-gradient(145deg, rgba(109,40,217,0.18) 0%, rgba(5,13,26,0.97) 100%)',
    borderColor: 'rgba(167,139,250,0.35)',
    accentBar: '#7c3aed',
    tagBg: 'rgba(124,58,237,0.18)',
    tagText: '#c4b5fd',
    icon: '💡',
    label: 'Key Insight',
    detailColor: '#a99dca',
    labelColor: '#ddd6fe',
  },
  note: {
    bg: 'linear-gradient(145deg, rgba(185,28,28,0.16) 0%, rgba(5,13,26,0.97) 100%)',
    borderColor: 'rgba(252,165,165,0.3)',
    accentBar: '#dc2626',
    tagBg: 'rgba(220,38,38,0.16)',
    tagText: '#fca5a5',
    icon: '⚠️',
    label: 'Important Note',
    detailColor: '#c49090',
    labelColor: '#fecaca',
  },
  summary: {
    bg: 'linear-gradient(145deg, rgba(6,78,59,0.18) 0%, rgba(5,13,26,0.97) 100%)',
    borderColor: 'rgba(52,211,153,0.3)',
    accentBar: '#10b981',
    tagBg: 'rgba(16,185,129,0.16)',
    tagText: '#6ee7b7',
    icon: '📋',
    label: 'Summary',
    detailColor: '#7ab8a0',
    labelColor: '#a7f3d0',
  },
  qa: {
    bg: 'linear-gradient(145deg, rgba(120,53,15,0.18) 0%, rgba(5,13,26,0.97) 100%)',
    borderColor: 'rgba(251,191,36,0.28)',
    accentBar: '#d97706',
    tagBg: 'rgba(217,119,6,0.16)',
    tagText: '#fde68a',
    icon: '❓',
    label: 'Q & A',
    detailColor: '#b8a66e',
    labelColor: '#fef3c7',
  },
  formula_text: {
    bg: 'linear-gradient(145deg, rgba(120,53,15,0.16) 0%, rgba(5,13,26,0.97) 100%)',
    borderColor: 'rgba(251,191,36,0.35)',
    accentBar: '#f59e0b',
    tagBg: 'rgba(245,158,11,0.16)',
    tagText: '#fde68a',
    icon: '📐',
    label: 'Formula',
    detailColor: '#d4b870',
    labelColor: '#fef08a',
  },
};

// ─── Layout ──────────────────────────────────────────────────────────────────

interface LayoutData {
  posMap: Record<string, { x: number; y: number }>;
  stepStart: Record<number, number>;
}

function computeGraphLayout(nodes: CanvasNode[], edges: CanvasEdge[]): LayoutData {
  const posMap: Record<string, { x: number; y: number }> = {};
  const stepStart: Record<number, number> = {};

  const steps = new Map<number, CanvasNode[]>();
  nodes.forEach(n => {
    if (!steps.has(n.stepIndex)) steps.set(n.stepIndex, []);
    steps.get(n.stepIndex)!.push(n);
  });

  let cursorY = START_Y;
  const stepIndices = Array.from(steps.keys()).sort((a, b) => a - b);

  for (const sIdx of stepIndices) {
    stepStart[sIdx] = cursorY;
    const stepNodes = steps.get(sIdx)!;
    const stepNodeIds = new Set(stepNodes.map(n => n.id));
    const stepEdges = edges.filter(e => stepNodeIds.has(e.from) && stepNodeIds.has(e.to));

    const inDeg = new Map<string, number>();
    const outDeg = new Map<string, number>();
    const adj = new Map<string, string[]>();
    stepNodes.forEach(n => { inDeg.set(n.id, 0); outDeg.set(n.id, 0); adj.set(n.id, []); });
    stepEdges.forEach(e => {
      adj.get(e.from)?.push(e.to);
      inDeg.set(e.to, (inDeg.get(e.to) || 0) + 1);
      outDeg.set(e.from, (outDeg.get(e.from) || 0) + 1);
    });

    const allInOne = Array.from(inDeg.values()).every(v => v === 1);
    const allOutOne = Array.from(outDeg.values()).every(v => v === 1);
    const isCycle = stepNodes.length > 2 &&
      stepEdges.length === stepNodes.length &&
      allInOne && allOutOne;

    const isLinearChain = !isCycle &&
      stepNodes.length > 1 &&
      Array.from(outDeg.values()).every(v => v <= 1) &&
      Array.from(inDeg.values()).every(v => v <= 1);

    // ── CYCLE LAYOUT ──────────────────────────────────────────────────────
    if (isCycle) {
      const radius = 220 + stepNodes.length * 34;
      let currId = stepNodes.slice().sort((a, b) => a.indexInStep - b.indexInStep)[0].id;
      const ordered: CanvasNode[] = [];
      const vis = new Set<string>();
      while (!vis.has(currId) && ordered.length < stepNodes.length) {
        vis.add(currId);
        const nd = stepNodes.find(n => n.id === currId);
        if (nd) ordered.push(nd);
        const nxt = adj.get(currId)?.[0];
        if (!nxt) break;
        currId = nxt;
      }
      ordered.forEach((n, idx) => {
        const angle = -Math.PI / 2 + (idx * 2 * Math.PI) / ordered.length;
        posMap[n.id] = {
          x: CX + Math.cos(angle) * radius * 1.45,
          y: cursorY + radius + Math.sin(angle) * radius,
        };
      });
      cursorY += radius * 2 + STEP_SEP + NODE_H;
      continue;
    }

    // ── LINEAR CHAIN ──────────────────────────────────────────────────────
    if (isLinearChain && stepNodes.length >= 2) {
      const chainRoots = stepNodes.filter(n => inDeg.get(n.id) === 0);
      const startId = chainRoots.length > 0
        ? chainRoots[0].id
        : stepNodes.slice().sort((a, b) => a.indexInStep - b.indexInStep)[0].id;

      const chain: CanvasNode[] = [];
      let cur = startId;
      const vis2 = new Set<string>();
      while (cur && !vis2.has(cur) && chain.length < stepNodes.length) {
        vis2.add(cur);
        const nd = stepNodes.find(n => n.id === cur);
        if (nd) chain.push(nd);
        cur = adj.get(cur)?.[0] ?? '';
      }
      stepNodes.forEach(n => { if (!vis2.has(n.id)) chain.push(n); });

      const colsThisStep = Math.min(chain.length, MAX_COLS);
      let maxRowH = 0;
      chain.forEach((n, idx) => {
        const col = idx % colsThisStep;
        const row = Math.floor(idx / colsThisStep);
        const sz = nodeSize(n.nodeType);
        const rowCount = Math.min(colsThisStep, chain.length - row * colsThisStep);
        const totalRowW = rowCount * sz.w + (rowCount - 1) * H_GAP;
        const rowStartX = CX - totalRowW / 2 + sz.w / 2;
        posMap[n.id] = {
          x: rowStartX + col * (sz.w + H_GAP),
          y: cursorY + row * (NODE_H + V_GAP),
        };
        maxRowH = Math.max(maxRowH, (Math.floor(chain.length / colsThisStep)) * (NODE_H + V_GAP));
      });
      cursorY += maxRowH + NODE_H + STEP_SEP;
      continue;
    }

    // ── HYBRID DAG LAYOUT ─────────────────────────────────────────────────
    let roots = stepNodes.filter(n => inDeg.get(n.id) === 0);
    if (roots.length === 0) {
      roots = [stepNodes.slice().sort((a, b) => a.indexInStep - b.indexInStep)[0]];
    }

    const levels = new Map<string, number>();
    roots.forEach(r => levels.set(r.id, 0));
    const bfsQ = [...roots];
    while (bfsQ.length > 0) {
      const cur = bfsQ.shift()!;
      const lv = levels.get(cur.id)!;
      adj.get(cur.id)?.forEach(child => {
        const ex = levels.get(child) ?? -1;
        if (lv + 1 > ex) {
          levels.set(child, lv + 1);
          const cn = stepNodes.find(n => n.id === child);
          if (cn && !bfsQ.includes(cn)) bfsQ.push(cn);
        }
      });
    }
    stepNodes.forEach(n => { if (!levels.has(n.id)) levels.set(n.id, 0); });

    const byLevel = new Map<number, CanvasNode[]>();
    let maxL = 0;
    stepNodes.forEach(n => {
      const lv = levels.get(n.id) || 0;
      maxL = Math.max(maxL, lv);
      if (!byLevel.has(lv)) byLevel.set(lv, []);
      byLevel.get(lv)!.push(n);
    });

    let levelCursorY = cursorY;
    for (let L = 0; L <= maxL; L++) {
      const lvNodes = byLevel.get(L) || [];
      const colsInLevel = Math.min(lvNodes.length, MAX_COLS);

      lvNodes.forEach((n, idx) => {
        const col = idx % colsInLevel;
        const row = Math.floor(idx / colsInLevel);
        const sz = nodeSize(n.nodeType);
        const rowCount = Math.min(colsInLevel, lvNodes.length - row * colsInLevel);
        const totalW = rowCount * sz.w + (rowCount - 1) * H_GAP;
        const rowStartX = CX - totalW / 2 + sz.w / 2;
        const rowsInLevel = Math.ceil(lvNodes.length / colsInLevel);
        const levelH = rowsInLevel * sz.h + (rowsInLevel - 1) * V_GAP;

        posMap[n.id] = {
          x: rowStartX + col * (sz.w + H_GAP),
          y: levelCursorY + row * (sz.h + V_GAP),
        };

        if (idx === lvNodes.length - 1) {
          levelCursorY += levelH + V_GAP * 2;
        }
      });
    }

    cursorY = levelCursorY + STEP_SEP;
  }

  return { posMap, stepStart };
}

// ─── Bezier Path ─────────────────────────────────────────────────────────────

function bezierPath(fx: number, fy: number, tx: number, ty: number, fromH = NODE_H, toH = NODE_H, fromW = NODE_W, toW = NODE_W): string {
  const dx = Math.abs(tx - fx);
  const dy = Math.abs(ty - fy);
  if (dy >= dx) {
    const sy = fy + fromH / 2 + PORT_R;
    const ey = ty - toH / 2 - PORT_R;
    const mid = (sy + ey) / 2;
    return `M ${fx},${sy} C ${fx},${mid} ${tx},${mid} ${tx},${ey}`;
  } else {
    const sx = fx + fromW / 2 + PORT_R;
    const ex = tx - toW / 2 - PORT_R;
    const mid = (sx + ex) / 2;
    return `M ${sx},${fy} C ${mid},${fy} ${mid},${ty} ${ex},${ty}`;
  }
}

// ─── Formula Renderer ─────────────────────────────────────────────────────────

function renderFormula(text: string): React.ReactNode {
  const SUB_MAP: Record<string, string> = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉' };
  const parts = text.split(/(\s*→\s*|\s*=\s*|\s*\+\s*)/g);
  return (
    <span style={{ fontFamily: "'Courier New', monospace", letterSpacing: '0.02em' }}>
      {parts.map((part, i) => {
        if (part.trim() === '→') return <span key={i} style={{ color: '#fbbf24', fontWeight: 900, margin: '0 4px' }}>→</span>;
        if (part.trim() === '=') return <span key={i} style={{ color: '#a78bfa', fontWeight: 900, margin: '0 4px' }}>=</span>;
        if (part.trim() === '+') return <span key={i} style={{ color: '#60a5fa', fontWeight: 700, margin: '0 3px' }}>+</span>;
        return (
          <span key={i}>
            {part.split('').map((ch, j) => {
              if (SUB_MAP[ch] && j > 0 && /[a-zA-Z]/.test(part[j - 1])) {
                return <sub key={j} style={{ fontSize: '0.75em' }}>{ch}</sub>;
              }
              return ch;
            })}
          </span>
        );
      })}
    </span>
  );
}

// ─── Shared card props ────────────────────────────────────────────────────────

interface CardProps {
  node: CanvasNode;
  pos: { x: number; y: number };
  isRev: boolean;
  isCur: boolean;
  isPast: boolean;
  accent: string;
  focusScale?: number;
  focusOpacity?: number;
  focusMode?: boolean;
}

// ─── RichTextNode — the NEW primary text-content node ────────────────────────
// Handles: definition, insight, note, summary, qa, formula_text
// Design: newspaper-editorial style — content is king, layout is clean.

const RichTextNode: React.FC<CardProps> = ({
  node, pos, isRev, isCur, isPast, accent,
  focusOpacity = 1, focusMode = false,
}) => {
  const theme = RICH_TEXT_THEMES[node.nodeType || ''] ?? {
    bg: `linear-gradient(145deg, ${accent}18, rgba(5,13,26,0.97))`,
    borderColor: `${accent}44`,
    accentBar: accent,
    tagBg: `${accent}22`,
    tagText: accent,
    icon: '📌',
    label: node.nodeType ?? 'Note',
    detailColor: '#7a9bb8',
    labelColor: '#dde4ef',
  };

  const isQA = node.nodeType === 'qa';
  const isFormula = node.nodeType === 'formula_text';
  const isSummary = node.nodeType === 'summary';
  const { w, h } = nodeSize(node.nodeType);

  // QA: split "Q: ...\nA: ..." into parts for styled rendering
  const qaLines = isQA && node.detail
    ? node.detail.split('\n').map(line => {
      if (line.startsWith('Q:')) return { type: 'q', text: line.replace(/^Q:\s*/, '') };
      if (line.startsWith('A:')) return { type: 'a', text: line.replace(/^A:\s*/, '') };
      return { type: 'body', text: line };
    })
    : [];

  // Summary: parse bullet list "• ..." or "- ..."
  const summaryLines = isSummary && node.detail
    ? node.detail.split('\n').filter(l => l.trim())
    : [];

  const baseOpacity = isRev
    ? (focusMode ? focusOpacity : isPast ? 0.78 : 0.97)
    : 0;

  return (
    <div style={{
      position: 'absolute',
      left: pos.x - w / 2,
      top: pos.y - h / 2,
      width: w,
      minHeight: h,
      opacity: baseOpacity,
      transform: isRev ? 'scale(1) translateY(0)' : 'scale(0.88) translateY(18px)',
      transition: 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
      zIndex: isCur ? 22 : 3,
      pointerEvents: 'none',
      background: theme.bg,
      borderRadius: 16,
      border: `1px solid ${isCur ? theme.accentBar + '88' : theme.borderColor}`,
      borderLeft: `5px solid ${theme.accentBar}`,
      boxShadow: isCur
        ? `0 0 36px ${theme.accentBar}40, 0 16px 48px rgba(0,0,0,0.85), 5px 0 0 ${theme.accentBar}28`
        : '0 4px 20px rgba(0,0,0,0.6)',
      backdropFilter: 'blur(24px)',
      overflow: 'hidden',
      padding: '18px 20px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}>

      {/* ── Tag row ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
        <span style={{ fontSize: 13 }}>{theme.icon}</span>
        <span style={{
          background: theme.tagBg,
          color: theme.tagText,
          fontSize: 8.5,
          fontWeight: 900,
          letterSpacing: '0.13em',
          textTransform: 'uppercase',
          padding: '2.5px 9px',
          borderRadius: 999,
          fontFamily: "'JetBrains Mono', 'Courier New', monospace",
        }}>
          {theme.label}
        </span>
        {isCur && (
          <div style={{
            marginLeft: 'auto',
            width: 6, height: 6, borderRadius: '50%',
            background: theme.accentBar,
            boxShadow: `0 0 8px ${theme.accentBar}`,
            animation: 'pulse 1.5s infinite',
          }} />
        )}
      </div>

      {/* ── Label / Title ── */}
      <div style={{
        color: isCur ? theme.labelColor : isPast ? '#4e6a82' : theme.labelColor + 'bb',
        fontSize: 13.5,
        fontWeight: 800,
        lineHeight: 1.3,
        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
        letterSpacing: '-0.01em',
        wordBreak: 'break-word',
        flexShrink: 0,
      }}>
        {node.label}
      </div>

      {/* ── Divider ── */}
      <div style={{
        height: 1,
        background: `linear-gradient(90deg, ${theme.accentBar}55, transparent)`,
        flexShrink: 0,
      }} />

      {/* ── Detail content — rendered differently per type ── */}
      {node.detail && (
        <div style={{
          flex: 1,
          overflow: 'hidden',
          opacity: isRev ? 1 : 0,
          transition: 'opacity 0.9s ease 0.15s',
        }}>

          {/* Q&A styled rendering */}
          {isQA && qaLines.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {qaLines.map((line, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  {line.type !== 'body' && (
                    <span style={{
                      color: line.type === 'q' ? '#fbbf24' : '#34d399',
                      fontWeight: 900,
                      fontSize: 11,
                      fontFamily: "'JetBrains Mono', monospace",
                      flexShrink: 0,
                      marginTop: 1,
                      minWidth: 16,
                    }}>
                      {line.type === 'q' ? 'Q:' : 'A:'}
                    </span>
                  )}
                  <span style={{
                    color: line.type === 'q'
                      ? (isCur ? '#fde68a' : '#7a6a40')
                      : line.type === 'a'
                        ? (isCur ? theme.detailColor : '#3a5a50')
                        : (isCur ? '#7a9bb8' : '#304558'),
                    fontSize: 11,
                    lineHeight: 1.55,
                    fontFamily: 'Inter, system-ui, sans-serif',
                    fontWeight: line.type === 'q' ? 700 : 450,
                    wordBreak: 'break-word',
                  }}>
                    {line.text}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Summary: bullet list */}
          {isSummary && summaryLines.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {summaryLines.map((line, i) => {
                const isBullet = line.trim().startsWith('•') || line.trim().startsWith('-') || line.trim().startsWith('*');
                const text = isBullet ? line.replace(/^[\s•\-\*]+/, '') : line;
                return (
                  <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                    {isBullet && (
                      <span style={{
                        color: theme.accentBar,
                        fontSize: 10,
                        flexShrink: 0,
                        marginTop: 3,
                      }}>▸</span>
                    )}
                    <span style={{
                      color: isCur ? theme.detailColor : '#3d6050',
                      fontSize: 11,
                      lineHeight: 1.5,
                      fontFamily: 'Inter, system-ui, sans-serif',
                      fontWeight: 450,
                      wordBreak: 'break-word',
                    }}>
                      {text}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Formula: monospace styled */}
          {isFormula && (
            <div style={{
              fontSize: 12,
              lineHeight: 1.8,
              fontWeight: 600,
              color: isCur ? '#fde68a' : '#6a5828',
              wordBreak: 'break-word',
            }}>
              {renderFormula(node.detail)}
            </div>
          )}

          {/* Definition / Insight / Note: plain flowing text */}
          {!isQA && !isSummary && !isFormula && (
            <div style={{
              color: isCur ? theme.detailColor : isPast ? '#2e4558' : theme.detailColor + '88',
              fontSize: 11.5,
              lineHeight: 1.65,
              fontFamily: 'Inter, system-ui, sans-serif',
              fontWeight: 450,
              wordBreak: 'break-word',
            }}>
              {node.detail}
            </div>
          )}
        </div>
      )}

      {/* Active glow bar */}
      {isCur && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
          background: `linear-gradient(90deg, transparent, ${theme.accentBar}, transparent)`,
          animation: 'shimmer 2s infinite',
        }} />
      )}

      {/* Ports */}
      <div style={{ position: 'absolute', top: -PORT_R, left: '50%', transform: 'translateX(-50%)', width: PORT_R * 2, height: PORT_R * 2, borderRadius: '50%', background: '#050d1a', border: `2px solid ${isRev ? theme.accentBar : 'rgba(71,85,105,0.3)'}`, zIndex: 2 }} />
      <div style={{ position: 'absolute', bottom: -PORT_R, left: '50%', transform: 'translateX(-50%)', width: PORT_R * 2, height: PORT_R * 2, borderRadius: '50%', background: '#050d1a', border: `2px solid ${isRev ? theme.accentBar : 'rgba(71,85,105,0.3)'}`, zIndex: 2 }} />
    </div>
  );
};

// ─── VisualNodeCard — image-first with text fallback ─────────────────────────

const VisualNodeCard: React.FC<CardProps> = ({
  node, pos, isRev, isCur, isPast, accent,
  focusOpacity = 1, focusMode = false,
}) => {
  const safePrompt = encodeURIComponent(
    (node.label ? node.label.replace(/[^a-zA-Z0-9\s]/g, '') : 'educational diagram') + ' educational illustration detailed'
  );
  const pollinationsUrl = `https://image.pollinations.ai/prompt/${safePrompt}?width=800&height=450&seed=${parseInt(node.id.replace(/\D/g, '').slice(0, 6) || '42', 10) % 9999}`;

  const cacheKey = node.imageUrl || `label:${node.label}`;
  const [imgSrc, setImgSrc] = useState<string>(imageCache.get(cacheKey) || node.imageUrl || pollinationsUrl);
  const [imgStatus, setImgStatus] = useState<'loading' | 'loaded' | 'error'>(imageCache.has(cacheKey) ? 'loaded' : 'loading');

  useEffect(() => {
    if (!imageCache.has(cacheKey)) {
      setImgStatus('loading');
      setImgSrc(node.imageUrl || pollinationsUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  useEffect(() => {
    const fetchWiki = async () => {
      if (imageCache.has(cacheKey)) return;
      if (node.imageUrl && node.imageUrl.length > 5 && !node.imageUrl.includes('pollinations')) {
        imageCache.set(cacheKey, node.imageUrl);
        return;
      }
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
          if (url) {
            imageCache.set(cacheKey, url);
            setImgSrc(url);
            setImgStatus('loading');
          }
        }
      } catch { /* keep fallback */ }
    };
    fetchWiki();
  }, [node.label, node.imageUrl, cacheKey]);

  const showImage = imgStatus !== 'error';
  const w = NODE_W;
  const h = NODE_H;

  return (
    <div style={{
      position: 'absolute',
      left: pos.x - w / 2,
      top: pos.y - h / 2,
      width: w,
      height: h,
      opacity: isRev ? (focusMode ? focusOpacity : isPast ? 0.8 : 0.95) : 0,
      transform: isRev ? 'scale(1) translateY(0)' : 'scale(0.82) translateY(32px)',
      transition: 'all 0.85s cubic-bezier(0.16, 1, 0.3, 1)',
      zIndex: isCur ? 20 : 2,
      pointerEvents: 'none',
      background: isCur
        ? `linear-gradient(180deg, ${accent}22 0%, rgba(5,13,26,0.98) 100%)`
        : isPast ? 'rgba(7,14,28,0.88)' : 'rgba(10,20,42,0.94)',
      borderRadius: 22,
      border: `1.5px solid ${isCur ? `${accent}aa` : isPast ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.09)'}`,
      borderTop: `3.5px solid ${isCur ? accent : isPast ? `${accent}33` : `${accent}55`}`,
      boxShadow: isCur
        ? `0 0 40px ${accent}45, 0 20px 56px rgba(0,0,0,0.9), 0 0 0 1px ${accent}22`
        : '0 6px 28px rgba(0,0,0,0.65)',
      backdropFilter: 'blur(24px)',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {showImage && (
        <div style={{ width: '100%', height: '50%', position: 'relative', flexShrink: 0, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.4)' }}>
          {imgStatus === 'loading' && (
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(90deg, rgba(15,25,50,0.9) 0%, rgba(35,50,90,0.6) 50%, rgba(15,25,50,0.9) 100%)',
              backgroundSize: '200% 100%',
              animation: 'imgShimmer 1.8s infinite',
            }} />
          )}
          <img
            src={imgSrc}
            alt={node.label}
            style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: imgStatus === 'loaded' ? 1 : 0, transition: 'opacity 0.6s ease' }}
            onLoad={() => setImgStatus('loaded')}
            onError={() => {
              if (imgSrc !== pollinationsUrl) {
                setImgSrc(pollinationsUrl);
              } else {
                setImgStatus('error');
              }
            }}
          />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 40, background: 'linear-gradient(to top, rgba(5,13,26,0.85), transparent)', pointerEvents: 'none' }} />
        </div>
      )}

      <div style={{ padding: showImage ? '14px 18px 16px' : '22px 20px', display: 'flex', flexDirection: 'column', flexGrow: 1, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          color: isCur ? '#f8fafc' : isPast ? '#94a3b8' : '#dde4ef',
          fontSize: showImage ? 14 : 16,
          fontWeight: 800,
          lineHeight: 1.35,
          textAlign: 'center',
          fontFamily: 'Inter, system-ui, sans-serif',
          letterSpacing: '-0.01em',
          wordBreak: 'break-word',
          textShadow: isCur ? '0 2px 6px rgba(0,0,0,0.6)' : 'none',
        }}>
          {node.label}
        </div>
        {node.detail && (
          <div style={{
            marginTop: 9,
            color: isCur ? '#cbd5e1' : isPast ? '#3f5468' : '#5c7a96',
            fontSize: showImage ? 11.5 : 13,
            fontWeight: 500,
            lineHeight: 1.55,
            textAlign: 'center',
            fontFamily: 'Inter, system-ui, sans-serif',
            opacity: isRev ? 1 : 0,
            transition: 'opacity 0.8s ease',
            maxHeight: showImage ? 72 : 130,
            overflow: 'hidden',
          }}>
            {node.detail}
          </div>
        )}
        {isCur && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, borderRadius: 3,
            background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
            animation: 'shimmer 2s infinite',
          }} />
        )}
      </div>

      <div style={{ position: 'absolute', top: -PORT_R, left: '50%', transform: 'translateX(-50%)', width: PORT_R * 2, height: PORT_R * 2, borderRadius: '50%', background: '#050d1a', border: `2px solid ${isRev ? accent : 'rgba(71,85,105,0.35)'}`, zIndex: 2 }} />
      <div style={{ position: 'absolute', bottom: -PORT_R, left: '50%', transform: 'translateX(-50%)', width: PORT_R * 2, height: PORT_R * 2, borderRadius: '50%', background: '#050d1a', border: `2px solid ${isRev ? accent : 'rgba(71,85,105,0.35)'}`, zIndex: 2 }} />
    </div>
  );
};

// ─── Legacy TeacherNode (explanation / example / formula) ────────────────────

const TEACHER_THEMES: Record<string, { bg: string; border: string; tag: string; tagText: string; icon: string; label: string }> = {
  explanation: { bg: 'linear-gradient(135deg, rgba(129,140,248,0.14), rgba(5,13,26,0.97))', border: '#818cf866', tag: 'rgba(129,140,248,0.2)', tagText: '#a5b4fc', icon: '💡', label: 'Concept' },
  example: { bg: 'linear-gradient(135deg, rgba(52,211,153,0.14), rgba(5,13,26,0.97))', border: '#34d39966', tag: 'rgba(52,211,153,0.2)', tagText: '#6ee7b7', icon: '🌍', label: 'Example' },
  formula: { bg: 'linear-gradient(135deg, rgba(251,191,36,0.14), rgba(5,13,26,0.97))', border: '#fbbf2466', tag: 'rgba(251,191,36,0.2)', tagText: '#fde68a', icon: '📐', label: 'Formula' },
};

const TeacherNode: React.FC<CardProps> = ({
  node, pos, isRev, isCur, isPast, accent,
  focusOpacity = 1, focusMode = false,
}) => {
  const theme = TEACHER_THEMES[node.nodeType || ''] ?? {
    bg: `linear-gradient(135deg, ${accent}14, rgba(5,13,26,0.97))`,
    border: `${accent}55`, tag: `${accent}22`, tagText: accent, icon: '📌', label: node.nodeType ?? 'Note',
  };
  const isFormula = node.nodeType === 'formula';
  const w = EXPLAIN_W;
  const h = EXPLAIN_H;

  return (
    <div style={{
      position: 'absolute',
      left: pos.x - w / 2,
      top: pos.y - h / 2,
      width: w,
      minHeight: h,
      opacity: isRev ? (focusMode ? focusOpacity : isPast ? 0.8 : 0.95) : 0,
      transform: isRev ? 'scale(1) translateY(0)' : 'scale(0.86) translateY(22px)',
      transition: 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
      zIndex: isCur ? 18 : 2,
      pointerEvents: 'none',
      background: theme.bg,
      borderRadius: 20,
      border: `1.5px solid ${theme.border}`,
      borderLeft: `5px solid ${isCur ? accent : theme.border}`,
      boxShadow: isCur
        ? `0 0 32px ${accent}35, 0 14px 44px rgba(0,0,0,0.8), 5px 0 0 ${accent}30`
        : '0 4px 22px rgba(0,0,0,0.6)',
      backdropFilter: 'blur(22px)',
      overflow: 'hidden',
      padding: '20px 22px 24px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 16 }}>{theme.icon}</span>
        <span style={{ background: theme.tag, color: theme.tagText, fontSize: 9, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '3px 10px', borderRadius: 999, fontFamily: 'Inter, system-ui, sans-serif' }}>
          {theme.label}
        </span>
      </div>
      <div style={{ color: isCur ? '#f1f5f9' : isPast ? '#8ba4be' : '#dde4ef', fontSize: 14, fontWeight: 800, lineHeight: 1.35, fontFamily: 'Inter, system-ui, sans-serif', letterSpacing: '-0.01em', marginBottom: 10, wordBreak: 'break-word' }}>
        {node.label}
      </div>
      {node.detail && (
        <div style={{ color: isCur ? '#cbd5e1' : isPast ? '#3a5069' : '#5a7a96', fontSize: isFormula ? 15 : 12.5, fontWeight: isFormula ? 700 : 450, lineHeight: isFormula ? 1.8 : 1.6, fontFamily: isFormula ? "'Courier New', monospace" : 'Inter, system-ui, sans-serif', opacity: isRev ? 1 : 0, transition: 'opacity 0.9s ease 0.2s', wordBreak: 'break-word' }}>
          {isFormula ? renderFormula(node.detail) : node.detail}
        </div>
      )}
      {isCur && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 3, borderRadius: 3, background: `linear-gradient(90deg, transparent, ${accent}, transparent)`, animation: 'shimmer 2s infinite' }} />
      )}
      <div style={{ position: 'absolute', top: -PORT_R, left: '50%', transform: 'translateX(-50%)', width: PORT_R * 2, height: PORT_R * 2, borderRadius: '50%', background: '#050d1a', border: `2px solid ${isRev ? accent : 'rgba(71,85,105,0.3)'}`, zIndex: 2 }} />
      <div style={{ position: 'absolute', bottom: -PORT_R, left: '50%', transform: 'translateX(-50%)', width: PORT_R * 2, height: PORT_R * 2, borderRadius: '50%', background: '#050d1a', border: `2px solid ${isRev ? accent : 'rgba(71,85,105,0.3)'}`, zIndex: 2 }} />
    </div>
  );
};

// ─── DecisionNode ─────────────────────────────────────────────────────────────

const DecisionNode: React.FC<CardProps> = ({
  node, pos, isRev, isCur, isPast, accent,
  focusOpacity = 1, focusMode = false,
}) => (
  <div style={{
    position: 'absolute', left: pos.x - NODE_W / 2, top: pos.y - NODE_H / 2, width: NODE_W, height: NODE_H,
    opacity: isRev ? (focusMode ? focusOpacity : isPast ? 0.8 : 0.95) : 0,
    transform: isRev ? 'translateY(0) scale(1)' : 'translateY(26px) scale(0.85)',
    transition: 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
    zIndex: isCur ? 20 : 1, pointerEvents: 'none',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }}>
    <div style={{ position: 'absolute', top: -PORT_R, left: '50%', transform: 'translateX(-50%)', width: PORT_R * 2, height: PORT_R * 2, borderRadius: '50%', background: '#050d1a', border: `2px solid ${isRev ? accent : 'rgba(71,85,105,0.4)'}`, zIndex: 2 }} />
    <div style={{
      position: 'absolute', width: NODE_H * 1.1, height: NODE_H * 1.1,
      background: isCur ? `linear-gradient(135deg, ${accent}32, rgba(8,16,32,0.96))` : isPast ? 'rgba(8,16,30,0.85)' : 'rgba(10,20,40,0.95)',
      border: `1.5px solid ${isCur ? accent : isPast ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.1)'}`,
      transform: 'rotate(45deg)', borderRadius: 12,
      boxShadow: isCur ? `0 0 28px ${accent}45, 0 10px 36px rgba(0,0,0,0.7)` : '0 4px 18px rgba(0,0,0,0.55)',
      transition: 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
    }} />
    <div style={{ position: 'relative', zIndex: 10, textAlign: 'center', padding: 14 }}>
      <div style={{ color: isCur ? '#f8fafc' : isPast ? '#5a7a96' : '#94a3b8', fontSize: 12, fontWeight: 800, lineHeight: 1.35, letterSpacing: '0.02em', wordBreak: 'break-word' }}>
        {node.label}
      </div>
    </div>
    <div style={{ position: 'absolute', bottom: -PORT_R, left: '50%', transform: 'translateX(-50%)', width: PORT_R * 2, height: PORT_R * 2, borderRadius: '50%', background: '#050d1a', border: `2px solid ${isRev ? accent : 'rgba(71,85,105,0.4)'}`, zIndex: 2 }} />
  </div>
);

// ─── Node Dispatcher — routes each nodeType to the correct renderer ───────────

const NodeDispatcher: React.FC<CardProps> = (props) => {
  const { node } = props;
  const nt = node.nodeType;

  // 1. Emoji annotation
  if (nt === 'emoji') {
    const { pos, isRev, isCur, isPast, accent, focusOpacity = 1, focusMode = false } = props;
    const emojiOpacity = focusMode ? (isCur ? 1 : 0.4) : (isRev ? (isCur ? 1 : isPast ? 0.6 : 0.9) : 0);
    return (
      <div style={{
        position: 'absolute', left: pos.x - 60, top: pos.y - 52, textAlign: 'center', width: 120,
        opacity: emojiOpacity,
        transform: isRev ? 'scale(1)' : 'scale(0.6) translateY(20px)',
        transition: 'all 0.7s cubic-bezier(0.16, 1, 0.3, 1)',
        pointerEvents: 'none',
      }}>
        <div style={{ fontSize: 50, lineHeight: 1, filter: isCur ? `drop-shadow(0 0 16px ${accent}cc)` : 'none' }}>
          {node.emojiContent}
        </div>
        {node.label && (
          <div style={{ marginTop: 7, color: isCur ? '#e2e8f0' : '#4a6580', fontSize: 10, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
            {node.label}
          </div>
        )}
      </div>
    );
  }

  // 2. Decision diamond
  if (nt === 'decision') return <DecisionNode {...props} />;

  // 3. NEW: Rich text nodes from groqservice
  if (nt && RICH_TEXT_TYPES.has(nt)) return <RichTextNode {...props} />;

  // 4. Legacy teacher nodes (backward compat)
  if (nt && LEGACY_TEACHER_TYPES.has(nt)) return <TeacherNode {...props} />;

  // 5. Default: image-first visual card (input, output, process, flow, image, etc.)
  return <VisualNodeCard {...props} />;
};

// ─── Main StoryboardCanvas Component ─────────────────────────────────────────

const StoryboardCanvas: React.FC<Props> = ({
  nodes, edges,
  currentStepIndex, relativeTime, stepDurations,
  stepTitles = [],
  stepNarratives = [],
  highlightedIds = new Set(),
  isSpeaking = false,
  onFocusModeChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1200, h: 700 });
  const mouseMoveTimer = useRef<ReturnType<typeof setTimeout>>(setTimeout(() => { }, 0));
  const [focusMode, setFocusMode] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(e => {
      const r = e[0]?.contentRect;
      if (r) setSize({ w: r.width, h: r.height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (isSpeaking) {
      const t = setTimeout(() => { setFocusMode(true); onFocusModeChange?.(true); }, 1200);
      return () => clearTimeout(t);
    } else {
      setFocusMode(false);
      onFocusModeChange?.(false);
    }
  }, [isSpeaking, onFocusModeChange]);

  const handleMouseActivity = useCallback(() => {
    if (focusMode) {
      setFocusMode(false);
      onFocusModeChange?.(false);
      clearTimeout(mouseMoveTimer.current);
      if (isSpeaking) {
        mouseMoveTimer.current = setTimeout(() => {
          setFocusMode(true);
          onFocusModeChange?.(true);
        }, 4000);
      }
    }
  }, [focusMode, isSpeaking, onFocusModeChange]);

  const layout = useMemo(() => computeGraphLayout(nodes, edges), [nodes, edges]);

  // ── Reveal timing ─────────────────────────────────────────────────────────
  const revealed = useMemo(() => {
    const s = new Set<string>();
    nodes.forEach(n => {
      if (n.stepIndex < currentStepIndex) {
        s.add(n.id);
      } else if (n.stepIndex === currentStepIndex) {
        const dur = stepDurations[currentStepIndex] ?? 20;
        const at = n.totalInStep <= 1 ? 0 : (n.indexInStep / n.totalInStep) * dur * 0.78;
        if (relativeTime >= at) s.add(n.id);
      }
    });
    return s;
  }, [nodes, currentStepIndex, relativeTime, stepDurations]);

  // ── Active node ───────────────────────────────────────────────────────────
  const activeId = useMemo(() => {
    return nodes
      .filter(n => n.stepIndex === currentStepIndex && revealed.has(n.id))
      .sort((a, b) => b.indexInStep - a.indexInStep)[0]?.id ?? null;
  }, [nodes, currentStepIndex, revealed]);

  // ── Connected node IDs ────────────────────────────────────────────────────
  const connectedIds = useMemo(() => {
    if (!activeId) return new Set<string>();
    const s = new Set<string>();
    edges.forEach(e => {
      if (e.from === activeId) s.add(e.to);
      if (e.to === activeId) s.add(e.from);
    });
    return s;
  }, [activeId, edges]);

  // ── Camera ────────────────────────────────────────────────────────────────
  const [camX, setCamX] = useState(0);
  const [camY, setCamY] = useState(0);
  const [camZoom, setCamZoom] = useState(0.68);
  const [isManual, setIsManual] = useState(false);
  const isDragging = useRef(false);
  const lastPtr = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (isManual) return;
    const stepNodes = nodes.filter(n => n.stepIndex === currentStepIndex);
    if (!stepNodes.length) return;

    if (focusMode && activeId) {
      const ap = layout.posMap[activeId];
      if (ap) {
        const z = Math.min(Math.max(Math.min(size.w / (NODE_W * 3.4), size.h / (NODE_H * 3.4)), 0.85), 1.8);
        setCamX(size.w / 2 - ap.x * z);
        setCamY(size.h / 2 - ap.y * z);
        setCamZoom(z);
      }
    } else {
      const pts = stepNodes.map(n => ({ p: layout.posMap[n.id] || { x: CX, y: START_Y }, sz: nodeSize(n.nodeType) }));
      const minX = Math.min(...pts.map(p => p.p.x - p.sz.w / 2));
      const maxX = Math.max(...pts.map(p => p.p.x + p.sz.w / 2));
      const minY = Math.min(...pts.map(p => p.p.y - p.sz.h / 2));
      const maxY = Math.max(...pts.map(p => p.p.y + p.sz.h / 2));
      const padX = 80;
      const padY = 80;
      let z = Math.min((size.w - padX * 2) / Math.max(maxX - minX, 1), (size.h - padY * 2) / Math.max(maxY - minY, 1), 1.2);
      z = Math.max(z, 0.28);
      setCamX(size.w / 2 - ((minX + maxX) / 2) * z);
      setCamY(size.h / 2 - ((minY + maxY) / 2) * z);
      setCamZoom(z);
    }
  }, [currentStepIndex, activeId, focusMode, layout, size, isManual, nodes]);

  const handlePointerDown = (e: React.PointerEvent) => {
    isDragging.current = true;
    lastPtr.current = { x: e.clientX, y: e.clientY };
    setIsManual(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    handleMouseActivity();
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
    handleMouseActivity();
    setCamZoom(z => Math.max(0.15, Math.min(2.8, z - e.deltaY * 0.0014)));
    setIsManual(true);
  };

  const cameraStr = `translate(${camX}px, ${camY}px) scale(${camZoom})`;

  // ── Edge paths ────────────────────────────────────────────────────────────
  const edgePaths = useMemo(() => {
    const map = new Map(nodes.map(n => [n.id, n]));
    return edges.map(e => {
      const fn = map.get(e.from);
      const tn = map.get(e.to);
      if (!fn || !tn) return null;
      const fp = layout.posMap[fn.id];
      const tp = layout.posMap[tn.id];
      if (!fp || !tp) return null;
      const fs = nodeSize(fn.nodeType);
      const ts = nodeSize(tn.nodeType);
      const d = bezierPath(fp.x, fp.y, tp.x, tp.y, fs.h, ts.h, fs.w, ts.w);
      const vis = revealed.has(e.from) && revealed.has(e.to);
      const isConnected = e.from === activeId || e.to === activeId;
      return { id: e.id, d, lx: (fp.x + tp.x) / 2, ly: (fp.y + tp.y) / 2 - 14, label: e.label, vis, si: fn.stepIndex, isConnected };
    }).filter(Boolean) as { id: string; d: string; lx: number; ly: number; label?: string; vis: boolean; si: number; isConnected: boolean }[];
  }, [nodes, edges, revealed, layout, activeId]);

  const stepCount = stepDurations.length;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden select-none"
      style={{
        background: 'radial-gradient(ellipse at 50% 12%, #0d1e38 0%, #050d1a 60%, #020810 100%)',
        touchAction: 'none',
        cursor: isManual ? (isDragging.current ? 'grabbing' : 'grab') : 'default',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onWheel={handleWheel}
      onMouseMove={handleMouseActivity}
    >
      {/* Dot grid */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'radial-gradient(circle, rgba(148,163,184,0.14) 1px, transparent 1px)',
        backgroundSize: '32px 32px',
        opacity: focusMode ? 0.4 : 1,
        transition: 'opacity 1s ease',
      }} />

      {/* Focus mode vignette */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(2,6,14,0.7) 100%)',
        opacity: focusMode ? 1 : 0,
        transition: 'opacity 1.2s ease', zIndex: 1,
      }} />

      {/* Focus mode badge */}
      {focusMode && (
        <div style={{
          position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(129,140,248,0.15)', border: '1px solid rgba(129,140,248,0.4)',
          padding: '6px 18px', borderRadius: 999, zIndex: 55,
          display: 'flex', alignItems: 'center', gap: 7,
          backdropFilter: 'blur(16px)', animation: 'fadeInDown 0.4s ease',
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#818cf8', animation: 'pulse 1.5s infinite' }} />
          <span style={{ color: '#a5b4fc', fontSize: 10, fontWeight: 900, letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: 'Inter, system-ui, sans-serif' }}>
            Focus Mode
          </span>
        </div>
      )}

      {/* Reset view button */}
      {isManual && (
        <button
          onClick={() => setIsManual(false)}
          style={{
            position: 'absolute', bottom: 90, right: 24, zIndex: 55,
            padding: '8px 16px', background: 'rgba(99,102,241,0.2)',
            border: '1px solid rgba(99,102,241,0.5)', borderRadius: 999,
            color: '#a5b4fc', fontSize: 10, fontWeight: 900,
            letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer',
            backdropFilter: 'blur(12px)', transition: 'all 0.2s',
          }}
        >
          ⟳ Reset View
        </button>
      )}

      {/* ── Virtual canvas ── */}
      <div style={{
        position: 'absolute', width: CANVAS_W, height: CANVAS_H,
        transform: cameraStr, transformOrigin: '0 0',
        transition: isDragging.current ? 'none' : 'transform 0.7s cubic-bezier(0.16, 1, 0.3, 1)',
        willChange: 'transform',
      }}>
        {/* SVG Edges */}
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
          <defs>
            {ACCENTS.map((color, i) => (
              <marker key={i} id={`arr-${i}`} markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
                <circle cx="4.5" cy="4.5" r="3" fill={color} />
              </marker>
            ))}
          </defs>
          {edgePaths.map(ep => {
            const color = ACCENTS[ep.si % ACCENTS.length];
            const edgeOpacity = focusMode
              ? (ep.isConnected ? 0.8 : 0.3)
              : (ep.vis ? 1 : 0);
            return (
              <g key={ep.id} style={{ opacity: edgeOpacity, transition: 'opacity 0.8s ease' }}>
                <path d={ep.d} fill="none" stroke={color} strokeWidth="7" strokeOpacity="0.07" strokeLinecap="round" />
                <path d={ep.d} fill="none" stroke={color} strokeWidth={ep.isConnected && focusMode ? 2.5 : 1.8} strokeOpacity={ep.isConnected && focusMode ? 0.9 : 0.65} strokeLinecap="round" markerEnd={`url(#arr-${ep.si % ACCENTS.length})`} />
              </g>
            );
          })}
        </svg>

        {/* Edge labels */}
        {edgePaths.map(ep => {
          if (!ep.label || !ep.vis) return null;
          const color = ACCENTS[ep.si % ACCENTS.length];
          const edgeOpacity = focusMode ? (ep.isConnected ? 0.9 : 0.3) : 0.95;
          return (
            <div key={`lbl-${ep.id}`} style={{
              position: 'absolute', left: ep.lx, top: ep.ly, transform: 'translate(-50%, -50%)',
              background: '#070f20', border: `1px solid ${color}44`, color,
              fontSize: 10.5, fontWeight: 700, padding: '3px 11px', borderRadius: 14,
              opacity: edgeOpacity, pointerEvents: 'none', whiteSpace: 'nowrap',
              fontFamily: 'Inter, system-ui, sans-serif',
              boxShadow: '0 2px 10px rgba(0,0,0,0.6)', zIndex: 10,
              transition: 'opacity 0.6s ease',
            }}>
              {ep.label}
            </div>
          );
        })}

        {/* Nodes — all dispatched through NodeDispatcher */}
        {nodes.map(node => {
          const pos = layout.posMap[node.id] || { x: CX, y: START_Y };
          const isRev = revealed.has(node.id);
          const isCur = node.id === activeId;
          const isPast = node.stepIndex < currentStepIndex;
          const accent = ACCENTS[node.stepIndex % ACCENTS.length];
          const isConnected = connectedIds.has(node.id);

          let focusOpacity = 1;
          if (focusMode && isRev) {
            focusOpacity = isCur ? 1 : isConnected ? 0.85 : 0.55;
          }

          const stepHeader = (node.indexInStep === 0 && stepTitles[node.stepIndex])
            ? renderStepHeader(node, stepTitles, layout, currentStepIndex, isRev, accent, focusMode)
            : null;

          return (
            <React.Fragment key={node.id}>
              {stepHeader}
              <NodeDispatcher
                node={node}
                pos={pos}
                isRev={isRev}
                isCur={isCur}
                isPast={isPast}
                accent={accent}
                focusScale={1}
                focusOpacity={focusOpacity}
                focusMode={focusMode}
              />
            </React.Fragment>
          );
        })}
      </div>

      {/* Step progress pills */}
      {stepCount > 1 && !focusMode && (
        <div style={{ position: 'absolute', top: 18, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6, zIndex: 30 }}>
          {Array.from({ length: stepCount }).map((_, i) => {
            const c = ACCENTS[i % ACCENTS.length];
            return (
              <div key={i} style={{
                width: i === currentStepIndex ? 28 : 8, height: 8, borderRadius: 4,
                background: i <= currentStepIndex ? c : 'rgba(255,255,255,0.1)',
                opacity: i === currentStepIndex ? 1 : i < currentStepIndex ? 0.65 : 0.2,
                transition: 'all 0.5s cubic-bezier(0.16, 1, 0.3, 1)',
              }} />
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes shimmer { 0%,100% { opacity:0.32; transform:scaleX(0.28); } 50% { opacity:1; transform:scaleX(1); } }
        @keyframes imgShimmer { 0%,100% { background-position:-200% center; } 50% { background-position:200% center; } }
        @keyframes fadeInDown { from { opacity:0; transform:translate(-50%,-8px); } to { opacity:1; transform:translate(-50%,0); } }
        @keyframes pulse { 0%,100% { opacity:0.5; transform:scale(1); } 50% { opacity:1; transform:scale(1.4); } }
      `}</style>
    </div>
  );
};

// ─── Step header helper ───────────────────────────────────────────────────────

function renderStepHeader(node: CanvasNode, stepTitles: string[], layout: LayoutData, currentStepIndex: number, isRev: boolean, accent: string, focusMode: boolean) {
  const stepY = layout.stepStart[node.stepIndex] ?? START_Y;
  const stepTitle = stepTitles[node.stepIndex];
  if (!stepTitle) return null;
  return (
    <div style={{
      position: 'absolute', left: CX - 260, top: stepY - 80,
      display: 'flex', alignItems: 'center', gap: 12,
      opacity: node.stepIndex <= currentStepIndex && isRev && !focusMode ? 1 : 0,
      transition: 'opacity 0.7s ease', pointerEvents: 'none', zIndex: 20,
    }}>
      <div style={{ width: 9, height: 9, borderRadius: '50%', background: accent, boxShadow: `0 0 10px ${accent}` }} />
      <span style={{ color: accent, fontSize: 11.5, fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', fontFamily: 'Inter, system-ui, sans-serif' }}>
        {stepTitle}
      </span>
      <div style={{ height: 1, width: 120, background: `linear-gradient(90deg, ${accent}55, transparent)` }} />
    </div>
  );
}

export default StoryboardCanvas;