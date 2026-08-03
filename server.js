/**
 * NextGPT - Express backend
 * Serves the static pages and proxies AI requests to OpenRouter.
 * The API key is ONLY read from process.env.OPENROUTER_API_KEY.
 */
require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-oss-20b:free";

/* ------------------------------------------------------------------ *
 * Security headers (helmet-like, no extra dependency)
 * ------------------------------------------------------------------ */
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  next();
});

app.use(cors());
app.use(express.json({ limit: "1mb" }));

/* ------------------------------------------------------------------ *
 * Simple in-memory rate limiting (example implementation)
 * ------------------------------------------------------------------ */
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 30;
const hits = new Map();

function rateLimit(req, res, next) {
  const ip =
    (req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    req.socket.remoteAddress ||
    "unknown";
  const now = Date.now();
  const entry = hits.get(ip) || { count: 0, start: now };

  if (now - entry.start > WINDOW_MS) {
    entry.count = 0;
    entry.start = now;
  }
  entry.count += 1;
  hits.set(ip, entry);

  if (entry.count > MAX_REQUESTS) {
    return res.status(429).json({
      error: "Too many requests. Please wait a moment and try again.",
    });
  }
  next();
}

/* ------------------------------------------------------------------ *
 * Input validation / sanitization
 * ------------------------------------------------------------------ */
const MAX_MESSAGE_LENGTH = 12000;
const MAX_MESSAGES = 40;

function sanitizeText(value) {
  if (typeof value !== "string") return "";
  return value
    .replace(/\u0000/g, "")
    .slice(0, MAX_MESSAGE_LENGTH)
    .trim();
}

function validateMessages(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { error: "`messages` must be a non-empty array." };
  }
  if (raw.length > MAX_MESSAGES) {
    return { error: `Too many messages (max ${MAX_MESSAGES}).` };
  }

  const allowed = new Set(["system", "user", "assistant"]);
  const messages = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") {
      return { error: "Each message must be an object." };
    }
    const role = allowed.has(item.role) ? item.role : "user";
    const content = sanitizeText(item.content);
    if (!content) return { error: "Message content cannot be empty." };
    messages.push({ role, content });
  }

  return { messages };
}

/* ------------------------------------------------------------------ *
 * Static pages
 * ------------------------------------------------------------------ */
app.use(
  express.static(path.join(__dirname), {
    extensions: ["html"],
    index: "index.html",
  })
);

const page = (file) => (req, res) => res.sendFile(path.join(__dirname, file));

app.get("/", page("index.html"));
app.get("/home", page("index.html"));
app.get("/auth", page("auth.html"));
app.get("/chat", page("chat.html"));
app.get("/workspace", page("workspace.html"));
app.get("/settings", page("settings.html"));

/* ------------------------------------------------------------------ *
 * Health / config
 * ------------------------------------------------------------------ */
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    model: MODEL,
    keyConfigured: Boolean(process.env.OPENROUTER_API_KEY),
  });
});

/* ------------------------------------------------------------------ *
 * AI proxy: POST /api/chat
 * Body: { messages: [{role, content}], stream?: boolean, temperature?: number }
 * ------------------------------------------------------------------ */
app.post("/api/chat", rateLimit, async (req, res) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error:
        "OPENROUTER_API_KEY is not configured on the server. Add it to your environment variables.",
    });
  }

  const { messages, error } = validateMessages(req.body && req.body.messages);
  if (error) return res.status(400).json({ error });

  const stream = req.body.stream !== false;
  const temperature =
    typeof req.body.temperature === "number" &&
    req.body.temperature >= 0 &&
    req.body.temperature <= 2
      ? req.body.temperature
      : 0.7;

  const origin =
    req.headers.origin ||
    (req.headers.host ? `https://${req.headers.host}` : "https://nextgpt.app");

  let upstream;
  try {
    upstream = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": origin,
        "X-Title": "NextGPT",
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature,
        stream,
      }),
    });
  } catch (err) {
    return res
      .status(502)
      .json({ error: "Could not reach the AI provider. Please try again." });
  }

  if (!upstream.ok) {
    let detail = "";
    try {
      detail = await upstream.text();
    } catch (_) {}
    let message = "The AI provider returned an error.";
    try {
      const parsed = JSON.parse(detail);
      if (parsed && parsed.error && parsed.error.message) message = parsed.error.message;
    } catch (_) {}
    return res.status(upstream.status).json({ error: message });
  }

  if (!stream) {
    const data = await upstream.json();
    const content =
      (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) ||
      "";
    return res.json({ content, model: data.model || MODEL });
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  if (typeof res.flushHeaders === "function") res.flushHeaders();

  try {
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let closed = false;
    req.on("close", () => {
      closed = true;
      try {
        reader.cancel();
      } catch (_) {}
    });

    while (!closed) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: "Stream interrupted." })}\n\n`);
  }
  res.write("data: [DONE]\n\n");
  res.end();
});

/* ------------------------------------------------------------------ *
 * Fallbacks
 * ------------------------------------------------------------------ */
app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Not found" });
  }
  res.status(404).sendFile(path.join(__dirname, "index.html"));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`NextGPT running on http://localhost:${PORT}`);
  });
}

module.exports = app;
