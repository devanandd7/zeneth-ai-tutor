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
// Detects BOTH Devanagari script AND Roman-script Hinglish (e.g. "kya hota hai")
// ONLY contains words that CANNOT appear in normal English sentences.

const HINGLISH_WORDS = new Set([
  // Unmistakably Hindi question words
  'kya', 'kaise', 'kyun', 'kyunki', 'kaun', 'kahan', 'kitna', 'kitne',
  // Unmistakably Hindi verb forms (no English equivalent spelling)
  'hota', 'hoti', 'hote', 'hain', 'hoga', 'hogi', 'hoge',
  'karo', 'kare', 'karta', 'karti', 'karte',
  'batao', 'bata', 'sikhna', 'sikhao', 'samjhao', 'samajh',
  'dekho', 'jano', 'chahiye', 'milta', 'milti', 'milte',
  // Unmistakably Hindi connectors (no clash with English)
  'aur', 'toh', 'bhi', 'nahi', 'nhi',
  'mein', 'agar', 'lekin', 'phir', 'isliye', 'kyonki',
  // Unmistakably Hindi pronouns
  'yeh', 'woh', 'hum', 'aap', 'iska', 'uska', 'mera', 'tera', 'apna',
  // Strong Hindi adverbs/adjectives
  'accha', 'acha', 'bahut', 'zyada', 'jyada', 'abhi', 'pehle',
  'dono', 'kuch', 'matlab', 'yani', 'asaan', 'mushkil',
]);

export const detectInputLanguage = (text: string): 'hi' | 'en' => {
  const lower = text.toLowerCase().trim();

  // 1. Check for Devanagari script characters (pure Hindi)
  const devanagariMatches = (text.match(/[\u0900-\u097F]/g) || []).length;
  const totalNonSpace = text.replace(/\s/g, '').length;
  if (totalNonSpace > 0 && (devanagariMatches / totalNonSpace) > 0.15) return 'hi';

  // 2. Check for Hinglish (Roman-script unambiguous Hindi words)
  const words = lower.split(/[\s,!?\.]+/).filter(w => w.length > 1); // skip 1-char words
  if (words.length === 0) return 'en';

  const hinglishCount = words.filter(w => HINGLISH_WORDS.has(w)).length;

  // Need at least 1 unambiguous Hindi word in short queries (≤8 words)
  if (words.length <= 8 && hinglishCount >= 1) return 'hi';
  // For longer queries, need ≥25% to be Hindi words
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
   Good example: "दोस्तों, if-else statement एक decision maker है। जैसे अगर आपके 90 से ज्यादा marks हैं, तो Grade A मिलेगी, वरना Grade B।"
2. Node LABELS in flowData: keep short English terms. Node DETAIL fields: write in Hindi.
   Example: { "label": "🟢 Program Start", "detail": "यहाँ से program शुरू होता है" }
3. Step TITLES: always in English (for UI display).
4. Use Indian examples: Zomato, Paytm, IRCTC, Swiggy, JioCinema, ISRO, Flipkart. Use ₹ not $.
5. Tone: energetic, warm, slightly casual — like a favourite IIT professor.
6. NEVER write pure formal Hindi. Always use the mix Indians naturally speak.
SAMPLE NARRATIVE STYLE:
"दोस्तों, क्या आपने कभी सोचा है कि जब आप Paytm पर अपना PIN enter करते हैं, तो app कैसे decide करता है — अंदर जाने दे या block करे? यही काम करता है if-else statement! यह basically एक gatekeeper है। अगर condition true है → एक रास्ता, false है → दूसरा रास्ता। Railway junction की तरह सोचो — train सिर्फ left या right जा सकती है। Programming में exactly यही होता है!"
`;
  }
  return `
━━━ LANGUAGE MODE: ENGLISH ━━━
Write all narrative text in clear, engaging English. Use Indian examples where relatable (₹, Zomato, ISRO, etc.).
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

// ─── Domain-Specific Thinker Instructions ─────────────────────────────────────
/**
 * This is the CORE intelligence layer. Each topic type gets:
 * 1. Mandatory flowchart logic (what nodes MUST appear)
 * 2. Mandatory content rules (what data MUST contain)
 * 3. Concrete examples so the AI knows EXACTLY what to generate
 */
const getDomainIntelligence = (type: TopicType, topic: string): string => {

  if (type === 'code') {
    return `
━━━ YOU ARE IN CODING TUTOR MODE ━━━
Topic: "${topic}"

🧠 THINKER PROTOCOL FOR CODE:
You MUST think step-by-step: "What is the LOGIC FLOW of this code topic?"
Then map that logic into a MANDATORY flowchart (flowData).

MANDATORY FLOWCHART RULES FOR CODE TOPICS:
- EVERY coding topic MUST have a COMPLETE flowchart (minimum 5 nodes, ideally 6-8 nodes)
- For if-else/conditionals: Show the decision diamond with YES/NO branches
- For loops: Show iteration cycle with loop-back arrow
- For functions: Show input → process → return flow
- For algorithms: Show each step of the algorithm as process nodes
- For data structures: Show operations (insert/delete/search/traverse)
- For OOP concepts: Show class hierarchy or method call flow
- ALWAYS use nodeType: "decision" for conditionals/branches (renders as diamond ◆)
- ALWAYS use nodeType: "input" for START and nodeType: "output" for END/RESULT
- ALWAYS use nodeType: "process" for computation/action steps

EXAMPLE FLOWCHART FOR "if-else statement":
{
  "nodes": [
    { "id": "n1", "label": "🟢 Program Start", "detail": "Code execution begins", "nodeType": "input", "color": "#3B82F6" },
    { "id": "n2", "label": "📥 Read Input / Variable", "detail": "e.g., x = 10", "nodeType": "process", "color": "#6366F1" },
    { "id": "n3", "label": "🔶 Condition True?", "detail": "if (x > 5)", "nodeType": "decision", "color": "#F59E0B" },
    { "id": "n4", "label": "✅ Execute IF Block", "detail": "print('x is greater')", "nodeType": "process", "color": "#10B981" },
    { "id": "n5", "label": "❌ Execute ELSE Block", "detail": "print('x is smaller')", "nodeType": "process", "color": "#EF4444" },
    { "id": "n6", "label": "🏁 Continue Execution", "detail": "Program moves forward", "nodeType": "output", "color": "#8B5CF6" }
  ],
  "edges": [
    { "id": "e1", "source": "n1", "target": "n2", "label": "start", "animated": true },
    { "id": "e2", "source": "n2", "target": "n3", "label": "evaluate", "animated": true },
    { "id": "e3", "source": "n3", "target": "n4", "label": "YES ✓", "animated": true },
    { "id": "e4", "source": "n3", "target": "n5", "label": "NO ✗", "animated": false },
    { "id": "e5", "source": "n4", "target": "n6", "label": "done", "animated": true },
    { "id": "e6", "source": "n5", "target": "n6", "label": "done", "animated": true }
  ]
}

MANDATORY CODE EXAMPLE RULES:
- visualization.type MUST be "code"
- ALWAYS include working, runnable code in visualization.data.code
- Code must be in Python unless topic specifies another language
- Include comments in the code explaining each section
- Show real example with actual values (not pseudocode)

━━━ CAPTION FIELD IS MANDATORY FOR CODE ━━━
The "caption" field inside visualization.data MUST be a RICH Markdown string containing ALL of these sections:
1. **❓ The Problem** — State the exact question/challenge this code solves (1-2 sentences)
2. **📖 Definition** — What is this concept? Plain English definition (2-3 sentences)
3. **✨ Key Features** — 4-5 bullet points listing the important characteristics
4. **✅ Pros** — 3 bullet points listing advantages
5. **❌ Cons / Common Pitfalls** — 3 bullet points listing disadvantages or mistakes beginners make
6. **⚙️ Complexity** — Time and Space complexity (e.g., O(n), O(1))

EXAMPLE caption value (FOLLOW THIS FORMAT EXACTLY):
"### ❓ The Problem\\nHow do we make the program choose between two paths based on a condition?\\n\\n### 📖 Definition\\nAn **if-else statement** is a conditional control structure that executes one block of code when a condition is \`True\`, and another block when it is \`False\`. It is the most fundamental decision-making tool in programming.\\n\\n### ✨ Key Features\\n- Evaluates a boolean expression (True/False)\\n- Supports chaining with \`elif\` for multiple conditions\\n- \`else\` acts as fallback when all conditions fail\\n- Can be nested for complex decision trees\\n- Works with all comparison operators (\`==\`, \`!=\`, \`>\`, \`<\`, \`>=\`, \`<=\`)\\n\\n### ✅ Pros\\n- Simple and readable syntax\\n- Extremely fast execution — O(1) time\\n- Universal across all programming languages\\n\\n### ❌ Common Pitfalls\\n- Using \`=\` (assignment) instead of \`==\` (comparison)\\n- Forgetting the colon \`:\` after the condition in Python\\n- Over-nesting if-else makes code unreadable — use elif instead\\n\\n### ⚙️ Complexity\\n- **Time:** O(1) — constant time evaluation\\n- **Space:** O(1) — no extra memory needed"

EXAMPLE visualization.data for "if-else":
{
  "language": "python",
  "title": "if-else: Decision Making in Code",
  "code": "# ─── if-else: Basic Example ───────────────────────────────\\nx = 85  # Marks out of 100\\n\\nif x >= 90:\\n    print('Grade: A+ — Excellent!')\\nelif x >= 75:\\n    print('Grade: B — Good performance')\\nelif x >= 60:\\n    print('Grade: C — Average')\\nelse:\\n    print('Grade: F — Needs improvement')\\n\\n# ─── Real World Example: ATM PIN Check ────────────────────\\ncorrect_pin = 1234\\nuser_pin = int(input('Enter PIN: '))\\n\\nif user_pin == correct_pin:\\n    print('✅ Access Granted — Welcome!')\\nelse:\\n    print('❌ Wrong PIN — Access Denied')\\n    print('Please try again or contact bank.')",
  "caption": "### ❓ The Problem\\nHow do we make the program choose between two paths based on a condition?\\n\\n### 📖 Definition\\nAn **if-else statement** is a conditional control structure that executes one block of code when a condition is True, and another block when it is False. It is the most fundamental decision-making tool in every programming language.\\n\\n### ✨ Key Features\\n- Evaluates a boolean expression (True/False)\\n- Supports chaining with elif for multiple conditions\\n- else acts as fallback when all conditions fail\\n- Can be nested for complex decision trees\\n- Works with all comparison operators\\n\\n### ✅ Pros\\n- Simple and readable syntax\\n- Extremely fast execution — O(1) time\\n- Universal across all programming languages\\n\\n### ❌ Common Pitfalls\\n- Using = (assignment) instead of == (comparison)\\n- Forgetting the colon : after the condition in Python\\n- Over-nesting if-else makes code unreadable\\n\\n### ⚙️ Complexity\\n- **Time:** O(1) — constant time evaluation\\n- **Space:** O(1) — no extra memory needed"
}

KEY POINTS to mention in narrative for CODE topics:
- What the concept IS (plain English, one sentence)
- HOW it works with a real-world analogy
- WHERE it's used in real software (mention actual apps like Instagram, Swiggy, Google)
- COMMON MISTAKES beginners make
- TIME/SPACE COMPLEXITY if it's an algorithm
`;
  }

  if (type === 'math') {
    return `
━━━ YOU ARE IN MATH/SCIENCE TUTOR MODE ━━━
Topic: "${topic}"

🧠 THINKER PROTOCOL FOR MATH/SCIENCE:
Think: "What is the PROCESS FLOW of this concept?"
- For Chemistry: What are the reactants → reaction steps → products?
- For Physics: What are the forces/inputs → equations → output/result?
- For Biology: What is the lifecycle or process (input → transformation → output)?
- For Pure Math: What is the PROOF or DERIVATION FLOW?

MANDATORY FLOWCHART RULES FOR MATH/SCIENCE:
- Minimum 5 nodes showing the PROCESS or LIFECYCLE
- For reactions (Chemistry): Reactants → Catalyst/Condition → Products
- For Physics problems: Given → Formula Selection → Substitution → Answer
- For Biology cycles (e.g. photosynthesis, water cycle): Each phase as a process node
- For Math theorems: Hypothesis → Each step of proof → Conclusion

EXAMPLE FLOWCHART FOR "Photosynthesis":
{
  "nodes": [
    { "id": "n1", "label": "☀️ Sunlight Absorbed", "detail": "Chlorophyll captures light energy", "nodeType": "input", "color": "#F59E0B" },
    { "id": "n2", "label": "💧 Water Absorbed", "detail": "H₂O from roots via xylem", "nodeType": "process", "color": "#3B82F6" },
    { "id": "n3", "label": "🌬️ CO₂ Enters", "detail": "Carbon dioxide via stomata", "nodeType": "process", "color": "#6366F1" },
    { "id": "n4", "label": "⚡ Light Reaction", "detail": "ATP + NADPH produced in thylakoid", "nodeType": "process", "color": "#EF4444" },
    { "id": "n5", "label": "🔄 Calvin Cycle", "detail": "CO₂ fixed into glucose in stroma", "nodeType": "process", "color": "#10B981" },
    { "id": "n6", "label": "🍬 Glucose + O₂", "detail": "C₆H₁₂O₆ + 6O₂ released", "nodeType": "output", "color": "#34D399" }
  ],
  "edges": [
    { "id": "e1", "source": "n1", "target": "n4", "label": "energy", "animated": true },
    { "id": "e2", "source": "n2", "target": "n4", "label": "splits", "animated": true },
    { "id": "e3", "source": "n3", "target": "n5", "label": "feeds", "animated": true },
    { "id": "e4", "source": "n4", "target": "n5", "label": "ATP/NADPH", "animated": true },
    { "id": "e5", "source": "n5", "target": "n6", "label": "produces", "animated": true }
  ]
}

MANDATORY FORMULA/SCIENCE RULES:
- visualization.type MUST be "katex" for math/chemistry/physics
- ALWAYS include actual formulas using KaTeX syntax ($$ ... $$)
- Break down the formula variable by variable
- Show a WORKED EXAMPLE with actual numbers

EXAMPLE visualization.data for "Photosynthesis":
"### 🌿 Photosynthesis Equation\\n\\n**Overall Reaction:**\\n\\n$$6CO_2 + 6H_2O \\\\xrightarrow{\\\\text{Light + Chlorophyll}} C_6H_{12}O_6 + 6O_2$$\\n\\n**What each part means:**\\n| Symbol | Meaning | Role |\\n|--------|---------|------|\\n| $6CO_2$ | Carbon dioxide | Raw material from air |\\n| $6H_2O$ | Water | Raw material from soil |\\n| $C_6H_{12}O_6$ | Glucose | Food/Energy produced |\\n| $6O_2$ | Oxygen | Byproduct released |\\n\\n**Two Stages:**\\n- 🔆 **Light Reaction** (Thylakoid): $H_2O \\\\rightarrow O_2 + ATP + NADPH$\\n- 🌀 **Dark Reaction / Calvin Cycle** (Stroma): $CO_2 + ATP \\\\rightarrow C_6H_{12}O_6$"

EXAMPLE visualization.data for "Quadratic Formula":
"### 📐 Quadratic Formula\\n\\nFor any equation $ax^2 + bx + c = 0$:\\n\\n$$x = \\\\frac{-b \\\\pm \\\\sqrt{b^2 - 4ac}}{2a}$$\\n\\n**Worked Example:** Solve $2x^2 - 4x - 6 = 0$\\n\\n$$x = \\\\frac{4 \\\\pm \\\\sqrt{16 + 48}}{4} = \\\\frac{4 \\\\pm 8}{4}$$\\n\\n$$x_1 = 3, \\\\quad x_2 = -1$$\\n\\n**Discriminant $\\\\Delta = b^2 - 4ac$:**\\n- $\\\\Delta > 0$ → Two real roots\\n- $\\\\Delta = 0$ → One root (repeated)\\n- $\\\\Delta < 0$ → No real roots (complex)"
`;
  }

  if (type === 'comparison') {
    return `
━━━ YOU ARE IN COMPARISON/CONTRAST TUTOR MODE ━━━
Topic: "${topic}"

🧠 THINKER PROTOCOL FOR COMPARISONS:
Build a clear mental model of WHAT differs and WHY it matters.

MANDATORY FLOWCHART for comparisons:
- Show both options starting from the same "root" node
- Then branch into their different approaches/characteristics
- End with "Use Case" nodes showing WHEN to pick each

MANDATORY CONTENT:
- visualization.type = "markdown"
- Build a comparison TABLE in markdown
- Show real-world examples for each option
- Give a clear "WHEN TO USE" recommendation
`;
  }

  // Default: concept / history
  return `
━━━ YOU ARE IN CONCEPT EXPLAINER MODE ━━━
Topic: "${topic}"

🧠 THINKER PROTOCOL FOR CONCEPTS:
Map the concept as a FLOW OF IDEAS:
- What triggers or causes this concept?
- What are its components or stages?
- What is the result or application?

MANDATORY FLOWCHART: minimum 4-5 nodes showing conceptual progression.

━━━ CAPTION FIELD IS MANDATORY FOR CONCEPTS ━━━
The "caption" field inside visualization.data MUST be a RICH Markdown string containing ALL of these sections:
1. **📖 Definition** — What exactly is this concept? (2-3 sentences)
2. **🔑 Key Principles** — 3-4 bullet points explaining how it works
3. **🌍 Real-World Example** — Apply it to a highly relatable everyday scenario
4. **💡 Why it matters** — The impact or value of this concept

EXAMPLE caption value (FOLLOW THIS FORMAT EXACTLY):
"### 📖 Definition\\nRevenue refers to the total amount of money brought in by a company's operations, usually through sales. Profit is the financial gain remaining after you subtract all costs, taxes, and expenses from that revenue.\\n\\n### 🔑 Key Principles\\n- **Revenue is the Top Line:** It represents total sales before any deductions.\\n- **Profit is the Bottom Line:** It represents what the company actually gets to keep.\\n- High revenue does not guarantee high profit if expenses are poorly managed.\\n\\n### 🌍 Real-World Example\\nIf a coffee shop sells 100 coffees at ₹200 each, their **Revenue** is ₹20,000. But if beans, milk, rent, and wages cost ₹15,000, their **Profit** is only ₹5,000.\\n\\n### 💡 Why it matters\\nA business can survive with low profit temporarily if it has high revenue and investor backing, but long-term survival strictly requires positive profit."
  
MANDATORY CONTENT: visualization.type = "markdown" and "data" must be the Markdown string containing the detailed caption exactly like the example.
`;
};

// ─── System Prompt Builder ────────────────────────────────────────────────────
const buildSystemPrompt = (topicType: TopicType, topic: string, lang: 'hi' | 'en' = 'en'): string => `
You are a world-class professor who teaches like a combination of Richard Feynman (clarity + curiosity) and a senior software engineer/scientist (technical depth). Your goal: every student walks away saying "I FINALLY understand this!"

━━━ CRITICAL THINKING REQUIREMENT ━━━
4. "What VISUAL IMAGE will make this stick forever?" → Generate a Pollinations AI prompt for the central concept
5. "Where does the Image Node go?" → Top-center, connected to the START or main PROCESS
6. "How many nodes?" → Exactly 6-8 nodes per step to ensure depth

━━━ IMAGE NODE MANDATE ━━━
- Every single step MUST have one node with nodeType: "image"
- This node represents the VISUAL ANCHOR of the step
- imageUrl format: "https://image.pollinations.ai/prompt/{descriptive_prompt}?width=1024&height=576&nologo=true"
- Connect this image node to the START node or the main PROCESS node using an edge

━━━ MARKDOWN IMAGE MANDATE ━━━
- Every Markdown "caption" or "data" string MUST embed at least one image using ![Image](link)
- Put the image AFTER the Definition section to break up text
- Use descriptive prompts in the link: e.g., "![ATM-Machine](https://image.pollinations.ai/prompt/modern-atm-machine-touchscreen-interface?width=600&height=338&nologo=true)"

${getLanguageInstructions(lang)}

${getDomainIntelligence(topicType, topic)}

━━━ TEACHING STRUCTURE (MANDATORY for EVERY step) ━━━
Each step MUST follow this exact 7-part pattern:

1. 🎣 HOOK     — Start with a surprising fact, provocative question, OR a mini-story. Make them lean forward.
   Example: "Did you know every Instagram post you like triggers an if-else statement running in under 1 millisecond?"

2. 🧠 CONCEPT  — Explain the core idea in plain language. Zero jargon without explanation.
   Example: "An if-else statement is a DECISION MAKER. It asks ONE question and takes ONE of two paths."

3. 🌍 EXAMPLE  — A CONCRETE, specific real-world example with actual values/names.
   Example: "When you enter your Paytm PIN: if(enteredPIN === savedPIN) { showDashboard() } else { showError() }"

4. 🔁 ANALOGY  — Compare to something universally familiar. "Think of it like..."
   Example: "Think of it like a railway junction — the train (code) can only go LEFT or RIGHT, never both."

5. 📌 KEY POINTS — 2-3 bullet points. SPECIFIC, not vague.
   Example: "- Every if-else evaluates to either true or false, NEVER both\n- You can chain elif/else-if for multiple conditions\n- Nested if-else creates decision trees"

6. 💎 TAKEAWAY — ONE crisp sentence the student must memorize.
   Example: "if-else is your code's GPS — it makes the decision so the program knows which road to take."

7. 📊 SUMMARY (LAST STEP ONLY) — Add 4 bullet points capturing the ENTIRE lesson at the END of the narrative string.

━━━ NARRATIVE RULES ━━━
- MINIMUM 6 sentences per step — never be brief when depth is needed
- MANDATORY: Every step must include at least one real-world example with specific names/numbers (₹500 not "some money", Netflix not "a company", Python 3.9 not "a language")
- Use markdown bullet points (- ) and tables where they add clarity
- LAST STEP ONLY: Append a "### 📚 Full Summary" section with 4 bullet points at the END of the "narrative" STRING
- Phrases to use: "Imagine you're building Swiggy's delivery app...", "Here's what blew my mind...", "Think of it like...", "The tricky part that trips up 90% of beginners is..."
━━━ TEACHING STRUCTURE IN NARRATIVE ━━━
The narrative field is read aloud by Text-to-Speech. It MUST:
1. 🎣 HOOK — Surprising fact or question (1-2 sentences)
2. 🧠 CONCEPT — Core idea in plain English
3. 🌍 EXAMPLE — Specific real-world example (real names, real numbers)
4. 🔁 ANALOGY — "Think of it like..." comparison
5. 💎 TAKEAWAY — One crisp sentence to remember

⛔ ZERO LaTeX in narrative. Write "the formula is..." not "$$\\frac{...}$$"

━━━ EDGE RULES ━━━
- Every node MUST have at least 1 incoming OR outgoing edge
- explanation/example/formula nodes connect as branches OFF the main flow
- Use meaningful labels: "explains", "for example", "formula", "YES ✓", "NO ✗", "produces"
- animated: true on the main critical path

━━━ TIMELINE EMOJI RULES ━━━
Include 3–4 floating emoji annotations per step:
{ "time": 2, "action": "draw", "element": { "id": "e1", "type": "emoji", "content": "💡", "label": "Key idea", "x": 75, "y": 20 } }
Space them at varied positions: (15,70), (80,25), (45,85), (90,60)

━━━ OUTPUT FORMAT — STRICTLY FOLLOW ━━━
Return ONLY valid JSON — NO markdown, NO backticks, NO text outside JSON:
{
  "steps": [
    {
      "title": "Short Section Title (max 6 words)",
      "narrative": "Full teaching text — no LaTeX, plain English for TTS",
      "duration": 30,
      "visualization": {
        "type": "katex|code|markdown|chart",
        "data": "...",
        "flowData": {
          "nodes": [
            { "id": "img1", "label": "Photosynthesis Process", "detail": "How plants convert light into food", "nodeType": "image", "imageUrl": "https://image.pollinations.ai/prompt/photosynthesis+plant+chloroplast+sunlight+educational+diagram?width=1024&height=576&nologo=true", "color": "#818CF8" },
            { "id": "n1", "label": "🟢 Sunlight Hits Leaf", "detail": "Entry point for energy", "nodeType": "input", "color": "#3B82F6" },
            { "id": "exp1", "label": "💡 What is Photosynthesis?", "detail": "The process where plants use sunlight, water, and CO2 to produce glucose and oxygen. It is how plants make their own food.", "nodeType": "explanation", "color": "#818CF8" },
            { "id": "n2", "label": "⚙️ Light Reaction", "detail": "ATP + NADPH produced in thylakoid", "nodeType": "process", "color": "#10B981" },
            { "id": "n3", "label": "⚙️ Calvin Cycle", "detail": "CO2 fixed into glucose in stroma", "nodeType": "process", "color": "#6366F1" },
            { "id": "ex1", "label": "🌍 Real World: Crop Farming", "detail": "Indian wheat farms rely on photosynthesis to produce 100 million tonnes per year. No photosynthesis = no food.", "nodeType": "example", "color": "#34D399" },
            { "id": "f1", "label": "📐 The Equation", "detail": "6CO2 + 6H2O + Light Energy → C6H12O6 (Glucose) + 6O2", "nodeType": "formula", "color": "#FBBF24" },
            { "id": "n6", "label": "🏁 Glucose + Oxygen", "detail": "Food for plant, oxygen for us", "nodeType": "output", "color": "#8B5CF6" }
          ],
          "edges": [
            { "id": "e0", "source": "img1", "target": "n1", "label": "visualize", "animated": true },
            { "id": "e1", "source": "n1", "target": "exp1", "label": "explains", "animated": false },
            { "id": "e2", "source": "n1", "target": "n2", "label": "triggers", "animated": true },
            { "id": "e3", "source": "n2", "target": "n3", "label": "feeds into", "animated": true },
            { "id": "e4", "source": "n2", "target": "ex1", "label": "for example", "animated": false },
            { "id": "e5", "source": "n3", "target": "f1", "label": "formula", "animated": false },
            { "id": "e6", "source": "n3", "target": "n6", "label": "produces", "animated": true }
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

// ─── Intelligent Fallback Flowchart Generator ─────────────────────────────────
/**
 * If AI fails to generate a flowchart, we generate a topic-aware one intelligently
 */
const generateFallbackFlowData = (topicType: TopicType, title: string) => {
  const safeTitle = encodeURIComponent(title.replace(/[^a-zA-Z0-9\s]/g, '').trim());
  const imgNode = {
    id: 'img1',
    label: title,
    detail: 'Visual Anchor',
    nodeType: 'image',
    imageUrl: `https://image.pollinations.ai/prompt/${safeTitle}+educational+detailed+diagram+infographic?width=1024&height=576&nologo=true`,
  };

  if (topicType === 'code') {
    return {
      nodes: [
        imgNode,
        { id: 'exp1', label: `💡 What is ${title}?`, detail: `${title} is a programming construct that controls how your code executes. Understanding it is essential for building real-world applications.`, nodeType: 'explanation' },
        { id: 'n1', label: '🟢 Program Start', detail: 'Execution begins here', nodeType: 'input', color: '#3B82F6' },
        { id: 'n2', label: `⚙️ Apply ${title}`, detail: 'Core logic runs here', nodeType: 'process', color: '#6366F1' },
        { id: 'n3', label: '🔶 Condition?', detail: 'Evaluate the check', nodeType: 'decision', color: '#F59E0B' },
        { id: 'n4', label: '✅ True Branch', detail: 'Execute if-block', nodeType: 'process', color: '#10B981' },
        { id: 'n5', label: '❌ False Branch', detail: 'Execute else-block', nodeType: 'process', color: '#EF4444' },
        { id: 'ex1', label: '🌍 Real World Example', detail: `Used in apps like Swiggy, Netflix, and Google Maps to make decisions millions of times per second.`, nodeType: 'example', color: '#34D399' },
        { id: 'n6', label: '🏁 Result / Return', detail: 'Output produced', nodeType: 'output', color: '#8B5CF6' },
      ],
      edges: [
        { id: 'e0', source: 'img1', target: 'n1', label: 'visualize', animated: true },
        { id: 'e1', source: 'n1', target: 'exp1', label: 'explains', animated: false },
        { id: 'e2', source: 'n1', target: 'n2', label: 'start', animated: true },
        { id: 'e3', source: 'n2', target: 'n3', label: 'evaluate', animated: true },
        { id: 'e4', source: 'n3', target: 'n4', label: 'YES ✓', animated: true },
        { id: 'e5', source: 'n3', target: 'n5', label: 'NO ✗', animated: false },
        { id: 'e6', source: 'n4', target: 'n6', label: 'done', animated: true },
        { id: 'e7', source: 'n5', target: 'n6', label: 'done', animated: true },
        { id: 'e8', source: 'n4', target: 'ex1', label: 'example', animated: false },
      ],
    };
  }

  if (topicType === 'math') {
    return {
      nodes: [
        imgNode,
        { id: 'exp1', label: `💡 What is ${title}?`, detail: `${title} is a mathematical concept used to solve real-world problems. It provides a systematic way to understand quantitative relationships.`, nodeType: 'explanation' },
        { id: 'n1', label: '📥 Given / Input', detail: 'Known values or conditions', nodeType: 'input', color: '#3B82F6' },
        { id: 'n2', label: `⚙️ Apply ${title}`, detail: 'Core calculation step', nodeType: 'process', color: '#6366F1' },
        { id: 'n3', label: '⚙️ Transform', detail: 'Mathematical transformation', nodeType: 'process', color: '#F59E0B' },
        { id: 'f1', label: '📐 Key Formula', detail: `The formula that defines ${title} — apply it step by step with known values.`, nodeType: 'formula', color: '#FBBF24' },
        { id: 'ex1', label: '🌍 Real World: Applied Math', detail: `Engineers at ISRO use ${title} to calculate satellite trajectories. Without it, launches would fail.`, nodeType: 'example', color: '#34D399' },
        { id: 'n4', label: '🔶 Valid?', detail: 'Check constraints', nodeType: 'decision', color: '#EC4899' },
        { id: 'n5', label: '📊 Final Answer', detail: 'Result', nodeType: 'output', color: '#10B981' },
      ],
      edges: [
        { id: 'e0', source: 'img1', target: 'n1', label: 'visualize', animated: true },
        { id: 'e1', source: 'n1', target: 'exp1', label: 'explains', animated: false },
        { id: 'e2', source: 'n1', target: 'n2', label: 'use', animated: true },
        { id: 'e3', source: 'n2', target: 'f1', label: 'formula', animated: false },
        { id: 'e4', source: 'n2', target: 'n3', label: 'apply', animated: true },
        { id: 'e5', source: 'n3', target: 'n4', label: 'check', animated: true },
        { id: 'e6', source: 'n4', target: 'n5', label: 'YES ✓', animated: true },
        { id: 'e7', source: 'n4', target: 'n2', label: 'retry', animated: false },
        { id: 'e8', source: 'n3', target: 'ex1', label: 'for example', animated: false },
      ],
    };
  }

  // concept / history / general
  return {
    nodes: [
      imgNode,
      { id: 'exp1', label: `💡 What is ${title}?`, detail: `${title} is a fundamental concept that shapes how we understand the world. Breaking it down reveals its elegance and real-world power.`, nodeType: 'explanation' },
      { id: 'n1', label: `📌 ${title}`, detail: 'Core concept entry', nodeType: 'input', color: '#6366F1' },
      { id: 'n2', label: '🧩 Core Components', detail: 'The key parts that make this work', nodeType: 'process', color: '#10B981' },
      { id: 'n3', label: '🔶 Key Decision', detail: 'Critical choice or branching logic', nodeType: 'decision', color: '#F59E0B' },
      { id: 'ex1', label: '🌍 Real World Use', detail: `Companies like Google, Amazon, and Tesla apply ${title} to solve billion-dollar problems every day.`, nodeType: 'example', color: '#34D399' },
      { id: 'n4', label: '🌍 Real-World Application', detail: 'Where this concept is applied', nodeType: 'process', color: '#3B82F6' },
      { id: 'n5', label: '✅ Outcome / Impact', detail: 'What changes because of this', nodeType: 'output', color: '#8B5CF6' },
    ],
    edges: [
      { id: 'e0', source: 'img1', target: 'n1', label: 'visualize', animated: true },
      { id: 'e1', source: 'n1', target: 'exp1', label: 'explains', animated: false },
      { id: 'e2', source: 'n1', target: 'n2', label: 'breaks into', animated: true },
      { id: 'e3', source: 'n2', target: 'n3', label: 'leads to', animated: true },
      { id: 'e4', source: 'n3', target: 'ex1', label: 'for example', animated: false },
      { id: 'e5', source: 'n3', target: 'n4', label: 'applies to', animated: true },
      { id: 'e6', source: 'n4', target: 'n5', label: 'results in', animated: true },
    ],
  };
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
          ? { language: 'python', title: title, code: `# ${title}\n# Example code here\nprint("Understanding ${title}")`, caption: 'Core concept implementation' }
          : `### 📌 ${title}\n\n**Key Points:**\n- Core idea of this concept\n- How it applies in practice\n- Why it matters`,
        flowData: generateFallbackFlowData(topicType, title),
      };

      // ── Validate + repair flowData if AI generated incomplete one ────────
      let viz = s.visualization ?? fallbackViz;

      if (viz.flowData) {
        const fd = viz.flowData;
        if (!fd.nodes || fd.nodes.length === 0) {
          viz = { ...viz, flowData: generateFallbackFlowData(topicType, title) };
        } else {
          // Identify image node (we forced one in the system prompt)
          const imgNodeId = fd.nodes.find((n: any) => n.nodeType === 'image')?.id;
          const nodeIds = new Set(fd.nodes.map((n: any) => n.id));
          const mappedEdges = (fd.edges || []).map((e: any) => ({
            ...e,
            from: e.source || e.from,
            to: e.target || e.to,
            source: e.source || e.from,
            target: e.target || e.to
          }));
          const validEdges = mappedEdges.filter((e: any) => nodeIds.has(e.source) && nodeIds.has(e.target));
          
          // If valid edges are fewer than expected or zero, but we HAVE nodes
          if (validEdges.length === 0 && fd.nodes.length > 1) {
            // Auto-wire the nodes linearly
            const autoEdges: any[] = [];
            const idsList = Array.from(nodeIds).filter(id => id !== imgNodeId);
            
            // Connect linear process
            for (let j = 0; j < idsList.length - 1; j++) {
              autoEdges.push({ id: `auto-e${j}`, source: idsList[j], target: idsList[j+1], label: '', animated: true });
            }
            
            // Connect image to the first step
            if (imgNodeId && idsList.length > 0) {
              autoEdges.push({ id: 'auto-img', source: imgNodeId, target: idsList[0], label: 'visualize', animated: true });
            }
            viz = { ...viz, flowData: { ...fd, edges: autoEdges } };
          } else {
            viz = { ...viz, flowData: { ...fd, edges: validEdges } };
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
  const lang = detectInputLanguage(topic); // 🌐 Auto-detect Hindi vs English
  const systemPrompt = buildSystemPrompt(topicType, topic, lang);

  const langNote = lang === 'hi'
    ? `⚠️ IMPORTANT: The student asked in HINDI. Write ALL narrative text in natural Hindi+English mix (Hinglish). Technical terms stay in English, explanations in Hindi.`
    : `Write all content in clear, engaging English.`;

  const userPrompt = `Create a 3-part micro-lecture on: "${topic}"

${langNote}

REMINDER CHECKLIST (follow ALL of these):
${topicType === 'code' ? `
✅ Step 1: Introduce WHAT ${topic} is + real-world hook + basic flowchart (START → READ INPUT → CHECK CONDITION → YES/NO branches → END). MUST include an 'image' node connected to the start.
✅ Step 2: Show COMPLETE working code example with comments + extended flowchart with edge cases. MUST include an 'image' node.
✅ Step 3: Advanced use case / common mistakes + summary + full program example. MUST include an 'image' node.
` : topicType === 'math' ? `
✅ Step 1: Introduce the concept with a hook + show the main formula/equation in KaTeX + inputs→output flowchart. MUST include an 'image' node connected to the start.
✅ Step 2: Break down EACH variable/component + show a worked example with real numbers + process flowchart. MUST include an 'image' node.
✅ Step 3: Applications / extensions + common mistakes + lifecycle/process flowchart + full summary. MUST include an 'image' node.
` : `
✅ Step 1: Hook + core concept + definition flowchart. MUST include an 'image' node connected to the start.
✅ Step 2: Deep dive + real-world examples + process flowchart. MUST include an 'image' node.
✅ Step 3: Applications + summary + complete concept map flowchart. MUST include an 'image' node.
`}
For EACH step, the flowData MUST have at least 5 nodes and 4 edges. This is MANDATORY.`;

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
  const lang = detectInputLanguage(question); // 🌐 Detect Hindi/English per question
  const systemPrompt = buildSystemPrompt(topicType, question, lang);
  
  const historyMessages = chatHistory.slice(-4).map(m => ({
    role: m.role === 'ai' ? 'assistant' : 'user',
    content: m.text,
  }));

  const langNote2 = lang === 'hi'
    ? `⚠️ Student asked in HINDI — respond with narrative in Hinglish (Hindi+English mix). Keep technical terms in English.`
    : `Respond in clear English.`;

  const userPrompt = `The student asked a follow-up question during the lesson on "${context}": "${question}"

${langNote2}
  
You must generate a SINGLE, highly detailed TutorialStep that explains this concept perfectly.
Follow the exact same JSON format as regular steps.
CRITICAL: 
- Draw a full flowchart (at least 5 round/decision nodes) illustrating the specific answer (e.g., if it's Calvin cycle, draw the cycle stages).
- Update the narrative text area with a clear explanation that answers the student's question directly.
- Include a descriptive image node.
- Include KaTeX or code visualization if applicable.`;

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