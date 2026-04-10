import {
  TutorialStep,
  TopicType,
  Visualization,
  ChatMessage,
} from '../types';

// ─── Config ───────────────────────────────────────────────────────────────────
const GROQ_API_KEY = (import.meta as any).env?.VITE_GROQ_API_KEY || process.env.GROQ_API_KEY || '';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';
const MAX_RETRIES = 2;

// ─── Language Detector ───────────────────────────────────────────────────────
const HINGLISH_WORDS = new Set([
  'kya', 'kaise', 'kyun', 'kyunki', 'kaun', 'kahan', 'kitna', 'kitne',
  'hota', 'hoti', 'hote', 'hain', 'hoga', 'hogi', 'hoge',
  'karo', 'kare', 'karta', 'karti', 'karte',
  'batao', 'bata', 'sikhna', 'sikhao', 'samjhao', 'samajh',
  'dekho', 'jano', 'chahiye', 'milta', 'milti', 'milte',
  'aur', 'toh', 'bhi', 'nahi', 'nhi',
  'mein', 'agar', 'lekin', 'phir', 'isliye', 'kyonki',
  'yeh', 'woh', 'hum', 'aap', 'iska', 'uska', 'mera', 'tera', 'apna',
  'accha', 'acha', 'bahut', 'zyada', 'jyada', 'abhi', 'pehle',
  'dono', 'kuch', 'matlab', 'yani', 'asaan', 'mushkil',
]);

export const detectInputLanguage = (text: string): 'hi' | 'en' => {
  const lower = text.toLowerCase().trim();
  const devanagariMatches = (text.match(/[\u0900-\u097F]/g) || []).length;
  const totalNonSpace = text.replace(/\s/g, '').length;
  if (totalNonSpace > 0 && (devanagariMatches / totalNonSpace) > 0.15) return 'hi';
  const words = lower.split(/[\s,!?\.]+/).filter(w => w.length > 1);
  if (words.length === 0) return 'en';
  const hinglishCount = words.filter(w => HINGLISH_WORDS.has(w)).length;
  if (words.length <= 8 && hinglishCount >= 1) return 'hi';
  if (hinglishCount / words.length >= 0.25) return 'hi';
  return 'en';
};

const getLanguageInstructions = (lang: 'hi' | 'en'): string => {
  if (lang === 'hi') {
    return `
━━━ LANGUAGE MODE: HINDI + ENGLISH (BILINGUAL / HINGLISH) ━━━
You MUST write ALL narrative text in a natural Hindi+English mix (Hinglish), just like a real passionate Indian teacher on YouTube speaks.
STRICT RULES:
1. Narratives MUST be in simple conversational Hindi (Devanagari) + technical terms stay in English.
2. Node LABELS in flowData: keep short English terms. Node DETAIL fields: write in Hindi.
3. Step TITLES: always in English (for UI display).
4. Use Indian examples: Zomato, Paytm, IRCTC, Swiggy, JioCinema, ISRO, Flipkart. Use ₹ not $.
5. Tone: energetic, warm, slightly casual.
6. NEVER write pure formal Hindi. Always use the mix Indians naturally speak.
TEXT NODE CONTENT (in Hindi+English mix):
- definition nodes: Hindi mein definition + English technical terms
- insight nodes: "Key insight यह है कि..." format
- summary nodes: "इस step में humne seekha:" format
- example nodes: Real Indian examples with actual numbers in ₹
`;
  }
  return `
━━━ LANGUAGE MODE: ENGLISH ━━━
Write all narrative text and node content in clear, engaging English. Use Indian examples where relatable (₹, Zomato, ISRO, etc.).
`;
};

// ─── Topic Classifier ─────────────────────────────────────────────────────────
const TOPIC_KEYWORDS: Record<TopicType, string[]> = {
  math: [
    'equation', 'formula', 'calculus', 'algebra', 'geometry', 'probability',
    'integral', 'derivative', 'matrix', 'statistics', 'theorem', 'proof',
    'trigonometry', 'logarithm', 'polynomial', 'vector', 'determinant',
    'eigenvalue', 'fourier', 'laplace', 'differentiation', 'integration',
    'chemistry', 'physics', 'biology', 'chemical', 'reaction', 'molecule',
    'velocity', 'force', 'energy', 'kinetic', 'thermodynamics', 'gravity',
    'photosynthesis', 'mitosis', 'osmosis', 'enzyme', 'dna', 'rna', 'cell',
    'acid', 'base', 'oxidation', 'reduction', 'titration', 'catalyst',
  ],
  code: [
    'programming', 'algorithm', 'function', 'code', 'python', 'javascript',
    'typescript', 'java', 'c++', 'c#', 'rust', 'golang', 'swift', 'kotlin',
    'data structure', 'sorting', 'recursion', 'array', 'linked list', 'tree',
    'graph', 'binary', 'complexity', 'api', 'class', 'object', 'loop',
    'variable', 'compiler', 'if else', 'if-else', 'conditional', 'switch',
    'for loop', 'while loop', 'do while', 'pointer', 'stack', 'queue',
    'hashmap', 'heap', 'dynamic programming', 'greedy', 'backtracking',
    'dfs', 'bfs', 'binary search', 'merge sort', 'quick sort', 'bubble sort',
    'insertion sort', 'selection sort', 'fibonacci', 'factorial', 'palindrome',
    'string', 'regex', 'database', 'sql', 'nosql', 'rest', 'graphql',
    'react', 'vue', 'angular', 'node', 'express', 'django', 'flask',
    'oop', 'polymorphism', 'inheritance', 'encapsulation', 'abstraction',
    'design pattern', 'singleton', 'factory', 'observer', 'decorator',
    'async', 'await', 'promise', 'callback', 'thread', 'concurrency',
    'mutex', 'semaphore', 'deadlock', 'big o', 'time complexity', 'space complexity',
  ],
  history: [
    'history', 'war', 'century', 'revolution', 'empire', 'ancient', 'medieval',
    'civilization', 'timeline', 'event', 'battle', 'movement', 'dynasty',
    'treaty', 'independence', 'colonial', 'renaissance', 'reformation',
    'industrial revolution', 'world war', 'cold war', 'partition',
  ],
  comparison: [
    'vs', 'versus', 'difference between', 'compare', 'better', 'pros cons',
    'advantages', 'disadvantages', 'which is', 'contrast', 'similarity',
  ],
  concept: [],
};

export const detectTopicType = (topic: string): TopicType => {
  const lower = topic.toLowerCase();
  for (const [type, keywords] of Object.entries(TOPIC_KEYWORDS) as [TopicType, string[]][]) {
    if (type === 'concept') continue;
    if (keywords.some(k => lower.includes(k))) return type;
  }
  return 'concept';
};

// ─── TEXT NODE RULES (CORE ADDITION) ──────────────────────────────────────────
/**
 * These are the mandatory TEXT NODE types that must appear in every flowchart.
 * They carry written content INSIDE the diagram — not outside it.
 * 
 * TEXT NODE TYPES:
 * - "definition"  → Full definition of the concept, 2-4 sentences
 * - "insight"     → Key insight with explanation (NOT just a label/icon)
 * - "note"        → Important warning, tip, or rule the student must remember
 * - "summary"     → Mini-summary of what was explained so far
 * - "qa"          → A question + its answer (for problem-solving steps)
 * - "formula_text"→ Formula written in plain text with variable explanations
 * - "explanation" → Deep explanation of a single concept node
 * - "example"     → Concrete example with real values/names
 */

const TEXT_NODE_RULES = `
━━━ TEXT NODES INSIDE DIAGRAM — MANDATORY RULES ━━━

CRITICAL: Every flowchart MUST have a BALANCED MIX of diagram nodes AND text nodes.
Target: ~50% visual/process nodes, ~50% text content nodes.

TEXT NODE TYPES (use these nodeType values):
1. "definition"   → Must contain: full definition (3-5 sentences), what it is, what it does
2. "insight"      → Must contain: the "aha!" explanation (3-4 sentences), NOT just a label
3. "note"         → Must contain: a specific warning/rule/tip with explanation (2-3 sentences)
4. "summary"      → Must contain: bullet list of 3-4 points summarizing what was explained
5. "qa"           → Must contain: "Q: [question]\\nA: [detailed answer]" format
6. "formula_text" → Must contain: formula + each variable explained line by line
7. "example"      → Must contain: real example with actual values, step-by-step result

DETAIL FIELD RULES FOR TEXT NODES:
- MINIMUM 30 words in the "detail" field for any text node
- NEVER write just a label like "Key Insight" with no explanation
- NEVER write just an emoji with no text
- Write the actual insight, definition, or explanation as a full sentence

EXAMPLE OF CORRECT TEXT NODES:
{ 
  "id": "def1", 
  "label": "📖 Definition", 
  "detail": "An if-else statement is a conditional control structure that evaluates a boolean expression. If the condition is TRUE, the first block executes. If FALSE, the else block runs. It is the most fundamental decision-making tool in every programming language — every app you use runs millions of these per second.", 
  "nodeType": "definition", 
  "color": "#1E40AF" 
}

{
  "id": "ins1",
  "label": "💡 Key Insight: Why This Matters",
  "detail": "The critical insight is that if-else evaluates exactly once and takes exactly ONE path — never both. This means O(1) time complexity regardless of input size. Beginners often think the code 'checks both paths' — it does NOT. Once the condition is evaluated, the other branch is completely skipped by the CPU.",
  "nodeType": "insight",
  "color": "#7C3AED"
}

{
  "id": "note1",
  "label": "⚠️ Common Mistake",
  "detail": "The most common error is using = (assignment) instead of == (comparison) inside the condition. Writing if(x = 5) assigns 5 to x and always evaluates to true. Always use == for comparison or === in JavaScript for strict equality. Python raises a SyntaxError for this, but JavaScript and C silently accept it — a dangerous bug.",
  "nodeType": "note",
  "color": "#DC2626"
}

{
  "id": "sum1",
  "label": "📋 Step Summary",
  "detail": "• if-else is a decision structure that chooses between two code paths\\n• The condition must return true or false (boolean)\\n• Only ONE branch executes — never both\\n• elif allows chaining multiple conditions\\n• Time complexity is always O(1) — constant regardless of input",
  "nodeType": "summary",
  "color": "#065F46"
}

{
  "id": "qa1",
  "label": "❓ Q&A: What if both conditions are true?",
  "detail": "Q: What happens if I write if(x > 5) and elif(x > 3) and x = 7?\\nA: Only the FIRST matching branch executes. Since x > 5 is true and comes first, that block runs and Python skips the elif entirely — even though x > 3 is also true. Order matters in if-elif chains. Always put the most specific condition first.",
  "nodeType": "qa",
  "color": "#92400E"
}

POSITIONING TEXT NODES IN THE FLOW:
- Place "definition" node EARLY in the flow (after start / image node)
- Place "insight" nodes AFTER the main process nodes they explain
- Place "note" nodes connected to the node they warn about
- Place "summary" nodes at the END of the main flow
- Place "qa" nodes as BRANCHES off the relevant process node
- Text nodes CAN be standalone (not on main path) — connected as side branches
- Use edge label "defines" for definition connections
- Use edge label "insight" for insight connections  
- Use edge label "warns" for note connections
- Use edge label "summarizes" for summary connections
- Use edge label "Q&A" for qa connections

MANDATORY MINIMUMS PER STEP:
- At least 1 "definition" node
- At least 1 "insight" node  
- At least 1 "note" OR "qa" node
- At least 1 "summary" node (last step: make it comprehensive)
- At least 2 "example" nodes with actual real-world values
- Plus the standard process/decision/input/output nodes for the flow
- TOTAL: minimum 10 nodes per step (5 process/flow + 5 text content)
`;

// ─── Domain-Specific Thinker Instructions ─────────────────────────────────────
const getDomainIntelligence = (type: TopicType, topic: string): string => {

  if (type === 'code') {
    return `
━━━ YOU ARE IN CODING TUTOR MODE ━━━
Topic: "${topic}"

${TEXT_NODE_RULES}

🧠 THINKER PROTOCOL FOR CODE:
Think step-by-step: "What is the LOGIC FLOW?" + "What TEXT needs to live INSIDE the diagram?"

CONTENT FLOW PATTERN (alternate text and diagram nodes):
1. [IMAGE node] → visual anchor
2. [DEFINITION node] → "What is ${topic}? Full definition with context"
3. [INPUT node] → Program Start
4. [INSIGHT node] → "Why does this work this way? The key insight is..."
5. [PROCESS node] → Core logic step
6. [EXAMPLE node] → Real-world example with actual values
7. [DECISION node] → Conditional branch (if applicable)
8. [NOTE node] → Common mistake or warning
9. [PROCESS/OUTPUT nodes] → Result branches
10. [QA node] → "Q: [likely student question] A: [clear answer]"
11. [SUMMARY node] → Bullet list recap

MANDATORY FLOWCHART RULES FOR CODE:
- EVERY coding topic MUST have minimum 10 nodes (5 flow + 5 text)
- For if-else/conditionals: decision diamond + YES/NO branches + definition + insight + note
- For loops: iteration cycle + definition + insight about loop complexity + note about infinite loops
- For functions: input→process→return + definition + insight about scope + example with values
- For algorithms: each step + definition + complexity insight + example with actual input/output

EXAMPLE COMPLETE FLOWCHART FOR "if-else statement":
{
  "nodes": [
    { "id": "img1", "label": "if-else Decision Making", "detail": "Visual: code decision branching", "nodeType": "image", "imageUrl": "https://image.pollinations.ai/prompt/if-else+decision+tree+programming+flowchart+educational?width=1024&height=576&nologo=true", "color": "#818CF8" },
    { "id": "def1", "label": "📖 What is if-else?", "detail": "An if-else statement is a conditional control structure that evaluates a boolean expression (true/false). When the condition is TRUE, the first block of code executes. When FALSE, the else block runs instead. It is the most fundamental decision-making tool in programming — used in every app from Instagram to banking software to make choices automatically based on data.", "nodeType": "definition", "color": "#1E40AF" },
    { "id": "n1", "label": "🟢 Program Start", "detail": "Execution begins here", "nodeType": "input", "color": "#3B82F6" },
    { "id": "n2", "label": "📥 Read Variable / Input", "detail": "e.g., score = 85", "nodeType": "process", "color": "#6366F1" },
    { "id": "ins1", "label": "💡 Key Insight: One Path Only", "detail": "The critical insight about if-else: the computer ALWAYS takes exactly ONE path — never both. When the condition is evaluated, the CPU jumps directly to either the if-block or the else-block and skips the other entirely. This is why if-else has O(1) time complexity — it does not matter how many elif branches you have, only one executes.", "nodeType": "insight", "color": "#7C3AED" },
    { "id": "n3", "label": "🔶 Condition True?", "detail": "Evaluate: if (score >= 90)", "nodeType": "decision", "color": "#F59E0B" },
    { "id": "n4", "label": "✅ Execute IF Block", "detail": "print('Grade A')", "nodeType": "process", "color": "#10B981" },
    { "id": "n5", "label": "❌ Execute ELSE Block", "detail": "print('Grade B or lower')", "nodeType": "process", "color": "#EF4444" },
    { "id": "ex1", "label": "🌍 Real Example: Paytm PIN", "detail": "In Paytm's login system:\\ncorrect_pin = 1234\\nif entered_pin == correct_pin:\\n    show_dashboard()  # runs if correct\\nelse:\\n    show_error_message()  # runs if wrong\\nThis exact pattern runs every time you log into any app. Millions of these checks happen per second across all apps.", "nodeType": "example", "color": "#34D399" },
    { "id": "note1", "label": "⚠️ Most Common Mistake", "detail": "Using = instead of == in the condition is the #1 beginner error. Writing if(x = 5) ASSIGNS 5 to x and always evaluates to True — your condition never actually checks anything. In Python this is a SyntaxError. In JavaScript/C it silently succeeds, causing a very hard-to-find bug. Always use == for comparison, === in JS for strict type+value check.", "nodeType": "note", "color": "#DC2626" },
    { "id": "n6", "label": "🏁 Continue Execution", "detail": "Program moves past the if-else", "nodeType": "output", "color": "#8B5CF6" },
    { "id": "qa1", "label": "❓ Q: What about elif?", "detail": "Q: How is elif different from writing multiple if statements?\\nA: elif chains are SHORT-CIRCUIT evaluated — as soon as one condition is true, all remaining elif and else blocks are SKIPPED. Multiple separate if statements each get evaluated independently even if one already matched. Use elif when options are mutually exclusive (grades A/B/C/F). Use separate ifs when multiple conditions can independently be true (e.g., checking multiple permissions).", "nodeType": "qa", "color": "#92400E" },
    { "id": "sum1", "label": "📋 Summary: if-else", "detail": "• if-else evaluates a boolean condition exactly once\\n• Only ONE branch executes — never both simultaneously\\n• elif allows chaining multiple mutually exclusive conditions\\n• else is the fallback — runs when ALL above conditions are false\\n• Time complexity: O(1) — constant, regardless of number of elif branches\\n• Most common bug: = instead of == in the condition", "nodeType": "summary", "color": "#065F46" }
  ],
  "edges": [
    { "id": "e0", "source": "img1", "target": "def1", "label": "introduces", "animated": true },
    { "id": "e1", "source": "def1", "target": "n1", "label": "start", "animated": true },
    { "id": "e2", "source": "n1", "target": "n2", "label": "read", "animated": true },
    { "id": "e3", "source": "n2", "target": "ins1", "label": "insight", "animated": false },
    { "id": "e4", "source": "n2", "target": "n3", "label": "evaluate", "animated": true },
    { "id": "e5", "source": "n3", "target": "n4", "label": "YES ✓", "animated": true },
    { "id": "e6", "source": "n3", "target": "n5", "label": "NO ✗", "animated": false },
    { "id": "e7", "source": "n4", "target": "ex1", "label": "example", "animated": false },
    { "id": "e8", "source": "n5", "target": "note1", "label": "warns", "animated": false },
    { "id": "e9", "source": "n4", "target": "n6", "label": "done", "animated": true },
    { "id": "e10", "source": "n5", "target": "n6", "label": "done", "animated": true },
    { "id": "e11", "source": "n3", "target": "qa1", "label": "Q&A", "animated": false },
    { "id": "e12", "source": "n6", "target": "sum1", "label": "summarizes", "animated": false }
  ]
}

MANDATORY CODE VISUALIZATION RULES:
- visualization.type MUST be "code"
- ALWAYS include working, runnable code in visualization.data.code
- Code must be Python unless topic specifies another language
- Include inline comments explaining EACH section
- Show 2 examples: a simple one + a real-world one (e.g., ATM PIN check)

CAPTION FIELD REQUIREMENTS (visualization.data.caption):
Must include ALL these sections in Markdown:
1. **❓ Problem Statement** — What exact problem does this solve? (2 sentences)
2. **📖 Definition** — Plain English definition (3 sentences)
3. **✨ Key Features** — 5 bullet points with actual explanations (not just labels)
4. **✅ Pros** — 3 bullets with WHY each is an advantage
5. **❌ Common Pitfalls** — 3 bullets describing the mistake AND what goes wrong
6. **⚙️ Complexity** — Time AND Space complexity with explanation of WHY
7. **🌍 Where Used** — 3 real apps/companies with specific use case
`;
  }

  if (type === 'math') {
    return `
━━━ YOU ARE IN MATH/SCIENCE TUTOR MODE ━━━
Topic: "${topic}"

${TEXT_NODE_RULES}

🧠 THINKER PROTOCOL FOR MATH/SCIENCE:
Think: "What is the PROCESS FLOW?" + "What definitions, formulas, and insights must live inside the diagram?"

CONTENT FLOW PATTERN:
1. [IMAGE node] → visual anchor
2. [DEFINITION node] → "What is this concept? Full scientific/mathematical definition"
3. [INPUT node] → Given values / Starting conditions
4. [FORMULA_TEXT node] → The formula with EACH variable explained
5. [INSIGHT node] → "Why does this formula work? What's the physical/mathematical meaning?"
6. [PROCESS nodes] → Step-by-step calculation or lifecycle stages
7. [EXAMPLE node] → Worked example with actual numbers from start to finish
8. [NOTE node] → Units, edge cases, or common errors
9. [OUTPUT node] → Final result / Answer
10. [QA node] → Common student question + full answer
11. [SUMMARY node] → Complete bullet recap

MANDATORY FLOWCHART FOR MATH/SCIENCE (minimum 10 nodes):
- For Chemistry: reactants definition + reaction steps + formula with variables + product
- For Physics: given values + formula_text node with each variable + substitution + answer
- For Biology cycles: each phase + definition + insight about why each phase matters
- For Pure Math: hypothesis + each proof step + insight about the technique + conclusion

EXAMPLE FORMULA_TEXT NODE for "Quadratic Formula":
{
  "id": "f1",
  "label": "📐 The Quadratic Formula",
  "detail": "x = (-b ± √(b² - 4ac)) / 2a\\n\\nWhere:\\n• a = coefficient of x² (CANNOT be 0 — if a=0, it's not quadratic)\\n• b = coefficient of x (the middle term)\\n• c = constant term (no variable)\\n• ± means we compute TWO values: one with + and one with -\\n• The term b²-4ac is called the DISCRIMINANT — it tells us HOW MANY solutions exist",
  "nodeType": "formula_text",
  "color": "#FBBF24"
}

MANDATORY FORMULA/SCIENCE RULES:
- visualization.type MUST be "katex" for math/chemistry/physics
- ALWAYS include actual formulas using KaTeX syntax
- Break down EVERY variable with units and meaning
- Show a COMPLETE worked example with actual numbers (not just "substitute values")
`;
  }

  if (type === 'comparison') {
    return `
━━━ YOU ARE IN COMPARISON/CONTRAST TUTOR MODE ━━━
Topic: "${topic}"

${TEXT_NODE_RULES}

🧠 THINKER PROTOCOL FOR COMPARISONS:
Build a clear mental model. BOTH sides need definition + insight + example nodes.

CONTENT FLOW PATTERN:
1. [IMAGE node]
2. [DEFINITION node for Option A] → Full definition
3. [DEFINITION node for Option B] → Full definition  
4. [ROOT node] → The comparison question
5. [Process branches for A and B]
6. [INSIGHT node] → "The KEY difference that matters most in practice is..."
7. [EXAMPLE node A] → Real use case with numbers
8. [EXAMPLE node B] → Real use case with numbers
9. [NOTE node] → Common misconception about when to use each
10. [SUMMARY node] → Clear recommendation table as bullet list

MANDATORY CONTENT:
- visualization.type = "markdown"
- Build a detailed comparison TABLE in markdown
- Show real-world examples for each option with specifics
- Give a clear "WHEN TO USE" recommendation with reasoning
`;
  }

  // Default: concept / history
  return `
━━━ YOU ARE IN CONCEPT EXPLAINER MODE ━━━
Topic: "${topic}"

${TEXT_NODE_RULES}

🧠 THINKER PROTOCOL FOR CONCEPTS:
Map the concept as a FLOW OF IDEAS with rich text nodes woven throughout.

CONTENT FLOW PATTERN:
1. [IMAGE node] → visual anchor
2. [DEFINITION node] → "What exactly is this? 4-5 sentence definition"
3. [INPUT/START node] → The concept entry point
4. [INSIGHT node] → "The key insight most people miss is..."
5. [PROCESS nodes] → Components, stages, or causal chain
6. [EXAMPLE node] → Highly specific real-world example with numbers
7. [NOTE node] → Common misconception or important caveat
8. [PROCESS node] → Application or real-world impact
9. [QA node] → Likely student question + detailed answer
10. [OUTPUT node] → Outcome / Impact
11. [SUMMARY node] → 4-bullet comprehensive recap

MANDATORY: visualization.type = "markdown"
The "data" field must be a rich Markdown string with ALL these sections:
1. **📖 Definition** — 3-4 sentences, plain English
2. An embedded image: ![Topic](https://image.pollinations.ai/prompt/...)
3. **🔑 Key Principles** — 4 bullets, each with a full explanation sentence
4. **🌍 Real-World Example** — Specific example with actual numbers/names
5. **⚠️ Common Misconception** — What people get wrong and the correct understanding
6. **💡 Why It Matters** — Impact and application in the real world
`;
};

// ─── System Prompt Builder ────────────────────────────────────────────────────
const buildSystemPrompt = (topicType: TopicType, topic: string, lang: 'hi' | 'en' = 'en'): string => `
You are a world-class professor who teaches like a combination of Richard Feynman (clarity + curiosity) and a senior software engineer/scientist (technical depth). Your goal: every student walks away saying "I FINALLY understand this!"

━━━ CORE PHILOSOPHY: 50% DIAGRAM + 50% TEXT ━━━
This is the MOST IMPORTANT RULE. Every flowchart must be a balanced combination of:
- DIAGRAM NODES: process, decision, input, output, image (the visual flow)
- TEXT NODES: definition, insight, note, summary, qa, formula_text, example (the written content)

Text nodes are NOT decorations — they ARE the lesson. They carry the definitions, key insights, worked examples, warnings, and summaries INSIDE the diagram itself. Every diagram must teach through both its structure AND its written content.

━━━ IMAGE NODE MANDATE ━━━
- Every step MUST have one node with nodeType: "image"
- imageUrl format: "https://image.pollinations.ai/prompt/{descriptive_prompt}?width=1024&height=576&nologo=true"
- Connect image node to the definition node or start node

━━━ MARKDOWN IMAGE MANDATE ━━━
- Every Markdown caption/data string MUST embed at least one image
- Format: ![Description](https://image.pollinations.ai/prompt/topic+educational+diagram?width=600&height=338&nologo=true)

${getLanguageInstructions(lang)}

${getDomainIntelligence(topicType, topic)}

━━━ TEACHING STRUCTURE (MANDATORY for EVERY step) ━━━
Each step's narrative MUST follow this exact pattern:

1. 🎣 HOOK — Surprising fact, provocative question, or mini-story (2 sentences)
2. 🧠 CONCEPT — Core idea in plain language, zero unexplained jargon (3-4 sentences)
3. 🌍 EXAMPLE — CONCRETE, specific real-world example with actual values/names (3 sentences)
4. 🔁 ANALOGY — "Think of it like..." comparison to something universally familiar (2 sentences)
5. 📌 KEY POINTS — 3 specific bullet points (not vague labels — full sentences)
6. 💎 TAKEAWAY — ONE crisp sentence the student must remember
7. 📊 SUMMARY (LAST STEP ONLY) — 4 bullet points capturing the entire lesson

━━━ NARRATIVE RULES ━━━
- MINIMUM 8 sentences per step narrative
- Every step: at least one real-world example with specific names/numbers
- Use Indian examples: ₹500 not "some money", Netflix not "a company", Swiggy not "a food app"
- LAST STEP: Append "### 📚 Full Summary" with 4 comprehensive bullet points

━━━ EDGE RULES ━━━
- Every node MUST have at least 1 incoming OR outgoing edge
- Text nodes connect as BRANCHES off the main flow (not just floating)
- Use meaningful edge labels: "defines", "insight", "warns", "Q&A", "summarizes", "example", "YES ✓", "NO ✗"
- animated: true on main critical path; animated: false on text branch connections

━━━ TIMELINE EMOJI RULES ━━━
Include 3-4 floating emoji annotations per step:
{ "time": 2, "action": "draw", "element": { "id": "e1", "type": "emoji", "content": "💡", "label": "Key idea", "x": 75, "y": 20 } }
Space them at varied positions: (15,70), (80,25), (45,85), (90,60)

━━━ OUTPUT FORMAT — STRICTLY FOLLOW ━━━
Return ONLY valid JSON — NO markdown, NO backticks, NO text outside JSON:
{
  "steps": [
    {
      "title": "Short Section Title (max 6 words)",
      "narrative": "Full teaching text — no LaTeX, plain English for TTS. Minimum 8 sentences.",
      "duration": 30,
      "visualization": {
        "type": "katex|code|markdown|chart",
        "data": "...",
        "flowData": {
          "nodes": [
            { "id": "img1", "label": "Topic Visual", "detail": "Visual anchor for this concept", "nodeType": "image", "imageUrl": "https://image.pollinations.ai/prompt/...", "color": "#818CF8" },
            { "id": "def1", "label": "📖 Definition", "detail": "FULL DEFINITION HERE — minimum 40 words explaining what this is, how it works, and why it exists", "nodeType": "definition", "color": "#1E40AF" },
            { "id": "n1", "label": "🟢 Start", "detail": "Entry point", "nodeType": "input", "color": "#3B82F6" },
            { "id": "ins1", "label": "💡 Key Insight: [Topic Specific Title]", "detail": "THE ACTUAL INSIGHT HERE — minimum 40 words explaining the non-obvious thing about this concept that makes it click", "nodeType": "insight", "color": "#7C3AED" },
            { "id": "n2", "label": "⚙️ Process Step", "detail": "What happens here", "nodeType": "process", "color": "#10B981" },
            { "id": "ex1", "label": "🌍 Example: [Specific Name]", "detail": "FULL EXAMPLE HERE — real app name, real numbers, show the actual input and output with explanation of each step", "nodeType": "example", "color": "#34D399" },
            { "id": "note1", "label": "⚠️ Important: [Specific Warning]", "detail": "THE ACTUAL WARNING HERE — what specifically goes wrong, why it happens, and how to avoid it (minimum 35 words)", "nodeType": "note", "color": "#DC2626" },
            { "id": "n3", "label": "🏁 Output", "detail": "Final result", "nodeType": "output", "color": "#8B5CF6" },
            { "id": "qa1", "label": "❓ Q: [Specific Question]", "detail": "Q: [the actual question a student would ask]\\nA: [detailed answer — minimum 40 words explaining thoroughly]", "nodeType": "qa", "color": "#92400E" },
            { "id": "sum1", "label": "📋 Summary", "detail": "• Point 1: [full sentence]\\n• Point 2: [full sentence]\\n• Point 3: [full sentence]\\n• Point 4: [full sentence]\\n• Point 5: [full sentence]", "nodeType": "summary", "color": "#065F46" }
          ],
          "edges": [
            { "id": "e0", "source": "img1", "target": "def1", "label": "introduces", "animated": true },
            { "id": "e1", "source": "def1", "target": "n1", "label": "start", "animated": true },
            { "id": "e2", "source": "n1", "target": "ins1", "label": "insight", "animated": false },
            { "id": "e3", "source": "n1", "target": "n2", "label": "process", "animated": true },
            { "id": "e4", "source": "n2", "target": "ex1", "label": "example", "animated": false },
            { "id": "e5", "source": "n2", "target": "note1", "label": "warns", "animated": false },
            { "id": "e6", "source": "n2", "target": "n3", "label": "produces", "animated": true },
            { "id": "e7", "source": "n3", "target": "qa1", "label": "Q&A", "animated": false },
            { "id": "e8", "source": "n3", "target": "sum1", "label": "summarizes", "animated": false }
          ]
        }
      },
      "timeline": [
        { "time": 1, "action": "voice" },
        { "time": 3, "action": "draw", "element": { "id": "em1", "type": "emoji", "content": "🔀", "label": "Decision point", "x": 20, "y": 70 } },
        { "time": 8, "action": "draw", "element": { "id": "em2", "type": "emoji", "content": "💡", "label": "Key insight", "x": 80, "y": 25 } },
        { "time": 15, "action": "draw", "element": { "id": "em3", "type": "emoji", "content": "⚡", "label": "Fast execution", "x": 55, "y": 85 } }
      ]
    }
  ]
}
`;

// ─── Fetch with Retry ─────────────────────────────────────────────────────────
const fetchGroq = async (
  messages: { role: string; content: string }[],
  maxTokens = 4096,
): Promise<string> => {
  let lastError: Error = new Error('Unknown error');

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          temperature: 0.60,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Groq ${res.status}: ${errText}`);
      }

      const json = await res.json();
      return json.choices?.[0]?.message?.content ?? '{}';
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }

  throw lastError;
};

// ─── Rich Fallback Flow Generator ────────────────────────────────────────────
/**
 * Generates a comprehensive fallback flowchart with BOTH diagram and text nodes.
 * Follows the 50-50 rule: half process/visual nodes, half text/content nodes.
 */
const generateFallbackFlowData = (topicType: TopicType, title: string) => {
  const safeTitle = encodeURIComponent(title.replace(/[^a-zA-Z0-9\s]/g, '').trim());
  const imgNode = {
    id: 'img1',
    label: title,
    detail: `Visual anchor for ${title}`,
    nodeType: 'image',
    imageUrl: `https://image.pollinations.ai/prompt/${safeTitle}+educational+detailed+diagram+infographic?width=1024&height=576&nologo=true`,
  };

  if (topicType === 'code') {
    return {
      nodes: [
        imgNode,
        { id: 'def1', label: `📖 What is ${title}?`, detail: `${title} is a programming construct used to control the flow and logic of a program. It is fundamental to building real-world applications — every app from Instagram to banking software uses this concept to make automated decisions. Understanding ${title} deeply is essential before moving to advanced programming topics.`, nodeType: 'definition', color: '#1E40AF' },
        { id: 'n1', label: '🟢 Program Start', detail: 'Execution begins here', nodeType: 'input', color: '#3B82F6' },
        { id: 'ins1', label: `💡 Key Insight: How ${title} Works`, detail: `The key insight about ${title} is that it gives the program the ability to make decisions automatically based on data. Without it, every program would follow a fixed, unchanging path — like a train on a single track with no switches. With it, programs can respond intelligently to millions of different inputs and situations.`, nodeType: 'insight', color: '#7C3AED' },
        { id: 'n2', label: `⚙️ Apply ${title}`, detail: 'Core logic executes here', nodeType: 'process', color: '#6366F1' },
        { id: 'n3', label: '🔶 Condition Check', detail: 'Boolean evaluation: true or false', nodeType: 'decision', color: '#F59E0B' },
        { id: 'ex1', label: '🌍 Example: Real App Usage', detail: `In Swiggy's delivery app, ${title} is used to check: if distance < 5km → show "30 min delivery", elif distance < 10km → show "45 min delivery", else → show "60+ min delivery". This logic runs every time you open the app to calculate your estimated delivery time based on your current location.`, nodeType: 'example', color: '#34D399' },
        { id: 'n4', label: '✅ True Path', detail: 'Execute if-block code', nodeType: 'process', color: '#10B981' },
        { id: 'n5', label: '❌ False Path', detail: 'Execute else-block code', nodeType: 'process', color: '#EF4444' },
        { id: 'note1', label: '⚠️ Common Mistake to Avoid', detail: `The most frequent error beginners make with ${title} is confusing assignment (=) with comparison (==). This causes silent bugs in JavaScript and C that are extremely hard to find. Always double-check your condition operators. Also watch for off-by-one errors in boundary conditions like >= vs >.`, nodeType: 'note', color: '#DC2626' },
        { id: 'n6', label: '🏁 Output / Result', detail: 'Final computed result', nodeType: 'output', color: '#8B5CF6' },
        { id: 'qa1', label: `❓ Q: When should I use ${title}?`, detail: `Q: How do I know when to use ${title} vs other approaches?\\nA: Use it whenever your program needs to take different actions based on a condition or input value. If you find yourself writing the same if-else pattern more than 3 times, consider replacing it with a dictionary/map lookup (O(1) vs O(n) for long chains). For 2-3 conditions, if-else is always the clearest and most readable choice.`, nodeType: 'qa', color: '#92400E' },
        { id: 'sum1', label: `📋 Summary: ${title}`, detail: `• ${title} is a control flow structure that makes decisions based on conditions\\n• It evaluates a boolean expression and takes exactly ONE of the available paths\\n• Real-world apps like Swiggy, Paytm, and Google Maps use this millions of times per second\\n• Time complexity: O(1) — constant regardless of how many branches exist\\n• Most common bug: using = (assignment) instead of == (comparison) in conditions`, nodeType: 'summary', color: '#065F46' },
      ],
      edges: [
        { id: 'e0', source: 'img1', target: 'def1', label: 'introduces', animated: true },
        { id: 'e1', source: 'def1', target: 'n1', label: 'start', animated: true },
        { id: 'e2', source: 'n1', target: 'ins1', label: 'insight', animated: false },
        { id: 'e3', source: 'n1', target: 'n2', label: 'execute', animated: true },
        { id: 'e4', source: 'n2', target: 'n3', label: 'evaluate', animated: true },
        { id: 'e5', source: 'n3', target: 'n4', label: 'YES ✓', animated: true },
        { id: 'e6', source: 'n3', target: 'n5', label: 'NO ✗', animated: false },
        { id: 'e7', source: 'n3', target: 'ex1', label: 'example', animated: false },
        { id: 'e8', source: 'n4', target: 'note1', label: 'warns', animated: false },
        { id: 'e9', source: 'n4', target: 'n6', label: 'done', animated: true },
        { id: 'e10', source: 'n5', target: 'n6', label: 'done', animated: true },
        { id: 'e11', source: 'n6', target: 'qa1', label: 'Q&A', animated: false },
        { id: 'e12', source: 'n6', target: 'sum1', label: 'summarizes', animated: false },
      ],
    };
  }

  if (topicType === 'math') {
    return {
      nodes: [
        imgNode,
        { id: 'def1', label: `📖 Definition: ${title}`, detail: `${title} is a mathematical/scientific concept used to model and solve real-world quantitative problems. It provides a systematic, repeatable method for understanding relationships between quantities. Scientists at ISRO, engineers at Tesla, and researchers worldwide apply this concept daily to solve problems worth billions of dollars.`, nodeType: 'definition', color: '#1E40AF' },
        { id: 'n1', label: '📥 Given / Known Values', detail: 'Starting conditions and inputs', nodeType: 'input', color: '#3B82F6' },
        { id: 'f1', label: `📐 Formula: ${title}`, detail: `The core formula for ${title} relates all the key variables. Each variable has a specific unit and physical/mathematical meaning. Before substituting numbers, always identify what each variable represents and make sure your units are consistent — unit errors are the #1 source of wrong answers in science and engineering.`, nodeType: 'formula_text', color: '#FBBF24' },
        { id: 'ins1', label: `💡 Key Insight: Why This Formula Works`, detail: `The deeper insight behind ${title} is that it captures a fundamental relationship in nature or mathematics that holds true universally. Understanding WHY the formula works (not just HOW to use it) is what separates students who can solve unseen problems from those who can only solve textbook examples they've seen before.`, nodeType: 'insight', color: '#7C3AED' },
        { id: 'n2', label: '⚙️ Substitute Values', detail: 'Replace variables with known numbers', nodeType: 'process', color: '#6366F1' },
        { id: 'ex1', label: `🌍 Worked Example: ${title}`, detail: `Step-by-step example with actual numbers: Identify all known values → Write the formula → Substitute values carefully → Simplify step by step → Check units match → State the final answer with units. This systematic approach prevents 90% of calculation errors. Always write each step — never skip to the answer.`, nodeType: 'example', color: '#34D399' },
        { id: 'n3', label: '🔶 Check Result Valid?', detail: 'Does the answer make physical sense?', nodeType: 'decision', color: '#EC4899' },
        { id: 'note1', label: '⚠️ Critical: Check Your Units', detail: `The most common error in ${title} problems is mixing incompatible units — for example, using km instead of m, or minutes instead of seconds. Always convert all values to SI units (metres, kilograms, seconds) BEFORE substituting into the formula. A dimensionally incorrect answer is always wrong, no matter how correct the algebra is.`, nodeType: 'note', color: '#DC2626' },
        { id: 'n4', label: '📊 Final Answer', detail: 'Result with correct units', nodeType: 'output', color: '#10B981' },
        { id: 'qa1', label: `❓ Q: Most Common Application?`, detail: `Q: Where is ${title} most commonly applied in real life?\\nA: This concept appears in engineering design (bridges, circuits, rockets), medical science (drug dosage, imaging), finance (compound interest, risk modelling), and computer graphics (physics engines in games). Any time you need to quantify a relationship between variables in the real world, this concept provides the mathematical framework to do so accurately.`, nodeType: 'qa', color: '#92400E' },
        { id: 'sum1', label: `📋 Summary: ${title}`, detail: `• ${title} models a fundamental quantitative relationship\\n• Always identify all variables and their units before solving\\n• Substitute values in SI units to avoid unit errors\\n• Check that your final answer makes physical sense (sanity check)\\n• Real-world applications: engineering, medicine, finance, computer science`, nodeType: 'summary', color: '#065F46' },
      ],
      edges: [
        { id: 'e0', source: 'img1', target: 'def1', label: 'introduces', animated: true },
        { id: 'e1', source: 'def1', target: 'n1', label: 'start', animated: true },
        { id: 'e2', source: 'n1', target: 'f1', label: 'formula', animated: false },
        { id: 'e3', source: 'f1', target: 'ins1', label: 'insight', animated: false },
        { id: 'e4', source: 'n1', target: 'n2', label: 'apply', animated: true },
        { id: 'e5', source: 'n2', target: 'ex1', label: 'example', animated: false },
        { id: 'e6', source: 'n2', target: 'note1', label: 'warns', animated: false },
        { id: 'e7', source: 'n2', target: 'n3', label: 'check', animated: true },
        { id: 'e8', source: 'n3', target: 'n4', label: 'valid ✓', animated: true },
        { id: 'e9', source: 'n3', target: 'n2', label: 'retry', animated: false },
        { id: 'e10', source: 'n4', target: 'qa1', label: 'Q&A', animated: false },
        { id: 'e11', source: 'n4', target: 'sum1', label: 'summarizes', animated: false },
      ],
    };
  }

  // concept / history / general
  return {
    nodes: [
      imgNode,
      { id: 'def1', label: `📖 Definition: ${title}`, detail: `${title} is a fundamental concept that shapes how we understand and interact with the world. It represents a core idea, principle, or phenomenon with wide-ranging implications. Understanding ${title} is not just academically important — it directly impacts decisions made by businesses, governments, scientists, and individuals every day.`, nodeType: 'definition', color: '#1E40AF' },
      { id: 'n1', label: `📌 ${title}: Core Idea`, detail: 'The foundational concept', nodeType: 'input', color: '#6366F1' },
      { id: 'ins1', label: `💡 Key Insight: The Non-Obvious Truth`, detail: `Most people understand the surface-level definition of ${title}, but the deeper insight is how it connects seemingly unrelated phenomena. Once you truly understand this concept, you start seeing it everywhere — in the apps you use, decisions you make, and systems you interact with. This is the "aha moment" that separates surface understanding from deep expertise.`, nodeType: 'insight', color: '#7C3AED' },
      { id: 'n2', label: '🧩 Core Components', detail: 'The key parts that make this work', nodeType: 'process', color: '#10B981' },
      { id: 'ex1', label: `🌍 Real-World Example`, detail: `In practice, ${title} manifests in companies like Amazon, Google, and ISRO in very specific ways. For instance, Amazon's recommendation engine, Google's search ranking, and ISRO's trajectory calculations all rely on the principles of ${title}. Understanding these applications bridges the gap between theory and practice, making abstract concepts tangible and memorable.`, nodeType: 'example', color: '#34D399' },
      { id: 'n3', label: '🔶 Critical Decision Point', detail: 'Where the concept branches or applies', nodeType: 'decision', color: '#F59E0B' },
      { id: 'note1', label: '⚠️ Common Misconception', detail: `The most widespread misunderstanding about ${title} is treating it as a fixed, rigid rule when it is actually a flexible principle that depends heavily on context. This misconception leads to incorrect applications and wasted effort. The correct understanding is that the core principle remains constant, but its application must always be adapted to the specific situation at hand.`, nodeType: 'note', color: '#DC2626' },
      { id: 'n4', label: '🌍 Real-World Application', detail: 'Where this concept creates impact', nodeType: 'process', color: '#3B82F6' },
      { id: 'qa1', label: `❓ Q: How to Apply This?`, detail: `Q: How do I actually apply ${title} in practice?\\nA: Start by clearly identifying the inputs and constraints of your situation. Then map them against the core principles of ${title} to determine which aspects are most relevant. Finally, adapt the principle to your specific context rather than applying it rigidly. The most successful practitioners of this concept are those who understand the WHY behind it, not just the HOW.`, nodeType: 'qa', color: '#92400E' },
      { id: 'n5', label: '✅ Outcome / Impact', detail: 'What changes because of this concept', nodeType: 'output', color: '#8B5CF6' },
      { id: 'sum1', label: `📋 Summary: ${title}`, detail: `• ${title} is a foundational concept with broad real-world applications\\n• Its core principle connects ideas across multiple domains\\n• Real-world applications span technology, science, business, and daily life\\n• Common misconception: treating it as rigid when context always matters\\n• Deep understanding comes from knowing WHY it works, not just HOW to use it`, nodeType: 'summary', color: '#065F46' },
    ],
    edges: [
      { id: 'e0', source: 'img1', target: 'def1', label: 'introduces', animated: true },
      { id: 'e1', source: 'def1', target: 'n1', label: 'start', animated: true },
      { id: 'e2', source: 'n1', target: 'ins1', label: 'insight', animated: false },
      { id: 'e3', source: 'n1', target: 'n2', label: 'breaks into', animated: true },
      { id: 'e4', source: 'n2', target: 'ex1', label: 'example', animated: false },
      { id: 'e5', source: 'n2', target: 'n3', label: 'leads to', animated: true },
      { id: 'e6', source: 'n3', target: 'note1', label: 'warns', animated: false },
      { id: 'e7', source: 'n3', target: 'n4', label: 'applies to', animated: true },
      { id: 'e8', source: 'n4', target: 'qa1', label: 'Q&A', animated: false },
      { id: 'e9', source: 'n4', target: 'n5', label: 'results in', animated: true },
      { id: 'e10', source: 'n5', target: 'sum1', label: 'summarizes', animated: false },
    ],
  };
};

// ─── Validate & Enrich Text Node Detail Fields ───────────────────────────────
/**
 * Post-processing: ensure all text nodes have non-empty, non-trivial detail fields.
 * If AI returns a text node with a short/empty detail, replace with a meaningful fallback.
 */
const TEXT_NODE_TYPES = new Set(['definition', 'insight', 'note', 'summary', 'qa', 'formula_text', 'example']);

const enrichTextNodes = (nodes: any[], title: string): any[] => {
  return nodes.map((node: any) => {
    if (!TEXT_NODE_TYPES.has(node.nodeType)) return node;

    // If detail is missing or too short (< 20 words), generate a fallback
    const wordCount = (node.detail || '').split(/\s+/).filter(Boolean).length;
    if (wordCount >= 20) return node; // Already rich enough

    const label = node.label || node.nodeType;
    const fallbacks: Record<string, string> = {
      definition: `${title} is a core concept that serves as the foundation for understanding this topic. It defines the rules, boundaries, and behavior of the system or idea being studied. A clear definition helps distinguish this concept from related ideas and sets expectations for how and when to apply it correctly.`,
      insight: `The key insight here is that understanding the underlying principle — not just the surface rule — is what enables you to apply this concept to new, unseen problems. Most students memorize the "how" but miss the "why". The "why" is what makes the difference between a beginner and an expert.`,
      note: `Pay close attention here: this is a common source of errors that even experienced practitioners make. Understanding this specific point prevents a category of mistakes that can be very difficult to debug after the fact. When in doubt, always refer back to the fundamental definition rather than relying on memorized rules.`,
      summary: `• This concept is fundamental to the broader topic\n• The core principle can be applied across multiple contexts\n• Understanding the "why" is more important than memorizing the "how"\n• Real-world applications are everywhere once you know what to look for\n• Practice with varied examples to build genuine fluency`,
      qa: `Q: What is the most important thing to remember about ${title}?\nA: The most important thing is to understand the underlying principle, not just the surface rule. When you understand WHY something works, you can apply it correctly in any context — including situations you've never seen before. This is the difference between true understanding and surface-level memorization.`,
      formula_text: `The formula for this concept relates all key variables in a precise mathematical relationship. Each variable has a specific unit and meaning. Before applying the formula, identify all known values, convert to consistent units, substitute carefully, and always check that your final answer is physically reasonable.`,
      example: `Consider a real-world scenario: a software engineer at a major tech company (like Google or Swiggy) encounters this concept daily while building systems. They apply the core principle to make automated decisions that affect millions of users. The input values come from real user data, the process follows the rules of this concept, and the output determines what the user experiences.`,
    };

    return {
      ...node,
      detail: fallbacks[node.nodeType] || `${label}: ${title} — see the main flow for context and details about this component.`,
    };
  });
};

// ─── Parse & Validate Steps ───────────────────────────────────────────────────
const parseSteps = (raw: string, topicType: TopicType): TutorialStep[] => {
  try {
    const cleaned = raw
      .replace(/^```json[\r\n]*/mi, '')
      .replace(/```$/mi, '')
      .trim();

    let parsed = JSON.parse(cleaned);
    parsed = parsed?.steps ?? parsed?.lesson ?? (Array.isArray(parsed) ? parsed : [parsed]);
    parsed = parsed.flat();

    parsed = parsed.map((item: any) => {
      if (item.title) return item;
      const inner = Object.values(item).find((val: any) => val && typeof val === 'object' && (val as any).title);
      return inner || item;
    });

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('Parsed result has no steps');
    }

    return parsed.map((s: any, i: number) => {
      const title = s.title || `Step ${i + 1}`;
      if (!s.narrative) throw new Error(`Step ${i} missing narrative`);

      const timeline = Array.isArray(s.timeline) ? s.timeline : [];
      const minDuration = Math.ceil((s.narrative?.length ?? 0) / 12);

      // ── Intelligent fallback visualization ──────────────────────────────
      const fallbackViz: Visualization = {
        type: topicType === 'code' ? 'code' : topicType === 'math' ? 'katex' : 'markdown',
        data: topicType === 'code'
          ? {
            language: 'python',
            title: title,
            code: `# ${title}\n# Example implementation\nprint("Understanding ${title}")`,
            caption: `### 📖 ${title}\n\nThis concept is a fundamental building block in programming. Understanding it deeply enables you to build real-world applications.\n\n### ✨ Key Points\n- Core concept with wide applications\n- Used in production software daily\n- Time complexity: O(1) for simple cases`,
          }
          : `### 📌 ${title}\n\n**Definition:**\nThis concept forms a foundational part of the subject. Understanding it requires both theoretical knowledge and practical application.\n\n**Key Points:**\n- Core principle and how it works\n- Real-world applications and examples\n- Common mistakes and how to avoid them`,
        flowData: generateFallbackFlowData(topicType, title),
      };

      // ── Validate + repair flowData ───────────────────────────────────────
      let viz = s.visualization ?? fallbackViz;

      if (viz.flowData) {
        const fd = viz.flowData;
        if (!fd.nodes || fd.nodes.length === 0) {
          viz = { ...viz, flowData: generateFallbackFlowData(topicType, title) };
        } else {
          // Enrich text nodes with fallback detail if AI returned thin content
          const enrichedNodes = enrichTextNodes(fd.nodes, title);

          const nodeIds = new Set(enrichedNodes.map((n: any) => n.id));
          const mappedEdges = (fd.edges || []).map((e: any) => ({
            ...e,
            from: e.source || e.from,
            to: e.target || e.to,
            source: e.source || e.from,
            target: e.target || e.to,
          }));
          const validEdges = mappedEdges.filter((e: any) => nodeIds.has(e.source) && nodeIds.has(e.target));

          const imgNodeId = enrichedNodes.find((n: any) => n.nodeType === 'image')?.id;

          if (validEdges.length === 0 && enrichedNodes.length > 1) {
            // Auto-wire nodes linearly
            const autoEdges: any[] = [];
            const idsList = Array.from(nodeIds).filter(id => id !== imgNodeId);

            for (let j = 0; j < idsList.length - 1; j++) {
              autoEdges.push({
                id: `auto-e${j}`,
                source: idsList[j],
                target: idsList[j + 1],
                label: '',
                animated: j === 0,
              });
            }

            if (imgNodeId && idsList.length > 0) {
              autoEdges.push({ id: 'auto-img', source: imgNodeId, target: idsList[0], label: 'introduces', animated: true });
            }

            viz = { ...viz, flowData: { ...fd, nodes: enrichedNodes, edges: autoEdges } };
          } else {
            viz = { ...viz, flowData: { ...fd, nodes: enrichedNodes, edges: validEdges } };
          }
        }
      } else {
        viz = { ...viz, flowData: generateFallbackFlowData(topicType, title) };
      }

      return {
        title,
        narrative: s.narrative,
        duration: Math.max(s.duration ?? 0, minDuration, 20),
        timeline,
        visualization: viz,
      } as TutorialStep;
    });
  } catch (err: any) {
    console.error('Failed to parse AI output:', err, 'Raw String:', raw);
    throw new Error(`Parsing failed: ${err.message}. Raw AI text was logged to console.`);
  }
};

// ─── Public: Generate Tutorial ────────────────────────────────────────────────
export const generateTutorialForTopic = async (
  topic: string,
): Promise<TutorialStep[]> => {
  const topicType = detectTopicType(topic);
  const lang = detectInputLanguage(topic);
  const systemPrompt = buildSystemPrompt(topicType, topic, lang);

  const langNote = lang === 'hi'
    ? `⚠️ IMPORTANT: The student asked in HINDI. Write ALL narrative text in natural Hindi+English mix (Hinglish). Technical terms stay in English, explanations in Hindi. TEXT NODE detail fields should also be in Hinglish.`
    : `Write all content in clear, engaging English.`;

  const userPrompt = `Create a 3-part micro-lecture on: "${topic}"

${langNote}

━━━ MANDATORY CHECKLIST — FOLLOW ALL OF THESE ━━━

⭐ 50-50 RULE: Each flowchart must have approximately equal numbers of process/diagram nodes AND text content nodes (definition, insight, note, summary, qa, example).

⭐ TEXT NODE DETAIL REQUIREMENT: Every definition, insight, note, summary, qa, and example node MUST have a "detail" field with MINIMUM 30 words of actual written content — NOT just a label or emoji.

⭐ MINIMUM 10 nodes per step (at least: 1 image + 1 definition + 1 insight + 1 note/qa + 1 summary + 1 example + standard flow nodes).

${topicType === 'code' ? `
Step 1: WHAT is ${topic}? 
- definition node (full 4-sentence definition)
- insight node (why this concept exists, O(1) complexity etc.)
- basic flowchart (START → READ INPUT → CHECK CONDITION → YES/NO branches → END)
- example node (real app like Paytm/Swiggy with actual code snippet in detail)
- note node (most common beginner mistake with explanation)
- summary node (4-bullet recap)

Step 2: HOW does ${topic} work in practice?
- Complete working code example in visualization
- Extended flowchart showing edge cases and chaining (elif etc.)
- qa node (answering "what if both conditions are true?" type questions)
- formula_text or complexity node (time/space analysis)

Step 3: ADVANCED usage + common mistakes + full summary
- Real-world production code example
- Full program flowchart
- Comprehensive summary node (5+ bullet points)
- note node about advanced pitfalls
` : topicType === 'math' ? `
Step 1: WHAT is ${topic}?
- definition node (scientific/mathematical full definition)
- formula_text node (formula with EACH variable explained line by line)
- insight node (physical/mathematical meaning of the formula)
- basic process flowchart (input → formula → output)
- example node (worked example with actual numbers, step by step)

Step 2: HOW to solve problems with ${topic}?
- Complete worked example in visualization (KaTeX)
- Extended process flowchart (given → identify variables → substitute → check units → answer)
- note node (unit conversion errors, most common source of wrong answers)
- qa node (what if discriminant is negative? what if a variable is zero?)

Step 3: APPLICATIONS + common mistakes + full summary
- Real-world applications flowchart
- Comprehensive summary node (5+ bullets)
- note node about advanced edge cases
` : `
Step 1: WHAT is ${topic}? (definition + core components)
- definition node (full 4-sentence definition)
- insight node (non-obvious truth about this concept)
- conceptual flowchart (concept → components → application)
- example node (specific real-world example with actual names/numbers)

Step 2: HOW does ${topic} work? (mechanisms + real-world application)
- Process flowchart showing how the concept operates
- note node (common misconception with correct explanation)
- qa node (likely student question + detailed answer)
- example node (second example from a different domain)

Step 3: WHY does ${topic} matter? (impact + summary)
- Applications flowchart
- Comprehensive summary node (5+ bullets)
- note node about limitations or edge cases
`}

Return valid JSON only. No markdown, no backticks, no text outside the JSON object.`;

  const rawText = await fetchGroq([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);

  return parseSteps(rawText, topicType);
};

// ─── Public: Chat Q&A with Visuals ────────────────────────────────────────────
export const askTutorWithVisuals = async (
  question: string,
  context: string,
  chatHistory: ChatMessage[] = [],
): Promise<TutorialStep> => {
  const topicType = detectTopicType(question + ' ' + context);
  const lang = detectInputLanguage(question);
  const systemPrompt = buildSystemPrompt(topicType, question, lang);

  const historyMessages = chatHistory.slice(-4).map(m => ({
    role: m.role === 'ai' ? 'assistant' : 'user',
    content: m.text,
  }));

  const langNote2 = lang === 'hi'
    ? `⚠️ Student asked in HINDI — respond with narrative in Hinglish (Hindi+English mix). Keep technical terms in English. Text node detail fields also in Hinglish.`
    : `Respond in clear English.`;

  const userPrompt = `The student asked a follow-up question during the lesson on "${context}": "${question}"

${langNote2}

Generate a SINGLE, highly detailed TutorialStep that answers this question completely.

MANDATORY:
- 50-50 rule: equal diagram nodes AND text nodes
- MINIMUM 10 nodes: at least 1 definition + 1 insight + 1 note + 1 summary + 1 example (all with 30+ word detail fields)
- Full flowchart (minimum 5 flow nodes + 5 text nodes) directly illustrating the answer
- Include definition node explaining the specific concept asked about
- Include insight node with the key non-obvious understanding
- Include example node with actual real-world values specific to the question
- Include qa node addressing likely follow-up questions
- Include summary node with bullet-point recap
- visualization type: code (for code questions), katex (for math/science), markdown (for concepts)
- Include working code or formula if applicable

Return valid JSON for a single TutorialStep object inside a "steps" array.`;

  try {
    const rawText = await fetchGroq([
      { role: 'system', content: systemPrompt },
      ...historyMessages,
      { role: 'user', content: userPrompt },
    ], 2048);

    const steps = parseSteps(rawText, topicType);
    return steps[0];
  } catch (err) {
    console.error('askTutorWithVisuals error:', err);
    throw err;
  }
};