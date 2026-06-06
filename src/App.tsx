/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { 
  auth, 
  db, 
  googleProvider, 
  handleFirestoreError, 
  OperationType 
} from './firebase';
import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  getDoc, 
  serverTimestamp, 
  deleteDoc, 
  collection, 
  query, 
  orderBy, 
  limit, 
  getDocs 
} from 'firebase/firestore';
// REMOVED OpenAI import as we now use backend API
import { 
  Search, 
  Rocket, 
  Brain, 
  BarChart3, 
  AlertTriangle, 
  CheckCircle2, 
  TrendingUp, 
  Share2, 
  UserCheck, 
  MessageSquareQuote,
  Loader2,
  ChevronRight,
  ChevronLeft,
  ClipboardCheck,
  Clipboard,
  File,
  Upload,
  X,
  FileCode,
  History,
  Download,
  Lightbulb,
  Shield,
  Zap,
  Code2,
  Terminal,
  Cpu,
  Globe,
  Award,
  RefreshCw,
  PanelLeftClose,
  PanelLeftOpen,
  Trophy,
  Star,
  Github,
  GitBranch,
  GitCommit,
  Sparkles,
  Copy,
  History as HistoryIcon,
  Link as LinkIcon,
  Mic,
  Wand2,
  Volume2,
  Presentation,
  Play,
  Pause,
  Square
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { 
  Radar, 
  RadarChart, 
  PolarGrid, 
  PolarAngleAxis, 
  PolarRadiusAxis, 
  ResponsiveContainer 
} from 'recharts';
import confetti from 'canvas-confetti';

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

let requestCounter = 0;

const safeRequest = async (messages: any, model?: string, forceKeyIndex?: number) => {
  // Storing an array of three Groq API keys as requested safely
  const metaEnv = (import.meta as any).env || {};
  const GROQ_KEYS = [
    metaEnv.VITE_GROQ_API_KEY_1 || "",
    metaEnv.VITE_GROQ_API_KEY_2 || "",
    metaEnv.VITE_GROQ_API_KEY_3 || ""
  ].filter(Boolean);

  let apiKeyToUse: string | undefined = undefined;
  let customKeyIndex: number | undefined = undefined;

  const idxToUse = forceKeyIndex !== undefined ? forceKeyIndex : requestCounter;

  if (GROQ_KEYS.length > 0) {
    // Cycle through them (Round Robin) when client-side environment keys exist
    const idx = idxToUse % GROQ_KEYS.length;
    apiKeyToUse = GROQ_KEYS[idx];
  } else {
    // Otherwise, cycle through the three server-side keys by sending a Round Robin index
    customKeyIndex = idxToUse % 3;
  }
  
  if (forceKeyIndex === undefined) {
    requestCounter++;
  }

  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: model || "llama-3.3-70b-versatile",
          messages,
          apiKey: apiKeyToUse,
          keyIndex: customKeyIndex,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch from backend");
      }

      return await response.json();
    } catch (err: any) {
      attempts++;
      console.error(`API Error (Attempt ${attempts}/${maxAttempts}):`, err);
      if (attempts >= maxAttempts) {
        throw err;
      }
      // Linear backoff delay
      await sleep(1500 * attempts);
    }
  }
};

const EVALUATION_PROMPT = `
You are an elite panel of experts combined into one system:
- Senior Software Engineer (10+ years experience)
- Technical Interviewer (FAANG-level)
- System Architect
- Open-source Reviewer (GitHub standards)
- Startup Product Manager

Your task is to perform a DEEP, HONEST, and STRICT evaluation of a developer's project.
You are NOT a chatbot. You are a professional evaluator whose job is to judge real-world quality.

Follow these phases strictly:

🔍 PHASE 1: UNDERSTAND THE PROJECT
Clearly explain what the project does. Identify core purpose, target users, and innovation level.

🚀 PHASE 2: PROJECT SCORING (STRICT EVALUATION)
Give scores (out of 10) for: Code Quality, Logic, Structure, Scalability, Usefulness, UI/UX, Innovation, Performance.
Calculate ⭐ FINAL SCORE (average, strict rating).
RULE: Do NOT give high scores easily. Most student projects should fall between 4–7 unless exceptional.

🧠 PHASE 3: DEVELOPER PROFILING
Determine Skill Level (Beginner/Intermediate/Advanced/Professional), Thinking Style, and Strength Type.

📊 PHASE 4: CODE & ARCHITECTURE REVIEW
Analyze readability, modularity, naming, reusability, error handling, efficiency. Detect bad practices or AI-generated patterns.

❌ PHASE 5: WEAKNESS BREAKDOWN
Give brutally honest issues: Technical flaws, missing features, poor design, scalability problems. Be specific.

✅ PHASE 6: STRENGTH ANALYSIS
Highlight smart decisions, clean implementations, good ideas.

🚀 PHASE 7: INDUSTRY UPGRADE PLAN
Roadmap to Internship, Product, and Startup level. Include features, tech, and architecture improvements.

💡 PHASE 8: VIRAL & GITHUB IMPACT STRATEGY
Suggest features to stand out, impress recruiters, and make it "star-worthy".

🎯 PHASE 9: HIRING DECISION
Final verdict: Hire, Maybe, No Hire. With a clear reason.

📣 PHASE 10: ONE-LINE TRUTH
A brutally honest one-line summary.

📊 PHASE 11: DATA BLOCK (JSON)
At the VERY end of your response, provide a JSON block enclosed in triple backticks with the language set to 'json'.
The JSON must contain the scores for the radar chart and summary.
Format:
\`\`\`json
{
  "scores": {
    "Code Quality": 7,
    "Logic": 6,
    "Structure": 8,
    "Scalability": 5,
    "Usefulness": 9,
    "UI/UX": 7,
    "Innovation": 6,
    "Performance": 5
  },
  "final_score": 6.6,
  "skill_level": "Intermediate",
  "hiring_verdict": "Maybe"
}
\`\`\`

STRICT RULES:
- Be honest, not polite.
- Avoid generic AI responses.
- Think like a real interviewer.
- Give structured, clean output.
- Prioritize depth over length.
- Compare with industry standards (FAANG, top startups).
`;

const EXPERT_1_ARCH_PROMPT = `
You are Expert Panelist 1: Senior Software Architect & System Design Specialist.
Your focus is strictly dedicated to: SOFTWARE ARCHITECTURE, DESIGN PATTERNS, TECHNICAL MODULARITY, DECOUPLING, LOGIC FLOW, and CODE STRUCTURING.

Analyze the provided source code, file structures, and project context. Perform a thorough assessment of technical modularity & system layout.
Return:
1. Architectural Layout Review (files hierarchy, component structure, dependency directions, abstraction levels).
2. Deep Code Quality Audit (naming practices, logic structure, readability, clean code principles, DRY & SOLID standards).
3. Logic & Algorithmic flow review (where the data flows, complex flows, logical loops, missing guards).
4. Score ratings (on a extremely strict scale out of 10) for:
   - "Code Quality"
   - "Structure"
   - "Logic"
   - "Scalability"
`;

const EXPERT_2_PERF_PROMPT = `
You are Expert Panelist 2: Lead Systems, Security & DevOps Engineer.
Your focus is strictly dedicated to: RESOURCE UTILIZATION, COMPUTE EFFICIENCY, LATENCY MINIMIZATION, SECURITY DEFENSES, and VULNERABILITY AUDITS.

Analyze the provided source code, file structures, and project context. Perform a thorough assessment of speed, security, and stability.
Return:
1. Performance & Speed Optimization (computational complexity, redundant loops, CPU cycles, database queries review, memory usage).
2. Security Vulnerability Scan (leaked credentials/private keys, missing safety validation, inputs sanitation, XSS or injection risks, dependency issues).
3. Stability & Reliability (error handling coverage, try-catch scopes, concurrency problems, connection reliability).
4. Score ratings (on a extremely strict scale out of 10) for:
   - "Performance" (re-calculates speed and optimizations)
4. Score list:
   - Performance: X/10
`;

const EXPERT_3_PM_PROMPT = `
You are Expert Panelist 3: Principal Product Manager & Senior UI/UX Specialist.
Your focus is strictly dedicated to: INTERACTIVE DESIGNS, USABILITY, PRODUCT VIABILITY, INNOVATION OR NOVELTY, CAREER POTENTIAL, AND RECRUITING.

Analyze the provided source code and project context. Review features and PM appeal.
Return:
1. Comprehensive UX & UI feedback (usability flow, structural navigation, web interactive mechanics, display elements, appeal, responsiveness).
2. Innovation & Practical Usefulness (novelty level compared to default boilerplates, creative solutions, business alignment, target audience value).
3. Recruiter Profiling & Hiring Assessment (skill level estimate, career advancement, resume rating, definitive hiring feedback).
4. Score ratings (on a extremely strict scale out of 10) for:
   - "UI/UX"
   - "Innovation"
   - "Usefulness"
`;

const SYNTHESIS_PROMPT = `
You are the Lead Master Synthesizer of the elite developer evaluation panel.
You have been provided with three distinct specialized expert analysis blocks for a developer's repository:
1. Technical Design, Architecture & Code Quality (by Senior Architect Key 1)
2. Performance, Stability & Security Defenses (by Systems Engineer Key 2)
3. UI/UX, Innovation, Product PM Viability & Hiring Appeal (by Product Lead Key 3)

Your single task is to merge, polish, and synthesize these 3 separate reports into one cohesive, comprehensive, brilliantly structured, and final 10-Phase Evaluation Report. Do NOT write metadata comments (e.g. key indices used).

Tone: Serious, senior, objective, extremely professional, and deeply analytical.

Required structure to construct from the experts' feeds:

# 🔍 ELITE EVALUATION REPORT

### 🔍 PHASE 1: UNDERSTAND THE PROJECT
(Synthesizes the core purpose, target audience, technical scope, and innovation of the project)

### 🚀 PHASE 2: PROJECT SCORING (STRICT EVALUATION)
- Code Quality: [Expert 1 score]
- Logic: [Expert 1 score]
- Structure: [Expert 1 score]
- Scalability: [Expert 1 score]
- Usefulness: [Expert 3 score]
- UI/UX: [Expert 3 score]
- Innovation: [Expert 3 score]
- Performance: [Expert 2 score]
⭐ FINAL SCORE: [The average of these 8 scores (calculate precisely as a number out of 10, e.g. X.X/10)]

### 🧠 PHASE 3: DEVELOPER PROFILING
- Skill Level: (Beginner/Intermediate/Advanced/Professional - based on Expert 3)
- Thinking Style: (Practical/Theoretical/Wanderer/Creative)
- Strength Type: (e.g. System architect, styling specialist, performance-oriented coder, etc.)

### 📊 PHASE 4: CODE & ARCHITECTURE REVIEW
(Integrates Expert 1's detailed critique of modularity, naming, patterns, naming conventions, and logic flow)

### ❌ PHASE 5: WEAKNESS BREAKDOWN
(Combines technical vulnerabilities, poor designs, performance bottlenecks, and missing checks identified by Expert 1, Expert 2, and Expert 3)

### ✅ PHASE 6: STRENGTH ANALYSIS
(Integrates the highlights, smart code decisions, and clean aspects noticed across all reviews)

### 🚀 PHASE 7: INDUSTRY UPGRADE PLAN
(Structure a clear, step-by-step technological roadmap for the developer)

### 💡 PHASE 8: VIRAL & GITHUB IMPACT STRATEGY
(Actionable list to make this project star-worthy and ready to showcase to top tech recruiters)

### 🎯 PHASE 9: HIRING DECISION
- Verdict: (Hire / Maybe / No Hire - Synthesized from Expert 3)
- Reason: (Comprehensive professional explanation)

### 📣 PHASE 10: ONE-LINE TRUTH
(A brutally honest, witty, yet professional one-line summary)

### 📊 DATA BLOCK (JSON)
Provide a JSON block enclosed in triple backticks with the language set to 'json'. It MUST match this format exactly:
\`\`\`json
{
  "scores": {
    "Code Quality": [Score],
    "Logic": [Score],
    "Structure": [Score],
    "Scalability": [Score],
    "Usefulness": [Score],
    "UI/UX": [Score],
    "Innovation": [Score],
    "Performance": [Score]
  },
  "final_score": [Final average score as number],
  "skill_level": "[Skill Level]",
  "hiring_verdict": "[Verdict]"
}
\`\`\`
`;

const AI_DETECTOR_PROMPT = `
Analyze the following project/code and estimate whether it is AI-generated.

Return:

AI Generation Probability: __%

Reasons:
- Pattern 1
- Pattern 2
- Pattern 3

Check for:
- Repetitive structure
- Generic naming
- Over-optimized or too-perfect formatting
- Lack of human inconsistency

Be realistic, not extreme.
`;

const RECRUITER_PROMPT = `
Act as a strict technical recruiter reviewing this project for hiring.

Focus ONLY on hiring perspective.

Return:

🔴 Red Flags:
- Issue 1
- Issue 2

🟢 Strong Points:
- Point 1
- Point 2

📄 Resume Impact:
(Does this project strengthen a resume?)

🎯 Hiring Decision:
(Hire / Maybe / No Hire)

Be strict and realistic.
`;

const COMPARISON_PROMPT = `
Compare the following two projects as a senior engineer.

Return:

🏆 Winner: (Project A / Project B)

📊 Comparison:
- Code Quality: A vs B
- Innovation: A vs B
- Practical Use: A vs B

🧠 Final Reason:
(Why the winner is better)

Be clear and decisive.
`;

const ROAST_PROMPT = `
Roast this project in a brutally honest but funny way.

Rules:
- 1 or 2 lines only
- No explanation
- Slightly harsh but not abusive
`;

const CAREER_PROMPT = `
Evaluate how this project impacts a developer's career.

Return:

📊 Resume Strength Score: X/10  
📈 Interview Chance: (Low / Medium / High)

💼 Recruiter Impression:
(Short explanation)

🚀 What is missing to make it job-ready:
- Point 1
- Point 2
`;

const README_PROMPT = `
Generate a professional GitHub README for this project.

Include:
- Title
- Description
- Features
- Tech Stack
- Future Improvements

Keep it clean, attractive, and concise.
`;

const SCORE_CARD_PROMPT = `
Based on the given project details, generate a comprehensive, formal "Professional Project Evaluation Report".

Strict Instructions:
- Tone: Executive, analytical, and objective.
- Output: Valid JSON only.
- Content must be specific to the project provided.

JSON Structure:
{
  "projectTitle": "Clear, descriptive title",
  "executiveSummary": "A 3-4 sentence high-level assessment of the project's impact and quality.",
  "finalScore": "X.X/10",
  "pillars": [
    {
      "name": "Architecture & Logic",
      "score": 8,
      "analysis": "Brief assessment of structure and logic flow."
    },
    {
      "name": "Code Quality",
      "score": 7,
      "analysis": "Assessment of readability, naming, and maintenance."
    },
    {
      "name": "UI/UX & Design",
      "score": 6,
      "analysis": "Assessment of visual appeal and user journey."
    },
    {
      "name": "Scalability",
      "score": 5,
      "analysis": "How well this would perform under load or team growth."
    },
    {
      "name": "Innovation",
      "score": 9,
      "analysis": "Originality and creative problem solving."
    }
  ],
  "swot": {
    "strengths": ["Point 1", "Point 2"],
    "weaknesses": ["Point 1", "Point 2"],
    "opportunities": ["Market/Tech opportunities"],
    "threats": ["Competitive/Technical threats"]
  },
  "roadmap": [
    "Short-term improvement",
    "Mid-term feature addition",
    "Long-term scaling strategy"
  ],
  "criticalRisks": [
    "Specific technical or market risk",
    "Another risk"
  ]
}

Rules:
- Strictly JSON output.
- No markdown formatting outside the JSON block.
- Be brutally honest.
`;

const INTERVIEW_PROMPT = `
Generate 5 custom, high-pressure technical interview questions based on the flaws and logic found in this project.
Focus on:
- Edge cases
- Scalability
- Security vulnerabilities
- Design pattern choices
- Performance bottlenecks

Format:
Q1: [Question]
A1: [Expected Answer/Key Points]
...
`;

const REFACTOR_PROMPT = `
Act as a Principal Engineer at a FAANG company. Refactor the provided code to be production-ready, highly scalable, and following best practices.
Show the refactored code and explain the key improvements made.
Focus on:
- Clean Code principles
- Design Patterns
- Performance optimization
- Error handling
`;

const PITCH_PROMPT = `
Analyze this project's market potential and generate a 5-slide startup pitch deck outline.
Slides:
1. Problem Statement
2. Solution (The Project)
3. Market Opportunity
4. Business Model
5. Roadmap

Keep it professional, persuasive, and visionary.
`;

interface AnimatedCounterProps {
  value: number | string;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
}

const AnimatedCounter = ({ value, duration = 1200, decimals, prefix = "", suffix = "" }: AnimatedCounterProps) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTimestamp: number | null = null;
    const startValue = 0;
    
    let endValue = 0;
    if (typeof value === "string") {
      const firstPart = value.split('/')[0];
      const parsed = parseFloat(firstPart.replace(/[^0-9.]/g, ""));
      endValue = isNaN(parsed) ? 0 : parsed;
    } else {
      endValue = value;
    }

    let animationFrameId: number;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const current = startValue + ease * (endValue - startValue);
      setCount(current);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(step);
      } else {
        setCount(endValue);
      }
    };

    animationFrameId = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [value, duration]);

  const resolvedDecimals = decimals !== undefined 
    ? decimals 
    : (Number.isInteger(count) ? 0 : 1);

  return (
    <span>{prefix}{count.toFixed(resolvedDecimals)}{suffix}</span>
  );
};

const useScaleMultiplier = (trigger: any, duration = 1200) => {
  const [multiplier, setMultiplier] = useState(0);

  useEffect(() => {
    if (!trigger) {
      setMultiplier(0);
      return;
    }

    let startTimestamp: number | null = null;
    let animationFrameId: number;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setMultiplier(ease);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(step);
      }
    };

    animationFrameId = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [trigger, duration]);

  return multiplier;
};

type EvalMode = 'elite' | 'ai_detector' | 'recruiter' | 'comparison' | 'roast' | 'career' | 'readme' | 'interview' | 'refactor' | 'pitch';

export default function App() {
  const [projectInput, setProjectInput] = useState('');
  const [projectBInput, setProjectBInput] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<{ id: string; name: string; content: string; preview: string }[]>([]);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<string | null>(null);
  const [reportData, setReportData] = useState<any>(null);
  const [isGeneratingScoreCard, setIsGeneratingScoreCard] = useState(false);
  const [parsedScores, setParsedScores] = useState<any>(null);
  const [history, setHistory] = useState<{ id: string; date: string; title: string; result: string; scores?: any; mode?: EvalMode }[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [dbHistory, setDbHistory] = useState<any[]>([]);
  const [dbSearches, setDbSearches] = useState<any[]>([]);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [inputMode, setInputMode] = useState<'manual' | 'git'>('manual');
  const [evalMode, setEvalMode] = useState<EvalMode>('elite');
  
  const [evaluatorStates, setEvaluatorStates] = useState({
    architect: 'pending',
    security: 'pending',
    pm: 'pending',
    synthesizer: 'pending',
  });
  
  const reportMultiplier = useScaleMultiplier(reportData);
  const scoreMultiplier = useScaleMultiplier(parsedScores);
  
  const [isSpeaking, setIsSpeaking] = useState(false);

  const stopSpeaking = () => {
    setIsSpeaking(false);
  };

  const speakEvaluation = async () => {
    alert("TTS not supported");
  };

  const [gitUrl, setGitUrl] = useState('');
  const [branches, setBranches] = useState<string[]>([]);
  const [commits, setCommits] = useState<any[]>([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [selectedCommit, setSelectedCommit] = useState<any>(null);
  const [isFetchingRepo, setIsFetchingRepo] = useState(false);
  const [isFetchingCommits, setIsFetchingCommits] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  const loadingSteps = [
    "Senior Engineer: Analyzing code patterns...",
    "System Architect: Reviewing scalability...",
    "Technical Interviewer: Preparing brutal feedback...",
    "Product Manager: Assessing market viability...",
    "Open Source Reviewer: Checking standards...",
    "Finalizing expert consensus..."
  ];

  // Fetch user evaluation history from Firestore with full error handler integration
  const fetchUserHistory = async (uid: string) => {
    const path = `users/${uid}/evaluations`;
    try {
      const q = query(
        collection(db, 'users', uid, 'evaluations'),
        orderBy('createdAt', 'desc'),
        limit(20)
      );
      const snap = await getDocs(q);
      const list = snap.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: data.id,
          title: data.repoUrl + " (" + (data.skillLevel || 'N/A') + ")",
          date: data.createdAt?.toDate() ? data.createdAt.toDate().toLocaleString() : new Date().toLocaleString(),
          result: data.reportText,
          scores: data.scores
        };
      });
      setDbHistory(list);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  };

  // Fetch search history records from Firestore
  const fetchUserSearches = async (uid: string) => {
    const path = `users/${uid}/searches`;
    try {
      const q = query(
        collection(db, 'users', uid, 'searches'),
        orderBy('createdAt', 'desc'),
        limit(25)
      );
      const snap = await getDocs(q);
      const list = snap.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: data.id,
          query: data.query,
          mode: data.mode || 'manual',
          date: data.createdAt?.toDate() ? data.createdAt.toDate().toLocaleString() : new Date().toLocaleString()
        };
      });
      setDbSearches(list);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, path);
    }
  };

  // Delete search entry
  const deleteSearch = async (searchId: string) => {
    if (!auth.currentUser) return;
    const path = `users/${auth.currentUser.uid}/searches/${searchId}`;
    try {
      await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'searches', searchId));
      await fetchUserSearches(auth.currentUser.uid);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  // Delete evaluation report
  const deleteEvaluation = async (evalId: string) => {
    if (!auth.currentUser) return;
    const path = `users/${auth.currentUser.uid}/evaluations/${evalId}`;
    try {
      await deleteDoc(doc(db, 'users', auth.currentUser.uid, 'evaluations', evalId));
      await fetchUserHistory(auth.currentUser.uid);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, path);
    }
  };

  // Save query input logs to searches subcollection
  const saveSearchToHistory = async (queryText: string, mode: 'git' | 'manual') => {
    if (!queryText || !queryText.trim() || !auth.currentUser) return;
    const cleanQuery = queryText.trim().slice(0, 150);
    const searchId = Date.now().toString();
    const path = `users/${auth.currentUser.uid}/searches/${searchId}`;
    try {
      await setDoc(doc(db, 'users', auth.currentUser.uid, 'searches', searchId), {
        id: searchId,
        userId: auth.currentUser.uid,
        query: cleanQuery,
        mode: mode,
        createdAt: serverTimestamp()
      });
      await fetchUserSearches(auth.currentUser.uid);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, path);
    }
  };

  // Listen to Authentication states and load profile and metadata
  useEffect(() => {
    // Standard Local Storage loader for compatibility in offline modes
    const savedHistory = localStorage.getItem('eval_history');
    if (savedHistory) setHistory(JSON.parse(savedHistory));

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      setIsAuthLoading(false);
      
      if (currentUser) {
        // Safe check and write user document key matching custom rule validation parameters
        const userRef = doc(db, 'users', currentUser.uid);
        const path = `users/${currentUser.uid}`;
        try {
          const snap = await getDoc(userRef);
          if (!snap.exists()) {
            await setDoc(userRef, {
              uid: currentUser.uid,
              email: currentUser.email || '',
              displayName: currentUser.displayName || '',
              photoURL: currentUser.photoURL || '',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            });
          }
          // Fetch existing database histories inside current session
          await fetchUserHistory(currentUser.uid);
          await fetchUserSearches(currentUser.uid);
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, path);
        }
      } else {
        setDbHistory([]);
        setDbSearches([]);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Failed Google login popup:", err);
      setError("Failed to sign in. Please verify your browser popup allowances.");
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Signout failure:", err);
    }
  };

  useEffect(() => {
    let interval: any;
    if (isEvaluating) {
      interval = setInterval(() => {
        setLoadingStep(prev => (prev + 1) % loadingSteps.length);
      }, 3000);
    } else {
      setLoadingStep(0);
    }
    return () => clearInterval(interval);
  }, [isEvaluating]);

  const extractScores = (text: string) => {
    try {
      const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch && jsonMatch[1]) {
        return JSON.parse(jsonMatch[1]);
      }
    } catch (e) {
      console.error("Failed to parse scores from response", e);
    }
    return null;
  };

  const saveToHistory = async (result: string, scores: any) => {
    const title = result.split('\n').find(l => l.includes('PHASE 1'))?.replace(/.*PHASE 1: /i, '').slice(0, 40) || "Project Evaluation";
    const evalId = Date.now().toString();
    const dateStr = new Date().toLocaleString();
    const newEntry = {
      id: evalId,
      date: dateStr,
      title: title + "...",
      result,
      scores
    };
    const updatedHistory = [newEntry, ...history].slice(0, 5);
    setHistory(updatedHistory);
    localStorage.setItem('eval_history', JSON.stringify(updatedHistory));

    if (auth.currentUser) {
      const path = `users/${auth.currentUser.uid}/evaluations/${evalId}`;
      try {
        await setDoc(doc(db, 'users', auth.currentUser.uid, 'evaluations', evalId), {
          id: evalId,
          userId: auth.currentUser.uid,
          repoUrl: gitUrl ? gitUrl : ("Manual Input: " + title),
          commitSha: selectedCommit?.sha || 'none',
          scores: scores || {},
          finalScore: typeof scores?.final_score === 'number' ? scores.final_score : (parseFloat(scores?.final_score) || 0),
          skillLevel: scores?.skill_level || 'Unknown',
          hiringVerdict: scores?.hiring_verdict || 'Unknown',
          reportText: result,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        await fetchUserHistory(auth.currentUser.uid);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    }
  };

  const loadFromHistory = (entry: any) => {
    setEvaluationResult(entry.result);
    setParsedScores(entry.scores || extractScores(entry.result));
    setProjectInput('');
    setUploadedFiles([]);
  };

  const resetEvaluation = () => {
    stopSpeaking();
    setEvaluationResult(null);
    setReportData(null);
    setParsedScores(null);
    setProjectInput('');
    setProjectBInput('');
    setUploadedFiles([]);
    setGitUrl('');
    setBranches([]);
    setCommits([]);
    setSelectedBranch('');
    setSelectedCommit(null);
    setError(null);
  };

  const downloadMarkdown = () => {
    if (!evaluationResult) return;
    const blob = new Blob([evaluationResult], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evaluation-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const loadExample = () => {
    setProjectInput(`// Example: Simple Express API
const express = require('express');
const app = express();

app.get('/user/:id', (req, res) => {
  const user = database.find(req.params.id); // Potential bug: database not defined
  res.send(user);
});

app.listen(3000);`);
  };

  const parseGithubUrl = (url: string) => {
    const regex = /github\.com\/([^/]+)\/([^/]+)/;
    const match = url.match(regex);
    if (match) {
      return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
    }
    return null;
  };

  const fetchRepoInfo = async () => {
    const repoInfo = parseGithubUrl(gitUrl);
    if (!repoInfo) {
      setError("Invalid GitHub URL. Please use format: https://github.com/owner/repo");
      return;
    }

    setIsFetchingRepo(true);
    setError(null);
    try {
      // Save search log
      await saveSearchToHistory(gitUrl, 'git');

      // Fetch branches
      const branchesRes = await fetch(`https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/branches`);
      if (!branchesRes.ok) throw new Error("Failed to fetch branches. Is the repo public?");
      const branchesData = await branchesRes.json();
      const branchNames = branchesData.map((b: any) => b.name);
      setBranches(branchNames);
      
      const defaultBranch = branchNames.includes('main') ? 'main' : (branchNames.includes('master') ? 'master' : branchNames[0]);
      setSelectedBranch(defaultBranch);
      
      // Fetch commits for default branch
      await fetchCommits(repoInfo.owner, repoInfo.repo, defaultBranch);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsFetchingRepo(false);
    }
  };

  const fetchCommits = async (owner: string, repo: string, branch: string) => {
    setIsFetchingCommits(true);
    try {
      const commitsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits?sha=${branch}&per_page=10`);
      if (!commitsRes.ok) throw new Error("Failed to fetch commits.");
      const commitsData = await commitsRes.json();
      setCommits(commitsData);
      setSelectedCommit(commitsData[0]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsFetchingCommits(false);
    }
  };

  const handleBranchChange = (branch: string) => {
    setSelectedBranch(branch);
    const repoInfo = parseGithubUrl(gitUrl);
    if (repoInfo) {
      fetchCommits(repoInfo.owner, repoInfo.repo, branch);
    }
  };

  const fetchGitFiles = async (owner: string, repo: string, sha: string) => {
    try {
      // Get the tree for the commit
      const treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`);
      if (!treeRes.ok) throw new Error("Failed to fetch repository tree.");
      const treeData = await treeRes.json();
      
      // Filter for source files
      let allFiles = treeData.tree
        .filter((item: any) => item.type === 'blob' && item.path.match(/\.(ts|tsx|js|jsx|json|md|py|go|rs|java|cpp|c|h|php|rb|sh|yml|yaml)$/i))
        .filter((item: any) => 
          !item.path.includes('node_modules') && 
          !item.path.includes('package-lock.json') && 
          !item.path.includes('yarn.lock') &&
          !item.path.includes('pnpm-lock.yaml') &&
          !item.path.includes('dist/') && 
          !item.path.includes('.git/') &&
          !item.path.includes('.next/') &&
          !item.path.includes('build/') &&
          !item.path.includes('public/') &&
          !item.path.includes('assets/')
        );

      // Prioritize files in 'src', 'app', 'lib', or 'server' directories
      allFiles.sort((a: any, b: any) => {
        const aIsSrc = a.path.includes('src/') || a.path.includes('app/') || a.path.includes('server/');
        const bIsSrc = b.path.includes('src/') || b.path.includes('app/') || b.path.includes('server/');
        if (aIsSrc && !bIsSrc) return -1;
        if (!aIsSrc && bIsSrc) return 1;
        return a.path.localeCompare(b.path);
      });

      // Limit to top 15 most important files to prevent prompt token bloat
      const sourceFiles = allFiles.slice(0, 15);

      const fileContents = await Promise.all(sourceFiles.map(async (file: any) => {
        try {
          const contentRes = await fetch(file.url);
          if (!contentRes.ok) return null;
          const contentData = await contentRes.json();
          // GitHub API returns base64. Ensure it's clean
          const cleanedBase64 = contentData.content.replace(/\s/g, '');
          const binaryString = atob(cleanedBase64);
          
          // Decode correctly as UTF-8
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const content = new TextDecoder('utf-8').decode(bytes);
          
          // Truncate individual file if it exceeds 4,000 characters to keep prompts tightly scoped
          const maxCharLength = 4000;
          const truncatedContent = content.length > maxCharLength
            ? content.slice(0, maxCharLength) + "\n\n... [Truncated due to token limit constraints] ..."
            : content;

          return `--- FILE: ${file.path} ---\n${truncatedContent}`;
        } catch (e) {
          console.error(`Error fetching file ${file.path}:`, e);
          return null;
        }
      }));

      return fileContents.filter(Boolean).join('\n\n');
    } catch (err: any) {
      throw new Error(`Failed to fetch files from Git: ${err.message}`);
    }
  };

  const processFiles = async (files: FileList | null) => {
    if (!files) return;

    // Check total uploaded file count limits (Max 15 files) to prevent browser memory exhaustion
    if (uploadedFiles.length + files.length > 15) {
      setError("Security Threshold: You can upload a maximum of 15 files to prevent browser memory exhaustion.");
      return;
    }

    const newFiles: { id: string; name: string; content: string; preview: string }[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // 1. Strict File Size Limit (Max 2MB per file) to defend against memory exhaustion attacks
      if (file.size > 2 * 1024 * 1024) {
        setError(`Security Guard Limit: File "${file.name}" exceeds the safe size limit of 2MB.`);
        continue;
      }

      // Basic check for text-like files
      const isText = file.type.startsWith('text/') || 
                     file.name.match(/\.(ts|tsx|js|jsx|json|md|css|html|py|go|rs|java|cpp|c|h|php|rb|sh|yml|yaml)$/i);
      
      if (isText) {
        try {
          const content = await file.text();
          const preview = content.split('\n').slice(0, 5).join('\n');
          newFiles.push({ 
            id: Math.random().toString(36).substring(2, 11),
            name: file.name, 
            content, 
            preview 
          });
        } catch (err) {
          console.error(`Error reading file ${file.name}:`, err);
        }
      } else {
        setError(`Security Exception: File "${file.name}" format was rejected because it contains binary or unauthorized extensions.`);
      }
    }

    setUploadedFiles(prev => [...prev, ...newFiles]);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    await processFiles(e.target.files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    await processFiles(e.dataTransfer.files);
  };

  const removeFile = (id: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== id));
  };

  const clearAllFiles = () => {
    setUploadedFiles([]);
  };

  const handleEvaluate = async () => {
    let combinedInput = '';
    
    setIsEvaluating(true);
    setError(null);
    setEvaluationResult(null);
    setReportData(null);
    setEvaluatorStates({
      architect: 'pending',
      security: 'pending',
      pm: 'pending',
      synthesizer: 'pending',
    });

    try {
      if (inputMode === 'git') {
        if (!selectedCommit) throw new Error("Please select a commit first.");
        const repoInfo = parseGithubUrl(gitUrl);
        if (!repoInfo) throw new Error("Invalid repository URL.");
        
        combinedInput = await fetchGitFiles(repoInfo.owner, repoInfo.repo, selectedCommit.sha);
      } else {
        // Save manual search query log to firebase
        await saveSearchToHistory(projectInput || "Manual Evaluation File/Text Upload", 'manual');

        if (evalMode === 'comparison') {
          combinedInput = `PROJECT A:\n${projectInput}\n\nPROJECT B:\n${projectBInput}`;
        } else {
          const truncatedFilesString = uploadedFiles.map(f => {
            const content = f.content || '';
            const truncated = content.length > 3500 ? content.slice(0, 3500) + '\n\n... [Truncated for prompt limit] ...' : content;
            return `--- FILE: ${f.name} ---\n${truncated}`;
          });
          combinedInput = [
            projectInput.trim().length > 4000 ? projectInput.trim().slice(0, 4000) + '\n\n... [Truncated for prompt limit] ...' : projectInput.trim(),
            ...truncatedFilesString
          ].filter(Boolean).join('\n\n');
        }
      }

      if (!combinedInput) throw new Error("No project content found to evaluate.");

      let prompt = EVALUATION_PROMPT;
      switch (evalMode) {
        case 'ai_detector': prompt = AI_DETECTOR_PROMPT; break;
        case 'recruiter': prompt = RECRUITER_PROMPT; break;
        case 'comparison': prompt = COMPARISON_PROMPT; break;
        case 'roast': prompt = ROAST_PROMPT; break;
        case 'career': prompt = CAREER_PROMPT; break;
        case 'readme': prompt = README_PROMPT; break;
        case 'interview': prompt = INTERVIEW_PROMPT; break;
        case 'refactor': prompt = REFACTOR_PROMPT; break;
        case 'pitch': prompt = PITCH_PROMPT; break;
      }

      const chunks = [];
      const chunkSize = 6000;
      for (let i = 0; i < combinedInput.length; i += chunkSize) {
        chunks.push(combinedInput.slice(i, i + chunkSize));
      }

      let text = '';
      if (evalMode === 'elite') {
        // Concurrently run across 3 API Keys!
        setEvaluatorStates({
          architect: 'working',
          security: 'working',
          pm: 'working',
          synthesizer: 'pending',
        });

        // Split task: Track 1 (Architect)
        const architectFn = async () => {
          try {
            const resp = await safeRequest([
              {
                role: "user",
                content: `${EXPERT_1_ARCH_PROMPT}\n\nEvaluate the following source code repository context:\n\n${combinedInput}`
              }
            ], undefined, 0); // Force uses API Key Index 0
            setEvaluatorStates(prev => ({ ...prev, architect: 'done' }));
            return resp.choices[0].message.content || 'Architect evaluation empty.';
          } catch (e) {
            setEvaluatorStates(prev => ({ ...prev, architect: 'failed' }));
            throw e;
          }
        };

        // Split task: Track 2 (Security & Performance) - stagger with slight delay
        const securityFn = async () => {
          try {
            await sleep(800); // Stagger by 800ms
            const resp = await safeRequest([
              {
                role: "user",
                content: `${EXPERT_2_PERF_PROMPT}\n\nEvaluate the following source code repository context:\n\n${combinedInput}`
              }
            ], undefined, 1); // Force uses API Key Index 1
            setEvaluatorStates(prev => ({ ...prev, security: 'done' }));
            return resp.choices[0].message.content || 'Security & Performance evaluation empty.';
          } catch (e) {
            setEvaluatorStates(prev => ({ ...prev, security: 'failed' }));
            throw e;
          }
        };

        // Split task: Track 3 (UI/UX, Resume, and Product Alignment PM) - stagger with larger delay
        const pmFn = async () => {
          try {
            await sleep(1600); // Stagger by 1600ms
            const resp = await safeRequest([
              {
                role: "user",
                content: `${EXPERT_3_PM_PROMPT}\n\nEvaluate the following source code repository context:\n\n${combinedInput}`
              }
            ], undefined, 2); // Force uses API Key Index 2
            setEvaluatorStates(prev => ({ ...prev, pm: 'done' }));
            return resp.choices[0].message.content || 'Product PM evaluation empty.';
          } catch (e) {
            setEvaluatorStates(prev => ({ ...prev, pm: 'failed' }));
            throw e;
          }
        };

        // Execute parallel/staggered requests to utilize all 3 API keys safely
        const [archResult, securityResult, pmResult] = await Promise.all([
          architectFn(),
          securityFn(),
          pmFn(),
        ]);

        // Synthesize the output
        setEvaluatorStates(prev => ({ ...prev, synthesizer: 'working' }));

        const synthesisResponse = await safeRequest([
          {
            role: "user",
            content: `${SYNTHESIS_PROMPT}\n\nBelow are the 3 specialized expert assessments for you to synthesize:\n\n` + 
                     `=== EXPERT 1 ASSESSMENT (Key Index 0: Architecture & Modularity) ===\n${archResult}\n\n` + 
                     `=== EXPERT 2 ASSESSMENT (Key Index 1: Performance & Security Health) ===\n${securityResult}\n\n` + 
                     `=== EXPERT 3 ASSESSMENT (Key Index 2: UI/UX, Product PM Alignment, Career Value) ===\n${pmResult}`
          }
        ], undefined, 0);

        setEvaluatorStates(prev => ({ ...prev, synthesizer: 'done' }));
        text = synthesisResponse.choices[0].message.content || '';

      } else {
        // Other smaller modes continue via single load-rotated Key approach
        setEvaluatorStates({
          architect: 'done',
          security: 'done',
          pm: 'done',
          synthesizer: 'working',
        });

        if (chunks.length === 1) {
          const response = await safeRequest([
            {
              role: "user",
              content: `${prompt}\n\nNow evaluate the following project:\n\n${combinedInput}`
            }
          ]);
          text = response.choices[0].message.content || '';
        } else {
          const partialResults = [];
          for (let i = 0; i < chunks.length; i++) {
            const response = await safeRequest([
              {
                role: "user",
                content: `${prompt}\n\nAnalyze this part of the project (Part ${i + 1}/${chunks.length}):\n${chunks[i]}`,
              },
            ]);
            partialResults.push(`--- ANALYSIS (PART ${i + 1}) ---\n${response.choices[0].message.content}`);
            if (i < chunks.length - 1) await sleep(2000);
          }

          const finalResponse = await safeRequest([
            {
              role: "user",
              content: `You have been provided with partial evaluations.
Your task is to merge these into one cohesive, comprehensive, and FINAL evaluation report that follows the initial structure strictly.

Initial Structure Instructions:
${prompt}

Partial Results to Combine:
${partialResults.join("\n\n")}`,
            }
          ]);
          text = finalResponse.choices[0].message.content || '';
        }

        setEvaluatorStates(prev => ({ ...prev, synthesizer: 'done' }));
      }

      if (text) {
        const scores = extractScores(text);
        setEvaluationResult(text);
        setParsedScores(scores);
        saveToHistory(text, scores);

        if (scores?.final_score >= 8) {
          confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#f97316', '#ffffff', '#fb923c']
          });
        }
      } else {
        throw new Error("No evaluation result received.");
      }
    } catch (err: any) {
      console.error("Evaluation error:", err);
      setError(err.message || "An unexpected error occurred during evaluation.");
    } finally {
      setIsEvaluating(false);
    }
  };

  const generateScoreCard = async () => {
    if (!evaluationResult) return;
    
    setIsGeneratingScoreCard(true);
    try {
      const response = await safeRequest([
        {
          role: "user",
          content: `${SCORE_CARD_PROMPT}\n\nEvaluation:\n${evaluationResult}`
        }
      ]);

      const text = response.choices[0].message.content;

      if (text) {
        // Try to parse JSON
        try {
          // Find JSON block if it exists, otherwise assume the whole text is JSON
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          const jsonStr = jsonMatch ? jsonMatch[0] : text;
          const parsed = JSON.parse(jsonStr);
          setReportData(parsed);
        } catch (e) {
          console.error("Failed to parse report JSON", e);
          // Fallback or handle error
          setError("Failed to generate a valid project report. Please try again.");
        }
      }
    } catch (err) {
      console.error("Score card error:", err);
    } finally {
      setIsGeneratingScoreCard(false);
    }
  };

  const downloadPDF = async () => {
    if (!reportRef.current) return;
    setIsGeneratingScoreCard(true);
    try {
      const element = reportRef.current;
      
      const canvas = await html2canvas(element, {
        scale: 2,
        backgroundColor: '#0a0a0a',
        logging: false,
        useCORS: true,
        allowTaint: true,
        onclone: (clonedDoc) => {
          const styleTags = Array.from(clonedDoc.getElementsByTagName('style'));
          styleTags.forEach(style => {
            try {
              let css = style.innerHTML;
              if (/oklch|oklab|lch\(|lab\(|color-mix/i.test(css)) {
                css = css.replace(/oklch\([^)]+\)/gi, '#71717a'); 
                css = css.replace(/oklab\([^)]+\)/gi, '#27272a');
                css = css.replace(/lch\([^)]+\)/gi, '#71717a');
                css = css.replace(/lab\([^)]+\)/gi, '#3f3f46');
                css = css.replace(/color-mix\([^)]+\)/gi, '#3f3f46');
                style.innerHTML = css;
              }
            } catch (e) {}
          });

          const links = Array.from(clonedDoc.getElementsByTagName('link'));
          links.forEach(link => {
            if (link.rel === 'stylesheet' && !link.href.includes(window.location.host)) {
              link.remove();
            }
          });

          // Find and remove download/copy action buttons from the cloned doc so they aren't printed in the PDF
          const actionButtons = clonedDoc.getElementById('report-action-buttons');
          if (actionButtons) {
            actionButtons.remove();
          }

          const reportElement = clonedDoc.getElementById('evaluation-report');
          if (reportElement) {
            reportElement.style.setProperty('background-color', '#0a0a0a', 'important');
            reportElement.style.setProperty('color', '#f4f4f5', 'important'); 
            reportElement.style.setProperty('border', 'none', 'important');
            reportElement.style.setProperty('padding', '40px', 'important');
            reportElement.style.setProperty('width', '900px', 'important'); 
            reportElement.style.setProperty('max-width', 'none', 'important');

            const fixNodes = (node: HTMLElement) => {
              if (!node || !node.style) return;
              const styles = window.getComputedStyle(node);
              
              const color = styles.color;
              if (color.includes('0, 0, 0') || color === 'black' || node.classList.contains('text-zinc-900') || node.classList.contains('text-zinc-800')) {
                node.style.setProperty('color', '#f4f4f5', 'important');
              }

              if (node.classList.contains('bg-white')) {
                node.style.setProperty('background-color', '#0f0f0f', 'important');
                node.style.setProperty('color', '#f4f4f5', 'important');
              }
              
              if (node.classList.contains('bg-zinc-50')) node.style.setProperty('background-color', '#18181b', 'important');
              if (node.classList.contains('bg-zinc-100')) node.style.setProperty('background-color', '#27272a', 'important');
              if (node.classList.contains('text-zinc-700')) node.style.setProperty('color', '#d4d4d8', 'important');
              if (node.classList.contains('text-zinc-600')) node.style.setProperty('color', '#a1a1aa', 'important');
              if (node.classList.contains('text-orange-600')) node.style.setProperty('color', '#fb923c', 'important');

              Array.from(node.children).forEach(child => fixNodes(child as HTMLElement));
            };

            fixNodes(reportElement);
          }
        }
      });
      
      const imgData = canvas.toDataURL('image/png', 1.0);
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const marginX = 10;
      const marginY = 15;
      const contentWidth = pdfWidth - (marginX * 2);
      const contentHeight = pdfHeight - (marginY * 2);
      
      const imgWidth = contentWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      let heightLeft = imgHeight;
      let position = marginY;

      const addBackgroundAndFrame = () => {
        pdf.setFillColor(10, 10, 10);
        pdf.rect(0, 0, pdfWidth, pdfHeight, 'F');
        pdf.setDrawColor(40, 40, 40);
        pdf.rect(5, 5, pdfWidth - 10, pdfHeight - 10, 'D');
      };

      const applySafeMargins = () => {
        pdf.setFillColor(10, 10, 10);
        pdf.rect(0, 0, pdfWidth, marginY, 'F');
        pdf.rect(0, pdfHeight - marginY, pdfWidth, marginY, 'F');
        pdf.setDrawColor(40, 40, 40);
        pdf.rect(5, 5, pdfWidth - 10, pdfHeight - 10, 'D');
      };

      addBackgroundAndFrame();
      pdf.addImage(imgData, 'PNG', marginX, position, imgWidth, imgHeight);
      applySafeMargins();
      
      let pageOffset = contentHeight;
      while (heightLeft > contentHeight) {
        pdf.addPage();
        addBackgroundAndFrame();
        
        const offset = marginY - pageOffset;
        pdf.addImage(imgData, 'PNG', marginX, offset, imgWidth, imgHeight);
        
        applySafeMargins();
        heightLeft -= contentHeight;
        pageOffset += contentHeight;
      }
      
      pdf.save(`Evaluation_Report_${reportData?.projectTitle?.replace(/\s+/g, '_') || 'Elite'}.pdf`);
    } catch (err) {
      console.error("PDF generation error:", err);
      setError("Failed to generate PDF report.");
    } finally {
      setIsGeneratingScoreCard(false);
    }
  };

  const copyToClipboard = () => {
    if (evaluationResult) {
      navigator.clipboard.writeText(evaluationResult);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  useEffect(() => {
    if (evaluationResult && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [evaluationResult]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 font-sans selection:bg-orange-500/30">
      {/* Header */}
      <header className="border-b border-zinc-800/50 bg-[#0a0a0a]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400"
              title={isSidebarOpen ? "Close Sidebar" : "Open Sidebar"}
            >
              {isSidebarOpen ? <PanelLeftClose className="w-5 h-5" /> : <PanelLeftOpen className="w-5 h-5" />}
            </button>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 bg-orange-600 rounded-lg flex items-center justify-center shadow-lg shadow-orange-900/20">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <h1 className="text-xl font-black tracking-tighter uppercase italic flex gap-1.5 leading-none">
                <span className="text-white">Elite</span>
                <span className="text-orange-600">Evaluator</span>
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="hidden sm:flex items-center gap-4 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-mono">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                System: <span className="text-zinc-300">Operational</span>
              </div>
              <div className="w-px h-4 bg-zinc-800"></div>
              <div className="flex items-center gap-1.5">
                <Shield className="w-3 h-3 text-orange-500" />
                Security: <span className="text-zinc-300">Active</span>
              </div>
            </div>

            {/* Google Sign In Component */}
            {isAuthLoading ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-orange-500 animate-spin" />
              </div>
            ) : user ? (
              <div className="flex items-center gap-3 bg-zinc-900/80 border border-zinc-800 px-3 py-1.5 rounded-full shadow-inner shadow-black/40">
                {user.photoURL ? (
                  <img 
                    referrerPolicy="no-referrer" 
                    src={user.photoURL} 
                    alt={user.displayName || "User"} 
                    className="w-6 h-6 rounded-full border border-orange-500/20" 
                  />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-orange-600/20 text-orange-400 border border-orange-500/30 flex items-center justify-center text-xs font-bold uppercase">
                    {user.email?.[0] || 'U'}
                  </div>
                )}
                <div className="hidden md:flex flex-col text-left leading-none max-w-[120px]">
                  <span className="text-xs font-semibold text-zinc-200 block truncate">{user.displayName || 'Authorized'}</span>
                  <span className="text-[9px] text-zinc-500 block truncate">{user.email}</span>
                </div>
                <button
                  onClick={handleSignOut}
                  className="text-[10px] text-zinc-400 hover:text-red-400 font-mono uppercase bg-zinc-800 hover:bg-zinc-800/80 px-2 py-0.5 rounded transition-all border border-zinc-700/60"
                  title="Sign Out"
                >
                  Exit
                </button>
              </div>
            ) : (
              <button
                onClick={handleSignIn}
                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-orange-500 border border-orange-500/20 hover:border-orange-500/40 text-[10px] font-mono uppercase tracking-wider rounded-lg transition-all shadow-md active:scale-95"
              >
                <UserCheck className="w-3 h-3" />
                Google Sign In
              </button>
            )}

            {evaluationResult && (
              <button
                onClick={resetEvaluation}
                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-mono uppercase tracking-widest rounded-lg transition-all border border-zinc-700"
              >
                <RefreshCw className="w-3 h-3" />
                New Eval
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
        {isAuthLoading ? (
          <div className="flex flex-col items-center justify-center py-24 space-y-4">
            <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
            <p className="text-xs font-mono uppercase tracking-widest text-zinc-500">Checking Security Clearance...</p>
          </div>
        ) : !user ? (
          <div className="max-w-md mx-auto my-12">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-8 bg-zinc-900/60 border border-zinc-800 rounded-3xl text-center shadow-2xl relative overflow-hidden"
            >
              <div className="absolute -top-24 -left-24 w-48 h-48 bg-orange-600/10 blur-3xl rounded-full" />
              <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-orange-600/10 blur-3xl rounded-full" />
              
              <div className="relative z-10">
                <div className="w-16 h-16 bg-orange-600/10 border border-orange-500/20 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                  <Brain className="w-10 h-10 text-orange-500 animate-pulse" />
                </div>
                
                <h3 className="text-2xl sm:text-3xl font-serif italic text-white mb-3">
                  Authentication <span className="text-orange-500">Required</span>
                </h3>
                
                <p className="text-zinc-400 text-sm leading-relaxed mb-8">
                  Welcome to Elite Evaluator. You must sign in using your Google account to securely record search logs, store metrics valuations, and access professional-grade code review scorecards.
                </p>

                <button
                  onClick={handleSignIn}
                  className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-orange-600 hover:bg-orange-500 text-white font-mono text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg hover:shadow-orange-950/20 active:scale-[0.98]"
                >
                  <UserCheck className="w-3" />
                  Sign In with Google
                </button>

                <div className="mt-6 flex items-center justify-center gap-1.5 text-[9px] uppercase tracking-[0.15em] text-zinc-500 font-mono">
                  <Shield className="w-3 h-3 text-orange-500/80" />
                  <span>Secure OAuth 2.0 Safeguard</span>
                </div>
              </div>
            </motion.div>
          </div>
        ) : (
          <>
            {/* Hero Section */}
            {!evaluationResult && (
          <section className="mb-12 text-center">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/20 text-orange-500 text-[10px] uppercase tracking-widest mb-6"
            >
              <Award className="w-3 h-3" />
              Professional Grade Analysis
            </motion.div>
            <motion.h2 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-4xl sm:text-7xl font-serif italic font-light mb-6 tracking-tighter"
            >
              Judge Your <span className="text-orange-500">Work</span>.
            </motion.h2>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-zinc-400 max-w-2xl mx-auto text-sm sm:text-lg leading-relaxed"
            >
              Submit your project for a brutal, FAANG-level evaluation. 
              Our expert panel detects flaws that standard linters miss.
            </motion.p>
          </section>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-16">
          {/* Sidebar: History & Examples */}
          <AnimatePresence mode="wait">
            {isSidebarOpen && (
              <motion.aside 
                initial={{ opacity: 0, x: -20, width: 0 }}
                animate={{ opacity: 1, x: 0, width: 'auto' }}
                exit={{ opacity: 0, x: -20, width: 0 }}
                className="lg:col-span-3 space-y-6 overflow-hidden"
              >
                <div className="p-4 bg-zinc-900/30 border border-zinc-800 rounded-xl">
                  <h4 className="text-[10px] uppercase tracking-widest text-zinc-500 mb-4 flex items-center gap-2">
                    <History className="w-3 h-3" /> Recent Activity
                  </h4>
                  <div className="space-y-2">
                    {user ? (
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-[9px] uppercase tracking-widest text-zinc-500 mb-2 flex items-center justify-between">
                            <span>Cloud Evaluations</span>
                            <span className="text-[7px] bg-orange-600/15 text-orange-500 border border-orange-500/20 px-1.5 py-0.5 rounded-full lowercase font-mono">syncing</span>
                          </h4>
                          <div className="space-y-2">
                            {dbHistory.length > 0 ? (
                              dbHistory.map((entry) => (
                                <div key={entry.id} className="relative group/item">
                                  <button
                                    onClick={() => loadFromHistory(entry)}
                                    className="w-full text-left p-2 rounded bg-zinc-800/30 hover:bg-zinc-800/60 border border-zinc-700/50 transition-all text-[10px] text-zinc-300 pr-8"
                                  >
                                    <div className="truncate group-hover/item:text-orange-400 font-medium">{entry.title}</div>
                                    <div className="text-[8px] text-zinc-600 mt-1 flex justify-between items-center pr-1">
                                      <span>{entry.date}</span>
                                      {entry.scores?.final_score && (
                                        <span className="text-orange-500 font-bold">{entry.scores.final_score}</span>
                                      )}
                                    </div>
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (confirm("Are you sure you want to delete this evaluation report from your Google cloud history?")) {
                                        deleteEvaluation(entry.id);
                                      }
                                    }}
                                    className="absolute right-2 top-2 p-1 text-zinc-600 hover:text-red-400 rounded bg-transparent opacity-0 group-hover/item:opacity-100 transition-opacity hover:bg-zinc-800/50"
                                    title="Delete Evaluation"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ))
                            ) : (
                              <div className="text-[10px] text-zinc-600 italic py-1">No reports. Try analyzing code above!</div>
                            )}
                          </div>
                        </div>

                        <div className="border-t border-zinc-800/50 pt-3">
                          <h4 className="text-[9px] uppercase tracking-widest text-zinc-500 mb-2 flex items-center gap-2">
                            <Search className="w-3 h-3" /> Search History
                          </h4>
                          <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
                            {dbSearches.length > 0 ? (
                              dbSearches.map((entry) => (
                                <div key={entry.id} className="relative group/item flex items-center justify-between p-1.5 rounded bg-zinc-800/10 border border-zinc-800/50">
                                  <div className="flex-1 min-w-0 pr-6">
                                    <div className="text-[9px] text-zinc-300 truncate font-mono" title={entry.query}>{entry.query}</div>
                                    <div className="text-[7px] text-zinc-600 mt-0.5 flex gap-2">
                                      <span>{entry.date}</span>
                                      <span className="text-orange-500/70 font-bold uppercase">{entry.mode}</span>
                                    </div>
                                  </div>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deleteSearch(entry.id);
                                    }}
                                    className="text-zinc-600 hover:text-red-400 p-0.5 opacity-0 group-hover/item:opacity-100 transition-opacity"
                                    title="Clear Search"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ))
                            ) : (
                              <div className="text-[10px] text-zinc-600 italic py-1">No search logs yet.</div>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <div className="mb-3 text-[9px] text-zinc-500 bg-orange-500/5 border border-orange-500/10 rounded-lg p-2 leading-relaxed">
                          💡 <button onClick={handleSignIn} className="text-orange-400 font-bold hover:underline">Sign in with Google</button> to preserve your search logs and metrics reports across sessions.
                        </div>
                        <div className="space-y-2">
                          {history.length > 0 ? history.map((entry) => (
                            <button
                              key={entry.id}
                              onClick={() => loadFromHistory(entry)}
                              className="w-full text-left p-2 rounded bg-zinc-800/30 hover:bg-zinc-800/60 border border-zinc-700/50 transition-all group"
                            >
                              <div className="text-[10px] text-zinc-300 truncate group-hover:text-orange-400">{entry.title}</div>
                              <div className="text-[8px] text-zinc-600 mt-1 flex justify-between">
                                <span>{entry.date}</span>
                                {entry.scores?.final_score && (
                                  <span className="text-orange-500 font-bold">{entry.scores.final_score}</span>
                                )}
                              </div>
                            </button>
                          )) : (
                            <div className="text-[10px] text-zinc-600 italic">No recent evaluations</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="p-4 bg-zinc-900/30 border border-zinc-800 rounded-xl">
                  <h4 className="text-[10px] uppercase tracking-widest text-zinc-500 mb-4 flex items-center gap-2">
                    <Lightbulb className="w-3 h-3" /> Quick Start
                  </h4>
                  <button
                    onClick={loadExample}
                    className="w-full text-left p-2 rounded bg-orange-500/5 hover:bg-orange-500/10 border border-orange-500/20 transition-all text-[10px] text-orange-400 flex items-center justify-between group"
                  >
                    Load Example Snippet
                    <ChevronRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              </motion.aside>
            )}
          </AnimatePresence>

          {/* Main Input Area */}
          <div className={`${isSidebarOpen ? 'lg:col-span-9' : 'lg:col-span-12'} transition-all duration-300`}>
            {!evaluationResult && (
              <div className="space-y-6">
                {/* Error Display */}
                {error && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-sm"
                  >
                    <AlertTriangle className="w-5 h-5 shrink-0" />
                    <p className="flex-1">{error}</p>
                    <button onClick={() => setError(null)} className="p-1 hover:bg-red-500/20 rounded transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </motion.div>
                )}

                {/* Mode Toggle */}
                <div className="flex flex-wrap gap-2 p-1 bg-zinc-900 border border-zinc-800 rounded-xl w-fit">
                  {[
                    { id: 'elite', label: 'Elite Eval', icon: Brain },
                    { id: 'ai_detector', label: 'AI Detector', icon: Search },
                    { id: 'recruiter', label: 'Recruiter', icon: UserCheck },
                    { id: 'comparison', label: 'Compare', icon: GitBranch },
                    { id: 'roast', label: 'Roast', icon: Zap },
                    { id: 'career', label: 'Career', icon: TrendingUp },
                    { id: 'readme', label: 'README', icon: FileCode },
                    { id: 'interview', label: 'Interview', icon: Mic },
                    { id: 'refactor', label: 'Refactor', icon: Wand2 },
                    { id: 'pitch', label: 'Pitch', icon: Presentation },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      onClick={() => setEvalMode(mode.id as EvalMode)}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-mono uppercase tracking-widest transition-all flex items-center gap-2 ${evalMode === mode.id ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/20' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                      <mode.icon className="w-3 h-3" />
                      {mode.label}
                    </button>
                  ))}
                </div>

                <div className="flex p-1 bg-zinc-900 border border-zinc-800 rounded-xl w-fit">
                  <button
                    onClick={() => setInputMode('manual')}
                    className={`px-4 py-2 rounded-lg text-xs font-mono uppercase tracking-widest transition-all flex items-center gap-2 ${inputMode === 'manual' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    <FileCode className="w-3 h-3" />
                    Manual
                  </button>
                  <button
                    onClick={() => setInputMode('git')}
                    disabled={evalMode === 'comparison'}
                    className={`px-4 py-2 rounded-lg text-xs font-mono uppercase tracking-widest transition-all flex items-center gap-2 ${inputMode === 'git' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300 disabled:opacity-30'}`}
                  >
                    <Github className="w-3 h-3" />
                    Git
                  </button>
                </div>

                {inputMode === 'git' ? (
                  <div className="relative group">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-orange-500 to-zinc-800 rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
                    <div className="relative bg-[#111111] border border-zinc-800 rounded-xl overflow-hidden p-6">
                      <div className="flex flex-col gap-6">
                        <div className="space-y-2">
                          <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                            <LinkIcon className="w-3 h-3" /> Repository URL
                          </label>
                          <div className="flex gap-3">
                            <input
                              type="text"
                              value={gitUrl}
                              onChange={(e) => setGitUrl(e.target.value)}
                              placeholder="https://github.com/owner/repo"
                              className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-300 font-mono text-sm focus:outline-none focus:border-orange-500 transition-colors"
                            />
                            <button
                              onClick={fetchRepoInfo}
                              disabled={isFetchingRepo || !gitUrl.trim()}
                              className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-900 disabled:text-zinc-700 text-zinc-300 font-mono text-xs uppercase tracking-widest rounded-lg transition-all border border-zinc-700 flex items-center gap-2"
                            >
                              {isFetchingRepo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                              Load Repo
                            </button>
                          </div>
                        </div>

                        {branches.length > 0 && (
                          <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="grid grid-cols-1 md:grid-cols-2 gap-6"
                          >
                            <div className="space-y-2">
                              <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                                <GitBranch className="w-3 h-3" /> Branch
                              </label>
                              <select
                                value={selectedBranch}
                                onChange={(e) => handleBranchChange(e.target.value)}
                                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-300 font-mono text-sm focus:outline-none focus:border-orange-500 transition-colors appearance-none"
                              >
                                {branches.map(b => <option key={b} value={b}>{b}</option>)}
                              </select>
                            </div>

                            <div className="space-y-2">
                              <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                                <GitCommit className="w-3 h-3" /> Specific Commit
                              </label>
                              <div className="relative">
                                <select
                                  value={selectedCommit?.sha || ''}
                                  onChange={(e) => setSelectedCommit(commits.find(c => c.sha === e.target.value))}
                                  disabled={isFetchingCommits}
                                  className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-zinc-300 font-mono text-sm focus:outline-none focus:border-orange-500 transition-colors appearance-none disabled:opacity-50"
                                >
                                  {isFetchingCommits ? (
                                    <option>Loading commits...</option>
                                  ) : (
                                    commits.map(c => (
                                      <option key={c.sha} value={c.sha}>
                                        {c.sha.substring(0, 7)} - {c.commit.message.substring(0, 30)}...
                                      </option>
                                    ))
                                  )}
                                </select>
                                {isFetchingCommits && (
                                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                    <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
                                  </div>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )}

                        {selectedCommit && (
                          <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg"
                          >
                            <div className="flex items-start gap-4">
                              <img 
                                src={selectedCommit.author?.avatar_url || `https://ui-avatars.com/api/?name=${selectedCommit.commit.author.name}`} 
                                alt="Author" 
                                className="w-10 h-10 rounded-full border border-zinc-700"
                                referrerPolicy="no-referrer"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start">
                                  <h5 className="text-zinc-200 font-semibold text-sm truncate">{selectedCommit.commit.message}</h5>
                                  <span className="text-[10px] font-mono text-zinc-600 shrink-0">{new Date(selectedCommit.commit.author.date).toLocaleDateString()}</span>
                                </div>
                                <p className="text-xs text-zinc-500 mt-1">By {selectedCommit.commit.author.name} ({selectedCommit.sha.substring(0, 7)})</p>
                              </div>
                            </div>
                          </motion.div>
                        )}

                        <div className="flex justify-end">
                          <button
                            onClick={handleEvaluate}
                            disabled={isEvaluating || !selectedCommit}
                            className="group relative px-8 py-3 bg-orange-600 hover:bg-orange-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-semibold rounded-lg transition-all flex items-center gap-2 overflow-hidden"
                          >
                            {isEvaluating ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Analyzing Repo...</span>
                              </>
                            ) : (
                              <>
                                <span>Evaluate Repository</span>
                                <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="relative group">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-orange-500 to-zinc-800 rounded-xl blur opacity-20 group-hover:opacity-40 transition duration-1000 group-hover:duration-200"></div>
                    <div 
                      className={`relative bg-[#111111] border rounded-xl overflow-hidden transition-colors duration-300 ${isDragging ? 'border-orange-500 bg-orange-500/5' : 'border-zinc-800'}`}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                    >
                      <AnimatePresence>
                        {isDragging && (
                          <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 z-10 bg-orange-500/10 backdrop-blur-sm flex flex-col items-center justify-center pointer-events-none"
                          >
                            <div className="w-16 h-16 bg-orange-600 rounded-full flex items-center justify-center mb-4 shadow-xl shadow-orange-500/20">
                              <Upload className="w-8 h-8 text-white animate-bounce" />
                            </div>
                            <p className="text-xl font-serif italic text-orange-500">Drop files to upload</p>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50">
                        <div className="flex gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-zinc-700"></div>
                          <div className="w-2 h-2 rounded-full bg-zinc-700"></div>
                          <div className="w-2 h-2 rounded-full bg-zinc-700"></div>
                        </div>
                        <div className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">
                          Project_Source_Input
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileUpload}
                            multiple
                            className="hidden"
                          />
                        </div>
                      </div>

                      {evalMode === 'comparison' ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6">
                          <div className="space-y-2">
                            <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                              <FileCode className="w-3 h-3" /> Project A
                            </label>
                            <textarea
                              value={projectInput}
                              onChange={(e) => setProjectInput(e.target.value)}
                              placeholder="Paste Project A code here..."
                              className="w-full h-80 p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl text-zinc-300 font-mono text-sm focus:outline-none focus:border-orange-500 transition-colors resize-none placeholder:text-zinc-700"
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                              <FileCode className="w-3 h-3" /> Project B
                            </label>
                            <textarea
                              value={projectBInput}
                              onChange={(e) => setProjectBInput(e.target.value)}
                              placeholder="Paste Project B code here..."
                              className="w-full h-80 p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl text-zinc-300 font-mono text-sm focus:outline-none focus:border-orange-500 transition-colors resize-none placeholder:text-zinc-700"
                            />
                          </div>
                        </div>
                      ) : (
                        <>
                          {/* Drop Zone Area */}
                          <div className="px-6 pt-6">
                            <div 
                              onClick={() => fileInputRef.current?.click()}
                              className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 transition-all cursor-pointer group ${isDragging ? 'border-orange-500 bg-orange-500/10' : 'border-zinc-800 hover:border-zinc-700 bg-zinc-900/30'}`}
                            >
                              <div className="w-12 h-12 rounded-full bg-zinc-900 flex items-center justify-center group-hover:scale-110 transition-transform border border-zinc-800">
                                <Upload className={`w-6 h-6 ${isDragging ? 'text-orange-500' : 'text-zinc-500 group-hover:text-orange-500'}`} />
                              </div>
                              <div className="text-center">
                                <p className="text-sm text-zinc-400 font-serif italic">Drag & drop project files here</p>
                                <p className="text-[10px] text-zinc-600 font-mono uppercase tracking-widest mt-1">Supports multiple source files</p>
                              </div>
                            </div>
                          </div>

                          <div className="relative flex items-center px-6 py-4">
                            <div className="flex-grow border-t border-zinc-800"></div>
                            <span className="px-4 text-[10px] font-mono text-zinc-700 uppercase tracking-[0.3em]">OR PASTE CODE</span>
                            <div className="flex-grow border-t border-zinc-800"></div>
                          </div>

                          <textarea
                            value={projectInput}
                            onChange={(e) => setProjectInput(e.target.value)}
                            placeholder="Paste your code, file tree, or project description here..."
                            className="w-full h-60 p-6 bg-transparent text-zinc-300 font-mono text-sm focus:outline-none resize-none placeholder:text-zinc-700"
                          />
                        </>
                      )}
                      
                      {/* File List */}
                      <AnimatePresence>
                        {uploadedFiles.length > 0 && (
                          <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="px-6 pb-4 space-y-4"
                          >
                            <div className="flex items-center justify-between">
                              <h4 className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                                <FileCode className="w-3 h-3" /> Uploaded Files ({uploadedFiles.length})
                              </h4>
                              <button 
                                onClick={clearAllFiles}
                                className="text-[10px] font-mono text-zinc-600 hover:text-red-500 transition-colors uppercase tracking-widest flex items-center gap-1"
                              >
                                <X className="w-3 h-3" /> Clear All
                              </button>
                            </div>
                            
                            <div className="space-y-3">
                              {uploadedFiles.map((file) => (
                                <div 
                                  key={file.id}
                                  className="group border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/40 hover:border-zinc-700 transition-all"
                                >
                                  <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/60">
                                    <div className="flex items-center gap-2">
                                      <div className="w-6 h-6 rounded bg-orange-500/10 flex items-center justify-center">
                                        <FileCode className="w-3.5 h-3.5 text-orange-500" />
                                      </div>
                                      <span className="text-[11px] font-mono text-zinc-300 truncate max-w-[300px]">{file.name}</span>
                                    </div>
                                    <button 
                                      onClick={() => removeFile(file.id)}
                                      className="text-zinc-600 hover:text-red-500 transition-colors p-1 flex items-center gap-1 group/remove"
                                      title="Remove file"
                                    >
                                      <span className="text-[9px] font-mono uppercase tracking-tighter opacity-0 group-hover/remove:opacity-100 transition-opacity">Remove</span>
                                      <X className="w-4 h-4" />
                                    </button>
                                  </div>
                                  <div className="p-4 bg-black/20">
                                    <div className="flex items-center gap-2 mb-2">
                                      <div className="h-[1px] flex-grow bg-zinc-800/50"></div>
                                      <span className="text-[8px] font-mono text-zinc-600 uppercase tracking-widest">Content Preview</span>
                                      <div className="h-[1px] flex-grow bg-zinc-800/50"></div>
                                    </div>
                                    <pre className="text-[10px] font-mono text-zinc-500 whitespace-pre-wrap break-all leading-relaxed line-clamp-4">
                                      {file.preview}
                                      {file.content.split('\n').length > 5 && "\n..."}
                                    </pre>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <div className="p-4 border-t border-zinc-800 bg-zinc-900/30 flex justify-between items-center">
                        <div className="text-[10px] text-zinc-600 font-mono flex items-center gap-2">
                          <Shield className="w-3 h-3" />
                          Encrypted Session
                        </div>
                        <button
                          id="btn-evaluate-project"
                          onClick={handleEvaluate}
                          disabled={isEvaluating || (!projectInput.trim() && uploadedFiles.length === 0)}
                          className="group relative px-8 py-3 bg-orange-600 hover:bg-orange-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white font-semibold rounded-lg transition-all flex items-center gap-2 overflow-hidden"
                        >
                          {isEvaluating ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Analyzing...</span>
                            </>
                          ) : (
                            <>
                              <span>Begin Evaluation</span>
                              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Specialized Parallel API Keys Status Grid */}
            <AnimatePresence>
              {isEvaluating && (
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-6 p-5 bg-zinc-950/90 border border-zinc-850 rounded-xl space-y-4 shadow-xl relative overflow-hidden"
                >
                  <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-orange-500/50 to-transparent" />
                  
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-900 pb-3">
                    <div className="text-[10px] font-mono text-orange-500 uppercase tracking-widest flex items-center gap-2">
                      <span className="w-2 h-2 bg-orange-500 rounded-full animate-ping" />
                      Dynamic Workload Division
                    </div>
                    <div className="text-[10px] font-mono text-zinc-400">
                      Concurrently running across 3 API Keys
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* Key 1 Block */}
                    <div className={`p-3 rounded-lg border transition-all duration-300 ${
                      evaluatorStates.architect === 'working' 
                        ? 'bg-zinc-900/40 border-orange-500/25 ring-1 ring-orange-500/10' 
                        : evaluatorStates.architect === 'done'
                        ? 'bg-zinc-900/20 border-emerald-500/20'
                        : 'bg-zinc-900/10 border-zinc-900'
                    }`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Expert Key 1</span>
                        {evaluatorStates.architect === 'working' ? (
                          <div className="w-2.5 h-2.5 bg-orange-500 rounded-full animate-pulse" />
                        ) : evaluatorStates.architect === 'done' ? (
                          <span className="text-emerald-500 text-xs font-bold font-mono">✓ Done</span>
                        ) : evaluatorStates.architect === 'failed' ? (
                          <span className="text-rose-500 text-xs font-bold font-mono">✗ Fail</span>
                        ) : (
                          <div className="w-2 h-2 bg-zinc-700 rounded-full" />
                        )}
                      </div>
                      <div className="text-[10px] font-semibold text-zinc-200">Architect & Logic</div>
                      <p className="text-[9px] text-zinc-500 mt-1 leading-tight">Reviewing module design patterns, decoupling & readability standards.</p>
                      <div className="mt-2 text-[8px] font-mono text-zinc-600 uppercase">
                        {evaluatorStates.architect === 'working' ? 'Scanning structure...' : evaluatorStates.architect === 'done' ? 'Completed' : 'Pending'}
                      </div>
                    </div>

                    {/* Key 2 Block */}
                    <div className={`p-3 rounded-lg border transition-all duration-300 ${
                      evaluatorStates.security === 'working' 
                        ? 'bg-zinc-900/40 border-orange-500/25 ring-1 ring-orange-500/10' 
                        : evaluatorStates.security === 'done'
                        ? 'bg-zinc-900/20 border-emerald-500/20'
                        : 'bg-zinc-900/10 border-zinc-900'
                    }`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Expert Key 2</span>
                        {evaluatorStates.security === 'working' ? (
                          <div className="w-2.5 h-2.5 bg-orange-500 rounded-full animate-pulse" />
                        ) : evaluatorStates.security === 'done' ? (
                          <span className="text-emerald-500 text-xs font-bold font-mono">✓ Done</span>
                        ) : evaluatorStates.security === 'failed' ? (
                          <span className="text-rose-500 text-xs font-bold font-mono">✗ Fail</span>
                        ) : (
                          <div className="w-2 h-2 bg-zinc-700 rounded-full" />
                        )}
                      </div>
                      <div className="text-[10px] font-semibold text-zinc-200">Security & Speed</div>
                      <p className="text-[9px] text-zinc-500 mt-1 leading-tight">Analyzing code vulnerability, runtime complexity, and performance.</p>
                      <div className="mt-2 text-[8px] font-mono text-zinc-600 uppercase">
                        {evaluatorStates.security === 'working' ? 'Benchmarking CPU...' : evaluatorStates.security === 'done' ? 'Completed' : 'Pending'}
                      </div>
                    </div>

                    {/* Key 3 Block */}
                    <div className={`p-3 rounded-lg border transition-all duration-300 ${
                      evaluatorStates.pm === 'working' 
                        ? 'bg-zinc-900/40 border-orange-500/25 ring-1 ring-orange-500/10' 
                        : evaluatorStates.pm === 'done'
                        ? 'bg-zinc-900/20 border-emerald-500/20'
                        : 'bg-zinc-900/10 border-zinc-900'
                    }`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Expert Key 3</span>
                        {evaluatorStates.pm === 'working' ? (
                          <div className="w-2.5 h-2.5 bg-orange-500 rounded-full animate-pulse" />
                        ) : evaluatorStates.pm === 'done' ? (
                          <span className="text-emerald-500 text-xs font-bold font-mono">✓ Done</span>
                        ) : evaluatorStates.pm === 'failed' ? (
                          <span className="text-rose-500 text-xs font-bold font-mono">✗ Fail</span>
                        ) : (
                          <div className="w-2 h-2 bg-zinc-700 rounded-full" />
                        )}
                      </div>
                      <div className="text-[10px] font-semibold text-zinc-200">UX & PM Alignment</div>
                      <p className="text-[9px] text-zinc-500 mt-1 leading-tight">Evaluating recruiter appeal, UX layout, and feature usefulness.</p>
                      <div className="mt-2 text-[8px] font-mono text-zinc-600 uppercase">
                        {evaluatorStates.pm === 'working' ? 'Critiquing interfaces...' : evaluatorStates.pm === 'done' ? 'Completed' : 'Pending'}
                      </div>
                    </div>

                    {/* Synthesizer Block */}
                    <div className={`p-3 rounded-lg border transition-all duration-300 ${
                      evaluatorStates.synthesizer === 'working' 
                        ? 'bg-zinc-900/40 border-orange-500/25 ring-1 ring-orange-500/10' 
                        : evaluatorStates.synthesizer === 'done'
                        ? 'bg-zinc-900/20 border-emerald-500/20'
                        : 'bg-zinc-900/10 border-zinc-900'
                    }`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[9px] font-bold text-zinc-450 uppercase tracking-wider">Synthesizer</span>
                        {evaluatorStates.synthesizer === 'working' ? (
                          <div className="w-2.5 h-2.5 bg-orange-500 rounded-full animate-pulse" />
                        ) : evaluatorStates.synthesizer === 'done' ? (
                          <span className="text-emerald-500 text-xs font-bold font-mono">✓ Done</span>
                        ) : (
                          <div className="w-2 h-2 bg-zinc-750 rounded-full" />
                        )}
                      </div>
                      <div className="text-[10px] font-semibold text-zinc-200">Lead Evaluator</div>
                      <p className="text-[9px] text-zinc-500 mt-1 leading-tight">Stitching assessments combined into a single pristine report.</p>
                      <div className="mt-2 text-[8px] font-mono text-zinc-600 uppercase">
                        {evaluatorStates.synthesizer === 'working' ? 'Merging reports...' : evaluatorStates.synthesizer === 'done' ? 'Completed' : 'Queued'}
                      </div>
                    </div>
                  </div>

                  <div className="bg-zinc-900/40 border border-zinc-900 p-3 rounded-lg flex items-center gap-3">
                    <div className="w-2 h-2 bg-orange-500 rounded-full animate-ping" />
                    <p className="text-xs font-mono text-zinc-400">
                      Live status ticker: <span className="text-orange-400 font-bold italic">{loadingSteps[loadingStep]}</span>
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Results Section */}
            <AnimatePresence>
              {evaluationResult && (
                <motion.div 
                  ref={resultsRef}
                  initial={{ opacity: 0, y: 40 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-8"
                >
                  {/* Score Card Section */}
                  <div className="p-8 bg-[#111111] border border-zinc-800 rounded-xl relative overflow-hidden group glass-effect">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                      <Award className="w-32 h-32 text-orange-500" />
                    </div>
                    
                    <div className="relative z-10">
                      <div className="flex items-center justify-between mb-8">
                        <div>
                          <h3 className="text-2xl font-serif italic text-white flex items-center gap-3">
                            <File className="w-6 h-6 text-orange-500" />
                            Project Evaluation Report
                          </h3>
                          <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mt-1">Formal A4 Report Contents</p>
                        </div>
                        {!reportData && (
                          <button
                            id="btn-generate-scorecard"
                            onClick={generateScoreCard}
                            disabled={isGeneratingScoreCard}
                            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 disabled:bg-zinc-800 text-white text-[10px] font-mono uppercase tracking-widest rounded-lg transition-all flex items-center gap-2"
                          >
                            {isGeneratingScoreCard ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                            Generate Report
                          </button>
                        )}
                      </div>

                      {reportData ? (
                        <motion.div 
                          ref={reportRef}
                          id="evaluation-report"
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="bg-white border border-zinc-200 rounded-2xl p-10 max-w-4xl mx-auto shadow-2xl text-zinc-900 font-sans"
                        >
                          {/* Report Header */}
                          <div className="flex justify-between items-start border-b-2 border-zinc-100 pb-8 mb-8">
                            <div>
                              <div className="text-[10px] font-mono text-orange-600 uppercase tracking-[0.3em] font-bold mb-2">Professional Project Audit</div>
                              <h2 className="text-3xl font-black tracking-tighter text-zinc-900">{reportData.projectTitle}</h2>
                              <p className="text-zinc-500 text-xs mt-1">Generated by Elite Evaluator Intelligence • {new Date().toLocaleDateString()}</p>
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest mb-1">Final Score</div>
                              <div className="text-5xl font-black text-orange-600 italic tracking-tighter leading-none">
                                <AnimatedCounter value={reportData.finalScore} suffix="/10" />
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                            {/* Left Column: Summary & Pillars */}
                            <div className="md:col-span-2 space-y-10">
                              <section>
                                <h4 className="text-[10px] font-mono text-zinc-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                  <ClipboardCheck className="w-3 h-3 text-orange-500" /> Executive Summary
                                </h4>
                                <p className="text-sm text-zinc-700 leading-relaxed font-medium">
                                  {reportData.executiveSummary}
                                </p>
                              </section>

                              <section>
                                <div className="flex justify-between items-center mb-6">
                                  <h4 className="text-[10px] font-mono text-zinc-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                    <BarChart3 className="w-3 h-3 text-orange-500" /> Dimension Analysis
                                  </h4>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center bg-zinc-50 p-6 rounded-2xl border border-zinc-100">
                                  <div className="h-[200px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                      <RadarChart key={`radar-report-${reportData?.projectTitle || 'none'}`} cx="50%" cy="50%" outerRadius="70%" data={reportData.pillars.map((p: any) => ({ subject: p.name, A: p.score * reportMultiplier, fullMark: 10 }))}>
                                        <PolarGrid stroke="#e4e4e7" />
                                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#71717a', fontSize: 8, fontWeight: 600 }} />
                                        <PolarRadiusAxis angle={30} domain={[0, 10]} tick={false} axisLine={false} />
                                        <Radar
                                          name="Score"
                                          dataKey="A"
                                          stroke="#ea580c"
                                          fill="#f97316"
                                          fillOpacity={0.5}
                                        />
                                      </RadarChart>
                                    </ResponsiveContainer>
                                  </div>
                                  <div className="space-y-3">
                                    {reportData.pillars.slice(0, 3).map((pillar: any, idx: number) => (
                                      <div key={idx} className="flex justify-between items-center">
                                        <span className="text-[10px] font-bold text-zinc-600 uppercase">{pillar.name}</span>
                                        <span className="text-[10px] font-mono text-orange-600 font-bold">
                                          <AnimatedCounter value={pillar.score} decimals={0} suffix="/10" />
                                        </span>
                                      </div>
                                    ))}
                                    <div className="pt-2 border-t border-zinc-200">
                                      <p className="text-[9px] text-zinc-400 leading-tight">Dimensions normalized against top industry benchmarks for {reportData.skill_level || 'professional'} developers.</p>
                                    </div>
                                  </div>
                                </div>
                              </section>

                              <section>
                                <h4 className="text-[10px] font-mono text-zinc-400 uppercase tracking-[0.2em] mb-4">Detailed Pillar Breakdown</h4>
                                <div className="space-y-4">
                                  {reportData.pillars.map((pillar: any, idx: number) => (
                                    <div key={idx} className="group p-4 hover:bg-zinc-50 rounded-xl transition-colors border border-transparent hover:border-zinc-100">
                                      <div className="flex justify-between items-end mb-1">
                                        <span className="text-xs font-bold text-zinc-800 uppercase tracking-tight">{pillar.name}</span>
                                        <span className="text-xs font-mono font-bold text-orange-600">
                                          <AnimatedCounter value={pillar.score} decimals={0} suffix="/10" />
                                        </span>
                                      </div>
                                      <p className="text-[11px] text-zinc-500 leading-normal italic">{pillar.analysis}</p>
                                    </div>
                                  ))}
                                </div>
                              </section>

                              <section className="pt-6 border-t border-zinc-100">
                                <h4 className="text-[10px] font-mono text-zinc-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                  <TrendingUp className="w-3 h-3 text-orange-500" /> Strategic Roadmap
                                </h4>
                                <div className="grid grid-cols-1 gap-3">
                                  {reportData.roadmap.map((step: string, idx: number) => (
                                    <div key={idx} className="flex gap-3 items-start p-3 bg-zinc-50 rounded-xl border border-zinc-100">
                                      <div className="w-5 h-5 rounded-full bg-orange-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">{idx + 1}</div>
                                      <p className="text-xs text-zinc-700 font-medium">{step}</p>
                                    </div>
                                  ))}
                                </div>
                              </section>
                            </div>

                            {/* Right Column: SWOT & Risks */}
                            <div className="space-y-10">
                              <section className="p-5 bg-zinc-900 rounded-2xl text-white">
                                <h4 className="text-[10px] font-mono text-zinc-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                                  <Zap className="w-3 h-3 text-orange-500" /> SWOT Matrix
                                </h4>
                                <div className="space-y-6">
                                  <div>
                                    <div className="text-[9px] uppercase tracking-widest text-green-400 mb-2 font-bold flex items-center gap-1.5">
                                      <CheckCircle2 className="w-2.5 h-2.5" /> Strengths
                                    </div>
                                    <ul className="space-y-1.5">
                                      {reportData.swot.strengths.map((s: string, i: number) => (
                                        <li key={i} className="text-[10px] text-zinc-300 leading-tight">• {s}</li>
                                      ))}
                                    </ul>
                                  </div>
                                  <div>
                                    <div className="text-[9px] uppercase tracking-widest text-red-400 mb-2 font-bold flex items-center gap-1.5">
                                      <AlertTriangle className="w-2.5 h-2.5" /> Weaknesses
                                    </div>
                                    <ul className="space-y-1.5">
                                      {reportData.swot.weaknesses.map((w: string, i: number) => (
                                        <li key={i} className="text-[10px] text-zinc-300 leading-tight">• {w}</li>
                                      ))}
                                    </ul>
                                  </div>
                                  <div>
                                    <div className="text-[9px] uppercase tracking-widest text-blue-400 mb-2 font-bold">Opportunities</div>
                                    <ul className="space-y-1.5">
                                      {reportData.swot.opportunities.map((o: string, i: number) => (
                                        <li key={i} className="text-[10px] text-zinc-400 leading-tight">• {o}</li>
                                      ))}
                                    </ul>
                                  </div>
                                </div>
                              </section>

                              <section>
                                <h4 className="text-[10px] font-mono text-zinc-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                  <Shield className="w-3 h-3 text-red-500" /> Critical Risks
                                </h4>
                                <div className="space-y-3">
                                  {reportData.criticalRisks.map((risk: string, idx: number) => (
                                    <div key={idx} className="flex gap-2 items-start text-xs text-zinc-600 font-medium">
                                      <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0" />
                                      {risk}
                                    </div>
                                  ))}
                                </div>
                              </section>

                              <div id="report-action-buttons" className="pt-10 flex flex-col gap-3">
                                <button 
                                  onClick={downloadPDF}
                                  disabled={isGeneratingScoreCard}
                                  className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-orange-600 hover:bg-orange-500 text-white rounded-xl shadow-lg shadow-orange-600/20 transition-all font-bold text-xs uppercase tracking-widest"
                                >
                                  {isGeneratingScoreCard ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                                  {isGeneratingScoreCard ? "Preparing PDF..." : "Export as PDF"}
                                </button>
                                
                                <button 
                                  onClick={() => {
                                    navigator.clipboard.writeText(JSON.stringify(reportData, null, 2));
                                    setCopied(true);
                                    setTimeout(() => setCopied(false), 2000);
                                  }}
                                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 rounded-xl transition-all font-bold text-[10px] uppercase tracking-widest"
                                >
                                  <Copy className="w-3 h-3" />
                                  Copy Data
                                </button>
                              </div>
                            </div>
                          </div>
                          
                          {/* Footer */}
                          <div className="mt-12 pt-6 border-t border-zinc-100 flex justify-between items-center text-[10px] text-zinc-400 font-mono italic">
                            <span>Strictly Confidential • AI-Powered Comprehensive Analysis</span>
                            <span>Page 01 // 01</span>
                          </div>
                        </motion.div>
                      ) : (
                        <div className="text-center py-12 border border-dashed border-zinc-800 rounded-xl bg-zinc-900/20">
                          <p className="text-xs text-zinc-600 font-mono uppercase tracking-widest italic">Formal evaluation report ready for generation</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Score Summary Header */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 p-8 bg-[#111111] border border-zinc-800 rounded-xl flex flex-col justify-center">
                      <div className="flex items-center gap-4 mb-6">
                        <div className="w-16 h-16 bg-orange-600/20 rounded-2xl flex items-center justify-center border border-orange-500/30">
                          <Trophy className="w-8 h-8 text-orange-500" />
                        </div>
                        <div>
                          <h3 className="text-3xl font-serif italic text-white">Project Score</h3>
                          <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Expert Panel Consensus</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg text-center">
                          <div className="text-3xl font-bold text-orange-500 mb-1">
                            {parsedScores?.final_score ? (
                              <AnimatedCounter value={parsedScores.final_score} decimals={1} />
                            ) : (
                              'N/A'
                            )}
                          </div>
                          <div className="text-[8px] uppercase tracking-widest text-zinc-500">Final Rating</div>
                        </div>
                        <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg text-center">
                          <div className="text-sm font-bold text-zinc-200 mb-1 truncate px-1">{parsedScores?.skill_level || 'N/A'}</div>
                          <div className="text-[8px] uppercase tracking-widest text-zinc-500">Skill Level</div>
                        </div>
                        <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg text-center">
                          <div className={`text-sm font-bold mb-1 ${parsedScores?.hiring_verdict === 'Hire' ? 'text-green-500' : parsedScores?.hiring_verdict === 'Maybe' ? 'text-orange-500' : 'text-red-500'}`}>
                            {parsedScores?.hiring_verdict || 'N/A'}
                          </div>
                          <div className="text-[8px] uppercase tracking-widest text-zinc-500">Verdict</div>
                        </div>
                        <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg text-center">
                          <div className="text-sm font-bold text-zinc-200 mb-1">
                            {parsedScores?.scores ? (
                              <AnimatedCounter value={Object.values(parsedScores.scores).filter((s: any) => s >= 8).length} decimals={0} />
                            ) : (
                              0
                            )}
                          </div>
                          <div className="text-[8px] uppercase tracking-widest text-zinc-500">Elite Traits</div>
                        </div>
                      </div>
                    </div>

                    <div className="p-6 bg-[#111111] border border-zinc-800 rounded-xl h-[340px] flex flex-col">
                      <h4 className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 mb-4 text-center shrink-0">Dimension Analysis</h4>
                      <div className="flex-grow min-h-0">
                        {parsedScores?.scores ? (
                          <ResponsiveContainer width="100%" height="100%" debounce={100}>
                            <RadarChart key={`radar-score-${parsedScores?.final_score || 0}-${Object.keys(parsedScores?.scores || {}).length}`} cx="50%" cy="50%" outerRadius="70%" data={Object.entries(parsedScores.scores).map(([key, value]) => ({ subject: key, A: (value as number) * scoreMultiplier, fullMark: 10 }))}>
                              <PolarGrid stroke="#27272a" />
                              <PolarAngleAxis dataKey="subject" tick={{ fill: '#71717a', fontSize: 10 }} />
                              <PolarRadiusAxis angle={30} domain={[0, 10]} tick={{ fill: '#3f3f46', fontSize: 8 }} axisLine={false} />
                              <Radar
                                name="Project"
                                dataKey="A"
                                stroke="#f97316"
                                fill="#f97316"
                                fillOpacity={0.5}
                              />
                            </RadarChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-full flex items-center justify-center text-zinc-700 italic text-[10px]">Chart data unavailable</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-2xl font-serif italic text-orange-500">Full Evaluation Report</h3>
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={speakEvaluation}
                        className={`flex items-center gap-2 text-xs transition-colors ${isSpeaking ? 'text-orange-500 animate-pulse' : 'text-zinc-500 hover:text-zinc-300'}`}
                        title={isSpeaking ? "Stop Speaking" : "Listen to Evaluation"}
                      >
                        {isSpeaking ? <Square className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                        {isSpeaking ? 'Stop' : 'Listen'}
                      </button>
                      <button 
                        onClick={downloadMarkdown}
                        className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                      >
                        <Download className="w-4 h-4" />
                        MD
                      </button>
                      <button 
                        onClick={copyToClipboard}
                        className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                      >
                        {copied ? <ClipboardCheck className="w-4 h-4 text-green-500" /> : <Clipboard className="w-4 h-4" />}
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <div className="prose prose-invert prose-orange max-w-none p-8 rounded-xl shadow-2xl glass-effect">
                    <div className="markdown-body">
                      <Markdown>{evaluationResult}</Markdown>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8">
                    <div className="p-6 rounded-xl glass-effect">
                      <h4 className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-4 flex items-center gap-2">
                        <UserCheck className="w-3 h-3" /> Hiring Verdict
                      </h4>
                      <p className="text-sm text-zinc-400 italic">
                        {parsedScores?.hiring_verdict === 'Hire' ? 'Highly recommended for the role. Strong technical foundation.' : 
                         parsedScores?.hiring_verdict === 'Maybe' ? 'Potential exists, but requires significant refinement in core areas.' : 
                         'Not ready for professional placement. Focus on the upgrade plan below.'}
                      </p>
                    </div>
                    <div className="p-6 rounded-xl glass-effect">
                      <h4 className="text-xs font-mono uppercase tracking-widest text-zinc-500 mb-4 flex items-center gap-2">
                        <TrendingUp className="w-3 h-3" /> Growth Roadmap
                      </h4>
                      <p className="text-sm text-zinc-400 italic">
                        Focus on improving your {parsedScores?.scores ? Object.entries(parsedScores.scores).sort((a: any, b: any) => a[1] - b[1])[0][0] : 'weakest areas'} to reach the next skill level.
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Placeholder / Empty State */}
        {!evaluationResult && !isEvaluating && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 opacity-40 grayscale hover:grayscale-0 transition-all duration-700">
            {[
              { icon: Brain, title: "Deep Analysis", desc: "Beyond syntax: logic and architecture." },
              { icon: AlertTriangle, title: "Strict Scoring", desc: "Honest ratings based on industry standards." },
              { icon: Rocket, title: "Industry Plan", desc: "Actionable roadmap for professional growth." }
            ].map((item, i) => (
              <div key={i} className="p-6 border border-zinc-800 rounded-xl bg-zinc-900/20">
                <item.icon className="w-6 h-6 text-orange-500 mb-4" />
                <h4 className="text-sm font-semibold mb-2">{item.title}</h4>
                <p className="text-xs text-zinc-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        )}

        {/* Expert Panel Section */}
        <section className="mt-24 mb-12">
          <h3 className="text-xs font-mono uppercase tracking-[0.4em] text-zinc-600 text-center mb-12">The Expert Panel</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { role: "Senior Engineer", icon: Code2, focus: "Patterns & Refactoring" },
              { role: "System Architect", icon: Cpu, focus: "Scalability & Infrastructure" },
              { role: "FAANG Interviewer", icon: Terminal, focus: "Logic & Edge Cases" },
              { role: "Product Manager", icon: Globe, focus: "Viability & UX" },
              { role: "Open Source Reviewer", icon: Zap, focus: "Standards & Reusability" }
            ].map((expert, i) => (
              <div key={i} className="p-4 bg-zinc-900/20 border border-zinc-800/50 rounded-xl hover:border-orange-500/30 transition-all text-center group">
                <expert.icon className="w-5 h-5 text-zinc-600 group-hover:text-orange-500 mx-auto mb-3 transition-colors" />
                <h5 className="text-[10px] font-bold text-zinc-300 mb-1">{expert.role}</h5>
                <p className="text-[8px] text-zinc-600 uppercase tracking-widest">{expert.focus}</p>
              </div>
            ))}
          </div>
        </section>
          </>
        )}
      </main>

      <footer className="mt-24 border-t border-zinc-800/50 py-12">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-600">
            ELITE EVALUATOR v1.0.4
          </p>
        </div>
      </footer>

      <style>{`
        .glass-effect {
          background: rgba(17, 17, 17, 0.7) !important;
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
        }
        .markdown-body h1, .markdown-body h2, .markdown-body h3 {
          font-family: 'Inter', sans-serif;
          font-weight: 800;
          letter-spacing: -0.05em;
          text-transform: uppercase;
          color: #fff;
          margin-top: 2.5rem;
          margin-bottom: 1.25rem;
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }
        .markdown-body h1 {
          font-size: 2rem;
          color: #f97316;
          border-bottom: 2px solid rgba(249, 115, 22, 0.2);
          padding-bottom: 0.5rem;
        }
        .markdown-body h2 {
          font-size: 1.5rem;
          border-left: 4px solid #f97316;
          padding-left: 1rem;
        }
        .markdown-body h3 {
          font-size: 1.1rem;
          color: #a1a1aa;
        }
        .markdown-body p {
          margin-bottom: 1.25rem;
          line-height: 1.8;
          color: #a1a1aa;
          font-size: 1rem;
        }
        .markdown-body ul, .markdown-body ol {
          margin-bottom: 1.5rem;
          padding-left: 1.25rem;
          color: #d4d4d8;
        }
        .markdown-body li {
          margin-bottom: 0.75rem;
          position: relative;
        }
        .markdown-body ul li::before {
          content: "—";
          position: absolute;
          left: -1.25rem;
          color: #f97316;
          font-weight: bold;
        }
        .markdown-body strong {
          color: #f97316;
          font-weight: 700;
        }
        .markdown-body blockquote {
          background: rgba(249, 115, 22, 0.05);
          border-left: 4px solid #f97316;
          padding: 1.5rem;
          border-radius: 0 0.75rem 0.75rem 0;
          font-style: italic;
          color: #e4e4e7;
          margin: 2rem 0;
        }
        .markdown-body code {
          background: #27272a;
          color: #fdba74;
          padding: 0.2rem 0.4rem;
          border-radius: 0.4rem;
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.85em;
        }
        .markdown-body pre {
          background: #000;
          padding: 1.5rem;
          border-radius: 0.75rem;
          overflow-x: auto;
          margin: 2rem 0;
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 10px 30px -10px rgba(0,0,0,0.5);
        }
        .markdown-body pre code {
          background: transparent;
          padding: 0;
          color: #d4d4d8;
        }
        .prose hr {
          border-top-color: rgba(255,255,255,0.05);
          margin: 3rem 0;
        }
      `}</style>
    </div>
  );
}
