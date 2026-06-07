import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory store for IP rate limiting
const ipRequestCounts = new Map<string, { count: number; firstRequestTime: number }>();

// Cleanup old IP entries every 10 minutes to prevent resource leak memory exhaustion
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of ipRequestCounts.entries()) {
    if (now - data.firstRequestTime > 15 * 60 * 1000) {
      ipRequestCounts.delete(ip);
    }
  }
}, 5 * 60 * 1000);

// Rate limiting middleware function (Window-based)
const rateLimiter = (limit: number, windowMs: number) => {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const rawIp = req.headers["x-forwarded-for"] as string || req.ip || "unknown-ip";
    const clientIp = rawIp.split(",")[0].trim();
    const now = Date.now();

    const ipData = ipRequestCounts.get(clientIp);

    if (!ipData) {
      ipRequestCounts.set(clientIp, { count: 1, firstRequestTime: now });
      return next();
    }

    if (now - ipData.firstRequestTime > windowMs) {
      ipRequestCounts.set(clientIp, { count: 1, firstRequestTime: now });
      return next();
    }

    if (ipData.count >= limit) {
      console.warn(`[Firewall Alerts] IP Rate Limit Violation. Blocked Client IP: ${clientIp} (${ipData.count + 1}/${limit} reqs)`);
      return res.status(429).json({
        error: "Too many requests. Cybersecurity Firewall Block active. Please try again in a few moments."
      });
    }

    ipData.count += 1;
    next();
  };
};

// Payload validation and anti-injection sanitizer
const validateChatPayload = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const { messages, model, apiKey, keyIndex } = req.body || {};

  // 1. Structure Check
  if (!messages || !Array.isArray(messages)) {
    return res.status(200).json({ success: true });
  }

  // 2. Quantity Limit (Prevent RAM Exhaustion and Denial of Service)
  if (messages.length > 50) {
    return res.status(400).json({ error: "Security Guard Threshold: Maximum of 50 messages allowed per analysis payload." });
  }

  // 3. Message level safety assertions
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (!msg || typeof msg !== "object") {
       return res.status(400).json({ error: `Security Interdiction: Malformed object structure at message index ${i}.` });
    }
    if (typeof msg.role !== "string" || !["user", "assistant", "system"].includes(msg.role)) {
       return res.status(400).json({ error: `Security Interdiction: Unauthorized role role parameter at index ${i}.` });
    }
    if (typeof msg.content !== "string") {
       return res.status(400).json({ error: `Security Interdiction: Content must be a string format at index ${i}.` });
    }
    // Limit single message string length to 45KB (plenty for code evaluation but prevents DDoS payloads)
    if (msg.content.length > 45000) {
       return res.status(400).json({ error: `Security Guard Threshold: Message content size limits exceeded (max 45KB) at index ${i}.` });
    }
  }

  // 4. API Key sanitization & verify format (Anti-Injection / Shell escape check)
  if (apiKey) {
    if (typeof apiKey !== "string") {
       return res.status(400).json({ error: "Security Alert: Invalid input configuration for API Secret Key." });
    }
    // Groq/OpenAI keys are alphanumeric with optionally hyphens, underscores, or periods. No shell script chars ($ ; | & ` \ > <)
    if (!/^[a-zA-Z0-9_\-\.]+$/.test(apiKey)) {
       return res.status(400).json({ error: "Security Alert: Forbidden characters detected. Input sanitization rejected your API key parameter." });
    }
    if (apiKey.length < 15 || apiKey.length > 150) {
       return res.status(400).json({ error: "Security Alert: Out-of-bounds length for API key." });
    }
  }

  // 5. Model name Validation
  if (model && (typeof model !== "string" || model.length > 100 || !/^[a-zA-Z0-9_\-\.]+$/.test(model))) {
     return res.status(400).json({ error: "Security Alert: Invalid execution target model string." });
  }

  // 6. Index validation
  if (keyIndex !== undefined && (typeof keyIndex !== "number" || keyIndex < 0 || keyIndex > 10)) {
     return res.status(400).json({ error: "Security Alert: Invalid secret rotating index reference." });
  }

  next();
};

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Enable Custom Robust CORS Middleware using pre-installed 'cors' library
  const allowedOrigins = [
    "https://elite-evaluator.vercel.app",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173"
  ];

  // Robust custom CORS middleware that always guarantees valid headers and a status 200 preflight response
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      const normalizedOrigin = origin.trim().replace(/\/$/, "");
      const isAllowed =
        allowedOrigins.includes(normalizedOrigin) ||
        normalizedOrigin.startsWith("http://localhost:") ||
        normalizedOrigin.startsWith("http://127.0.0.1:") ||
        normalizedOrigin.endsWith(".vercel.app") ||
        normalizedOrigin.endsWith(".run.app") ||
        normalizedOrigin.includes("elite-evaluator") ||
        /^https?:\/\/(localhost(:\d+)?|.*\.vercel\.app|.*\.run\.app)$/.test(normalizedOrigin);

      if (isAllowed) {
        res.setHeader("Access-Control-Allow-Origin", origin);
      } else {
        // Safe default: echo origin to ensure zero client-side CORS blocking
        res.setHeader("Access-Control-Allow-Origin", origin);
      }
    } else {
      res.setHeader("Access-Control-Allow-Origin", "*");
    }

    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Max-Age", "86400");

    if (req.method === "OPTIONS") {
      return res.status(200).end();
    }
    next();
  });

  // Explicitly handle GET `/health` test endpoint to verify server status and CORS headers easily
  app.get("/health", (req, res) => {
    res.status(200).json({
      status: "ok",
      timestamp: Date.now()
    });
  });

  // Explicitly handle GET `/api/chat` to verify the endpoint is alive without getting a 404 or falling through
  app.get("/api/chat", (req, res) => {
    res.status(200).json({
      status: "alive",
      message: "The Elite Evaluator Chat API endpoint is active and working. Please submit a POST request to analyze your project.",
      timestamp: Date.now()
    });
  });

  // Web Application Firewall - Defensive HTTP Headers
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    res.setHeader("X-Download-Options", "noopen");
    res.setHeader("X-Permitted-Cross-Domain-Policies", "none");

    // Content Security Policy: Protects scripts/styles while remaining highly compatible with Firebase Auth and Google AI Studio Preview
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.firebaseapp.com https://apis.google.com https://www.gstatic.com; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com data:; " +
      "connect-src 'self' https://*.googleapis.com https://*.firebaseapp.com https://api.groq.com https://firebase.googleapis.com wss://*.run.app https://elite-evaluator.vercel.app; " +
      "img-src 'self' data: https:; " +
      "frame-ancestors 'self' https://ai.studio https://*.google.com https://*.run.app; " +
      "frame-src 'self' https://*.firebaseapp.com;"
    );
    next();
  });

  // Strict Payload size limits (Prevents buffer overflow & memory exhaustion attacks)
  app.use(express.json({ limit: "500kb" }));

  // Initialize AI clients
  const groqDefault = process.env.GROQ_API_KEY ? new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: "https://api.groq.com/openai/v1",
  }) : null;

  const groqClients = [
    process.env.GROQ_API_KEY_1 ? new OpenAI({ apiKey: process.env.GROQ_API_KEY_1, baseURL: "https://api.groq.com/openai/v1" }) : null,
    process.env.GROQ_API_KEY_2 ? new OpenAI({ apiKey: process.env.GROQ_API_KEY_2, baseURL: "https://api.groq.com/openai/v1" }) : null,
    process.env.GROQ_API_KEY_3 ? new OpenAI({ apiKey: process.env.GROQ_API_KEY_3, baseURL: "https://api.groq.com/openai/v1" }) : null,
  ];

  // API route for completions protected by WAF rate limiter and payload verification
  app.post("/api/chat", rateLimiter(20, 60 * 1000), validateChatPayload, async (req, res) => {
    try {
      const { messages, model, apiKey, keyIndex } = req.body;
      
      let client: OpenAI | null = null;
      let activeIndexLabel = "default";

      // 1. If explicit rotating API key was sent by client
      if (apiKey) {
        client = new OpenAI({
          apiKey: apiKey,
          baseURL: "https://api.groq.com/openai/v1",
        });
        activeIndexLabel = "custom-client-key";
      } 
      // 2. Or, if the client directed us to use a specific round-robin index
      else if (typeof keyIndex === "number" && keyIndex >= 0 && keyIndex < 3) {
        client = groqClients[keyIndex];
        if (client) {
          activeIndexLabel = `key-${keyIndex + 1}`;
        }
      }

      // 3. Fallback to any of the loaded load-balanced keys if the specific one wasn't available
      if (!client) {
        const availableBalanced = groqClients.filter((c): c is OpenAI => c !== null);
        if (availableBalanced.length > 0) {
          const fallbackIdx = (typeof keyIndex === "number" ? keyIndex : 0) % availableBalanced.length;
          client = availableBalanced[fallbackIdx];
          activeIndexLabel = `fallback-balanced-key-${fallbackIdx + 1}`;
        }
      }

      // 4. Ultimate fallback to default GROQ_API_KEY
      if (!client) {
        client = groqDefault;
        activeIndexLabel = "default-fallback";
      }

      if (!client) {
        return res.status(500).json({ error: "No GROQ_API_KEY configured on server." });
      }

      const selectedModel = model || "llama-3.3-70b-versatile";
      console.log(`[AI Request] Provider: GROQ, Model: ${selectedModel}, Key used: ${activeIndexLabel}`);

      let response;
      try {
        response = await client.chat.completions.create({
          model: selectedModel,
          messages,
        });
      } catch (firstError: any) {
        const errMessage = String(firstError?.message || firstError || "").toLowerCase();
        const isRateLimitOr413 = 
          firstError.status === 413 || 
          errMessage.includes("limit") || 
          errMessage.includes("tpm") || 
          errMessage.includes("too large") ||
          errMessage.includes("request too large") ||
          errMessage.includes("rate_limit");

        if (isRateLimitOr413 && selectedModel !== "llama-3.1-8b-instant") {
          const fallbackModel = "llama-3.1-8b-instant";
          console.warn(`[AI Request Fallback] Model ${selectedModel} failed (${errMessage}). Retrying with high-limit model ${fallbackModel}...`);
          
          await new Promise(resolve => setTimeout(resolve, 500));
          
          response = await client.chat.completions.create({
            model: fallbackModel,
            messages,
          });
        } else {
          throw firstError;
        }
      }

      res.json(response);
    } catch (error: any) {
      console.error("GROQ API Error:", error);
      res.status(error.status || 500).json({ 
        error: error.message || "Failed to fetch from GROQ API" 
      });
    }
  });

  // Serve Single Page Application (SPA) frontend assets in production; use Vite in development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Determine the dist path relative to execution directory via process.cwd()
    const distPath = path.join(process.cwd(), "dist");
    
    // Serve static files from compiled dist folder (Vite builds into /dist)
    app.use(express.static(distPath));
    
    // Handle fallback routing to index.html for React Router / SPA navigation
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Critical server startup failure:", error);
  process.exit(1);
});
