import { TutorialStep, FlowData } from '../types';

// ─── Layout constants (mirrors StoryboardCanvas logic) ────────────────────────
const NW = 200;     // node width
const NH = 64;      // node height
const COL_GAP = 280;
const ROW_GAP = 150;
const STEP_GAP = 110;
const MAX_COLS = 3;
const CX = 900;     // canvas center X
const START_Y = 80;
const ACCENTS = ['#818cf8', '#34d399', '#fb7185', '#fbbf24', '#60a5fa', '#a78bfa'];

interface LayoutNode {
  id: string;
  label: string;
  x: number;
  y: number;
  stepIndex: number;
  accent: string;
  nodeType?: string;
  imageUrl?: string;
}

function buildLayout(steps: TutorialStep[]): { nodes: LayoutNode[]; edges: { from: string; to: string; label?: string; si: number }[]; totalH: number } {
  const layoutNodes: LayoutNode[] = [];
  const layoutEdges: { from: string; to: string; label?: string; si: number }[] = [];
  const posMap = new Map<string, { x: number; y: number }>();
  let y = START_Y;

  steps.forEach((step, si) => {
    const vis = step.visualization;
    const snodes: any[] = [];
    const sedges: any[] = [];
    
    if (vis && vis.type === 'flow') {
      const data = vis.data as FlowData;
      if (data.nodes) snodes.push(...data.nodes);
      if (data.edges) sedges.push(...data.edges);
    }
    
    if (vis && vis.flowData) {
      if (vis.flowData.nodes) snodes.push(...vis.flowData.nodes);
      if (vis.flowData.edges) sedges.push(...vis.flowData.edges);
    }
    
    if (step.timeline) {
      step.timeline.forEach((event: any) => {
        if (event.action === 'draw' && event.element && (event.element.type === 'emoji' || !event.element.type)) {
          snodes.push({
            ...event.element,
            nodeType: 'emoji',
            // Prepend the emoji to the label so it shows nicely in the exported block
            label: event.element.content ? `${event.element.content} ${event.element.label || ''}` : event.element.label || ''
          });
        }
      });
    }

    const total = snodes.length;
    if (total === 0) {
      y += STEP_GAP;
      return;
    }
    
    const rows = Math.ceil(total / MAX_COLS);
    const accent = ACCENTS[si % ACCENTS.length];

    snodes.forEach((n, idx) => {
      const col = idx % MAX_COLS;
      const row = Math.floor(idx / MAX_COLS);
      const inRow = Math.min(MAX_COLS, total - row * MAX_COLS);
      const rowW = (inRow - 1) * COL_GAP;
      const nx = CX - rowW / 2 + col * COL_GAP;
      const ny = y + row * ROW_GAP;
      
      const uniqueId = `step${si}-${n.id}`;
      
      layoutNodes.push({ 
        id: uniqueId, 
        label: n.label || '', 
        x: nx, 
        y: ny, 
        stepIndex: si, 
        accent,
        nodeType: n.nodeType,
        imageUrl: n.imageUrl
      });
      posMap.set(uniqueId, { x: nx, y: ny });
    });

    sedges.forEach(e => {
       const uFrom = `step${si}-${e.source}`;
       const uTo = `step${si}-${e.target}`;
       layoutEdges.push({ from: uFrom, to: uTo, label: e.label, si });
    });

    y += rows * ROW_GAP + STEP_GAP;
  });

  return { nodes: layoutNodes, edges: layoutEdges, totalH: y + 60 };
}

function svgBezier(fx: number, fy: number, tx: number, ty: number): string {
  const dx = Math.abs(tx - fx);
  const dy = Math.abs(ty - fy);
  if (dy >= dx) {
    const sy = fy + NH / 2 + 4;
    const ey = ty - NH / 2 - 4;
    const mid = (sy + ey) / 2;
    return `M ${fx},${sy} C ${fx},${mid} ${tx},${mid} ${tx},${ey}`;
  } else {
    const sx = fx + NW / 2 + 4;
    const ex = tx - NW / 2 - 4;
    const mid = (sx + ex) / 2;
    return `M ${sx},${fy} C ${mid},${fy} ${mid},${ty} ${ex},${ty}`;
  }
}

function buildSVG(steps: TutorialStep[]): { svg: string; height: number } {
  const { nodes, edges, totalH } = buildLayout(steps);
  const posMap = new Map(nodes.map(n => [n.id, { x: n.x, y: n.y }]));
  const W = 1800;

  const edgeSVG = edges.map(e => {
    const fp = posMap.get(e.from);
    const tp = posMap.get(e.to);
    if (!fp || !tp) return '';
    const d = svgBezier(fp.x, fp.y, tp.x, tp.y);
    const color = ACCENTS[e.si % ACCENTS.length];
    const lx = (fp.x + tp.x) / 2;
    const ly = (fp.y + tp.y) / 2 - 10;
    return `
      <path d="${d}" fill="none" stroke="${color}" stroke-width="1.5" stroke-opacity="0.65" stroke-linecap="round"/>
      ${e.label ? `<text x="${lx}" y="${ly}" text-anchor="middle" font-size="11" font-weight="700" fill="${color}" font-family="Inter,sans-serif" opacity="0.85">${e.label}</text>` : ''}
    `;
  }).join('');

  const nodeSVG = nodes.map(n => {
    // ── EMOJI NODE RENDERING ──
    if (n.nodeType === 'emoji') {
      const emojiChar = n.label.split(' ')[0] || '✨';
      const labelText = n.label.split(' ').slice(1).join(' ');
      return `
        <text x="${n.x}" y="${n.y - 10}" text-anchor="middle" font-size="32">${emojiChar}</text>
        <text x="${n.x}" y="${n.y + 16}" text-anchor="middle" font-size="10" font-weight="700" fill="#64748b" font-family="Inter,sans-serif">${labelText}</text>
      `;
    }

    const bx = n.x - NW / 2;
    const by = n.y - NH / 2;
    // Truncate long labels
    const maxChars = 28;
    const lines: string[] = [];
    const words = n.label.split(' ');
    let cur = '';
    words.forEach(w => {
      if ((cur + ' ' + w).trim().length > maxChars) { lines.push(cur.trim()); cur = w; }
      else cur = (cur + ' ' + w).trim();
    });
    if (cur) lines.push(cur);
    const lineH = 16;
    const totalTH = lines.length * lineH;
    const textStartY = n.y - totalTH / 2 + lineH / 2;
    const isImage = n.nodeType === 'image';
    if (isImage && n.imageUrl) {
      const imgW = 220;
      const imgH = 124; // 16:9
      const ix = n.x - imgW / 2;
      const iy = n.y - imgH / 2;
      return `
        <rect x="${ix}" y="${iy}" width="${imgW}" height="${imgH}" rx="12" ry="12" fill="#0a1428" stroke="${n.accent}" stroke-width="2" filter="url(#shadow)"/>
        <clipPath id="clip-${n.id}">
          <rect x="${ix}" y="${iy}" width="${imgW}" height="${imgH}" rx="12" ry="12"/>
        </clipPath>
        <image x="${ix}" y="${iy}" width="${imgW}" height="${imgH}" href="${n.imageUrl}" preserveAspectRatio="xMidYMid slice" clip-path="url(#clip-${n.id})"/>
        <rect x="${ix}" y="${iy + imgH - 24}" width="${imgW}" height="24" rx="0" fill="rgba(0,0,0,0.6)" clip-path="url(#clip-${n.id})"/>
        <text x="${n.x}" y="${iy + imgH - 8}" text-anchor="middle" font-size="9" font-weight="700" fill="#fff" font-family="Inter,sans-serif">${n.label}</text>
      `;
    }

    return `
      <rect x="${bx}" y="${by}" width="${NW}" height="${NH}" rx="10" ry="10"
        fill="#0a1428" stroke="${n.accent}" stroke-width="2" stroke-opacity="0.7"
        filter="url(#shadow)"/>
      <rect x="${bx}" y="${by}" width="${NW}" height="3" rx="1.5" fill="${n.accent}" opacity="0.9"/>
      <circle cx="${n.x}" cy="${by}" r="4" fill="#050d1a" stroke="${n.accent}" stroke-width="1.5"/>
      <circle cx="${n.x}" cy="${by + NH}" r="4" fill="#050d1a" stroke="${n.accent}" stroke-width="1.5"/>
      ${lines.map((ln, i) => `<text x="${n.x}" y="${textStartY + i * lineH + 2}" text-anchor="middle" font-size="11.5" font-weight="600" fill="#e2e8f0" font-family="Inter,sans-serif">${ln}</text>`).join('')}
    `;
  }).join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${totalH}" width="${W}" height="${totalH}">
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="rgba(0,0,0,0.5)"/>
    </filter>
    <pattern id="dots" width="28" height="28" patternUnits="userSpaceOnUse">
      <circle cx="14" cy="14" r="1" fill="rgba(148,163,184,0.2)"/>
    </pattern>
  </defs>
  <rect width="${W}" height="${totalH}" fill="#050d1a"/>
  <rect width="${W}" height="${totalH}" fill="url(#dots)"/>
  ${edgeSVG}
  ${nodeSVG}
</svg>`;
  return { svg, height: totalH };
}

// ─── Main Export Function ─────────────────────────────────────────────────────

// Helper to pre-fetch Wikipedia thumbnails for deterministic export
async function fetchWikiImage(label: string): Promise<string | null> {
  try {
    const term = encodeURIComponent(label.replace(/[^\w\s]/g, '').trim());
    const res = await fetch(`https://en.wikipedia.org/w/api.php?action=query&origin=*&format=json&generator=search&gsrnamespace=0&gsrlimit=1&gsrsearch=${term}&prop=pageimages&piprop=thumbnail&pithumbsize=800`);
    if (!res.ok) return null;
    const data = await res.json();
    const pages = data?.query?.pages;
    if (pages) {
      const pageId = Object.keys(pages)[0];
      const url = pages[pageId]?.thumbnail?.source;
      if (url) return url;
    }
  } catch (e) {
    return null;
  }
  return null;
}

export async function exportTutorialAsHTML(steps: TutorialStep[], topic: string): Promise<void> {
  // Create a deep copy of steps to mutate with actual image URLs
  const exportSteps = JSON.parse(JSON.stringify(steps)) as TutorialStep[];
  
  // Resolve ALL images sequentially using the same logic as the UI component
  for (const step of exportSteps) {
    const nodes = step.visualization?.flowData?.nodes || [];
    for (const n of nodes) {
      if (n.nodeType === 'image') {
        const fallBackProm = encodeURIComponent((n.label ? n.label.replace(/[^a-zA-Z0-9\s]/g, '') : 'educational diagram') + ' detailed illustration');
        const pollinationsUrl = `https://image.pollinations.ai/prompt/${fallBackProm}?width=800&height=450&nologo=true`;
        
        // Match StoryboardCanvas skip logic
        if (n.imageUrl && n.imageUrl.length > 5 && !n.imageUrl.includes('pollinations')) {
           continue; // explicitly non-pollinations url defined by AI
        }
        
        const wikiImg = await fetchWikiImage(n.label || topic);
        if (wikiImg) {
          n.imageUrl = wikiImg;
        } else {
          n.imageUrl = pollinationsUrl;
        }
      }
    }
  }
  
  const { svg } = buildSVG(exportSteps);

function parseMarkdownBasic(text: string): string {
  if (!text) return '';
  // Convert basic markdown to HTML for the export, carefully preserving math syntax
  let html = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\\)\*(.*?)(?<!\\)\*/g, '<em>$1</em>') // bold/italic without breaking times symbols if pos
    .replace(/\n\n/g, '</p><p class="step-narrative">');
    
  // Handle basic bullet points
  html = html.replace(/(?:\n|^)[-\*]\s+(.*)/g, '<li style="margin-left: 20px; list-style-type: disc;">$1</li>');
  html = html.replace(/(<li.*<\/li>)/s, '<ul style="margin: 10px 0;">$1</ul>');
  
  // replace remaining newlines with <br/>, avoiding replacing inside $$ blocks if possible, 
  // but for simple export <br/> won't break Katex display mode if handled well.
  html = html.replace(/\n/g, '<br/>');
  return html;
}

  const stepsHTML = steps.map((step, i) => {
    const accent = ACCENTS[i % ACCENTS.length];
    
    let visHTML = '';
    if (step.visualization && step.visualization.type === 'katex') {
      visHTML = `<div class="katex-vis-block" style="margin-top: 16px; padding: 16px; background: rgba(0,0,0,0.2); border-left: 4px solid ${accent}; border-radius: 8px;">
        ${parseMarkdownBasic(step.visualization.data as string)}
      </div>`;
    }
    
    return `
    <div class="step-card">
      <div class="step-header">
        <div class="step-dot" style="background:${accent};box-shadow:0 0 8px ${accent}"></div>
        <span class="step-num" style="color:${accent}">Part ${i + 1}</span>
        <h3 class="step-title">${step.title}</h3>
        <span class="step-dur">${step.duration}s</span>
      </div>
      <p class="step-narrative">${parseMarkdownBasic(step.narrative)}</p>
      ${visHTML}
    </div>`;
  }).join('');

  const totalDur = steps.reduce((s, st) => s + st.duration, 0);
  const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${topic} — Zenith AI Lesson</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.css">
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/katex.min.js"></script>
  <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.8/dist/contrib/auto-render.min.js" onload="renderMathInElement(document.body, {delimiters:[{left:'$$',right:'$$',display:true},{left:'$',right:'$',display:false}]});"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root { --bg: #050d1a; --surface: #0a1428; --border: rgba(255,255,255,0.09); --text: #e2e8f0; --muted: #64748b; }

    body { background: var(--bg); color: var(--text); font-family: 'Inter', sans-serif; min-height: 100vh; }

    .page { max-width: 960px; margin: 0 auto; padding: 48px 24px 80px; }

    /* Header */
    .header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 40px; padding-bottom: 28px; border-bottom: 1px solid var(--border); }
    .logo { display: flex; align-items: center; gap: 12px; }
    .logo-icon { width: 44px; height: 44px; border-radius: 50%; background: linear-gradient(135deg,#6366f1,#06b6d4); display: flex; align-items: center; justify-content: center; font-size: 22px; }
    .logo-text { font-size: 13px; font-weight: 800; color: var(--muted); letter-spacing: 0.1em; text-transform: uppercase; }
    .meta { text-align: right; font-size: 12px; color: var(--muted); }

    .topic-title { font-size: 32px; font-weight: 900; letter-spacing: -0.02em; line-height: 1.2; margin-bottom: 8px; background: linear-gradient(135deg,#f1f5f9,#94a3b8); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .topic-sub { font-size: 14px; color: var(--muted); font-weight: 500; margin-bottom: 36px; }

    /* Stats row */
    .stats { display: flex; gap: 16px; margin-bottom: 44px; }
    .stat { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 16px 22px; flex: 1; }
    .stat-val { font-size: 24px; font-weight: 900; color: #f1f5f9; }
    .stat-label { font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; margin-top: 4px; }

    /* Section label */
    .section-label { font-size: 11px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); margin-bottom: 16px; display: flex; align-items: center; gap: 10px; }
    .section-label::after { content: ''; flex: 1; height: 1px; background: var(--border); }

    /* Step cards */
    .steps { display: flex; flex-direction: column; gap: 16px; margin-bottom: 48px; }
    .step-card { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 22px 24px; }
    .step-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
    .step-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .step-num { font-size: 10.5px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; }
    .step-title { font-size: 15px; font-weight: 800; color: #f1f5f9; flex: 1; }
    .step-dur { font-size: 11px; color: var(--muted); font-weight: 600; background: rgba(255,255,255,0.05); padding: 3px 10px; border-radius: 20px; }
    .step-narrative { font-size: 14px; line-height: 1.75; color: #94a3b8; font-weight: 400; }

    /* Diagram */
    .diagram-wrap { background: #050d1a; border: 1px solid var(--border); border-radius: 20px; overflow: hidden; margin-bottom: 48px; }
    .diagram-wrap svg { display: block; width: 100%; height: auto; }

    /* Footer */
    .footer { font-size: 12px; color: var(--muted); text-align: center; padding-top: 24px; border-top: 1px solid var(--border); }

    /* Print button (hidden in PDF) */
    .print-btn { position: fixed; bottom: 28px; right: 28px; background: linear-gradient(135deg,#6366f1,#818cf8); color: white; border: none; border-radius: 50px; padding: 14px 28px; font-size: 14px; font-weight: 800; cursor: pointer; box-shadow: 0 8px 32px rgba(99,102,241,0.4); font-family: 'Inter',sans-serif; letter-spacing: -0.01em; display: flex; align-items: center; gap: 8px; transition: transform 0.2s; }
    .print-btn:hover { transform: translateY(-2px); }

    /* Print styles */
    @media print {
      .print-btn { display: none !important; }
      body { background: white; color: #1e293b; }
      :root { --bg: white; --surface: #f8fafc; --border: #e2e8f0; --text: #1e293b; --muted: #64748b; }
      .topic-title { -webkit-text-fill-color: #1e293b; color: #1e293b; }
      .stat-val { color: #1e293b; }
      .step-title { color: #1e293b; }
      .diagram-wrap { background: #f8fafc; }
      .page { padding: 24px; }
    }
  </style>
</head>
<body>
  <div class="page">

    <div class="header">
      <div>
        <div class="logo" style="margin-bottom:12px">
          <div class="logo-icon">🧠</div>
          <div class="logo-text">Zenith AI Tutor</div>
        </div>
        <h1 class="topic-title">${topic}</h1>
        <p class="topic-sub">AI-generated lesson export</p>
      </div>
      <div class="meta">
        <div style="margin-bottom:4px">${now}</div>
        <div>${steps.length} parts · ${totalDur}s total</div>
      </div>
    </div>

    <div class="stats">
      <div class="stat">
        <div class="stat-val">${steps.length}</div>
        <div class="stat-label">Lesson Parts</div>
      </div>
      <div class="stat">
        <div class="stat-val">${totalDur}s</div>
        <div class="stat-label">Total Duration</div>
      </div>
      <div class="stat">
        <div class="stat-val">${steps.reduce((s, st) => { const vis = st.visualization; if (vis?.type === 'flow') { const d = vis.data as any; return s + (d.nodes?.length || 0); } return s; }, 0)}</div>
        <div class="stat-label">Concept Nodes</div>
      </div>
      <div class="stat">
        <div class="stat-val">${steps.reduce((s, st) => s + st.narrative.split(' ').length, 0)}</div>
        <div class="stat-label">Words of Explanation</div>
      </div>
    </div>

    <div class="section-label">Lesson Narrative</div>
    <div class="steps">${stepsHTML}</div>

    <div class="section-label">Concept Diagram</div>
    <div class="diagram-wrap">${svg}</div>

    <div class="footer">
      Generated by Zenith AI Tutor on ${now}. Topic: "${topic}"
    </div>

  </div>

  <button class="print-btn" onclick="window.print()">
    🖨️ Save as PDF
  </button>
</body>
</html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${topic.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_zenith_lesson.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
