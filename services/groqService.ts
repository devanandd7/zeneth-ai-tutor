import { TutorialStep } from "../types";

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

const SYSTEM_PROMPT = `You are an expert AI teacher. For any topic, generate a 3-part micro-lecture.

Each part must include:
- title: short title for the section
- narrative: teacher's spoken explanation (2-3 sentences, clear and engaging)
- duration: seconds (10-18)
- timeline: array of timed events for the emoji whiteboard
- visualization: an auto-selected rich visual for this concept

VISUALIZATION SELECTION RULES (choose the best fit):
1. Math/Physics/Formulas → type: "katex", data: "latex_formula_string" (e.g. "c = \\\\sqrt{a^2 + b^2}")
2. Programming/Code → type: "code", data: { language, code, title }
3. System/Process diagrams → type: "mermaid", data: "mermaid_diagram_string"
4. Data/Comparisons/Stats → type: "chart", data: { chartType: "bar"|"line"|"area", labels:[], datasets:[{name, values:[], color}] }
5. Networks/Trees/Graphs → type: "flow", data: { nodes:[{id, label}], edges:[{id, source, target, label}] }
6. Simple concepts → type: "emoji" (use whiteboard timeline only)

TIMELINE ACTIONS: "draw" (add emoji element), "highlight" (glow element), "voice" (start narration at time 0)
TIMELINE ELEMENTS: { id, type:"emoji"|"arrow", content:"🔥", label:"Label text", x:0-100, y:0-100, rotation:0 }

Return ONLY a valid JSON object with a single key "steps" containing an array of 3 TutorialStep objects.
Do not include any markdown formatting or backticks.`;

function parseSteps(raw: string): TutorialStep[] {
  const cleaned = raw.replace(/^```json[\r\n]*/mi, '').replace(/```$/mi, '').trim();
  let parsed = JSON.parse(cleaned);

  // Unwrap wrapper keys like { steps: [...] } or { tutorial: [...] } etc.
  if (!Array.isArray(parsed)) {
    const arrayVal = Object.values(parsed).find(Array.isArray) as any[];
    parsed = arrayVal ?? [parsed];
  }

  // Safety validation
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("Empty steps");
  if (!parsed[0].timeline) throw new Error("No timeline in step");
  if (typeof parsed[0].duration !== 'number') {
    parsed = parsed.map((s: any) => ({ ...s, duration: s.duration ?? 15 }));
  }

  return parsed as TutorialStep[];
}

export const generateTutorialForTopic = async (topic: string): Promise<TutorialStep[]> => {
  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Create a 3-part micro-lecture on: "${topic}"` }
      ],
      temperature: 0.6,
      max_tokens: 4096,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq API error ${response.status}: ${err}`);
  }

  const data = await response.json();
  const rawText = data.choices?.[0]?.message?.content ?? "{}";
  return parseSteps(rawText);
};

export const askTutorWithVisuals = async (question: string, context: string) => {
  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: `You are an AI teacher with a whiteboard. Answer the question concisely within the given context.
Also provide 2-3 visual emojis for the whiteboard.
Return ONLY a JSON object: { "text": "your explanation", "visuals": [{ "id": "v1", "type": "emoji", "content": "🍎", "label": "Label", "x": 50, "y": 50 }] }`
          },
          {
            role: "user",
            content: `Context: "${context}"\nQuestion: "${question}"`
          }
        ],
        temperature: 0.6,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) throw new Error(`Groq ${response.status}`);
    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content ?? "{}";
    const cleaned = raw.replace(/^```json[\r\n]*/mi, '').replace(/```$/mi, '').trim();
    return JSON.parse(cleaned);
  } catch (error) {
    console.error("Groq Chat Error:", error);
    return { text: "I hit a small snag. Let me try explaining that again.", visuals: [] };
  }
};
