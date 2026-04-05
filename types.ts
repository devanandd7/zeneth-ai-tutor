
export enum ActionType {
  DRAW = 'draw',
  HIGHLIGHT = 'highlight',
  TEXT = 'text',
  VOICE = 'voice'
}

export interface DiagramElement {
  id: string;
  type: 'emoji' | 'arrow';
  content?: string;
  label?: string;
  sublabel?: string;
  x: number;
  y: number;
  rotation?: number;
  imageUrl?: string;
  imageType?: 'generated' | 'search' | 'local';
}

export interface TimelineEvent {
  time: number;
  action: ActionType;
  element?: DiagramElement;
  target?: string;
  speed?: number;
}

// ─── Rich Visualization Types ────────────────────────────────────────────────

export type VisualizationType = 'mermaid' | 'katex' | 'code' | 'chart' | 'emoji' | 'markdown' | 'flow' | 'comparison';

export type TopicType = 'math' | 'code' | 'history' | 'comparison' | 'concept';

export interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
}

export interface ChartData {
  chartType: 'bar' | 'line' | 'pie' | 'area';
  title?: string;
  labels: string[];
  datasets: { name: string; values: number[]; color?: string }[];
}

export interface CodeData {
  language: string;
  code: string;
  title?: string;
  caption?: string;
}

export interface FlowNode {
  id: string;
  label: string;
  detail?: string;
  x?: number;
  y?: number;
  type?: string;
  nodeType?: 'input' | 'process' | 'decision' | 'output' | 'data' | string;
  color?: string;
  imageUrl?: string;
  imageType?: 'generated' | 'search' | 'local';
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  animated?: boolean;
}

export interface FlowData {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface Visualization {
  type: VisualizationType;
  /** mermaid string | katex string | CodeData | ChartData | FlowData | markdown string */
  data: string | ChartData | CodeData | FlowData;
  flowData?: FlowData;
}

// ─── Core Tutorial Step ──────────────────────────────────────────────────────

export interface TutorialStep {
  title: string;
  narrative: string;
  duration: number;
  timeline: TimelineEvent[];
  audioUrl?: string;
  visualization?: Visualization;
}

export interface TutorState {
  currentTime: number;
  currentStepIndex: number;
  isPlaying: boolean;
  playbackSpeed: number;
}
