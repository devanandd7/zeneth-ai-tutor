
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
}

export interface TimelineEvent {
  time: number;
  action: ActionType;
  element?: DiagramElement;
  target?: string;
  speed?: number;
}

// ─── Rich Visualization Types ────────────────────────────────────────────────

export type VisualizationType = 'mermaid' | 'katex' | 'code' | 'chart' | 'flow' | 'emoji' | 'markdown';

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
}

export interface FlowNode {
  id: string;
  label: string;
  x?: number;
  y?: number;
  type?: string;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface FlowData {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface Visualization {
  type: VisualizationType;
  /** mermaid string | katex string | CodeData | ChartData | FlowData | markdown string */
  data: string | ChartData | CodeData | FlowData;
}

// ─── Core Tutorial Step ──────────────────────────────────────────────────────

export interface TutorialStep {
  title: string;
  narrative: string;
  duration: number;
  timeline: TimelineEvent[];
  visualization?: Visualization;
}

export interface TutorState {
  currentTime: number;
  currentStepIndex: number;
  isPlaying: boolean;
  playbackSpeed: number;
}
