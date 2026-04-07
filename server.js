const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const fetch = require("node-fetch");
const rateLimit = require("express-rate-limit");
const { SYSTEM_PROMPT, KNOWLEDGE_BLOCK } = require("./prompts");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("."));
const chatLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: "För många förfrågningar. Försök igen om en stund." });
  },
});

function finalizeReply(text, maxChars = 520, maxSentences = 4) {
  if (!text || typeof text !== "string") return "";

  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";

  const sentenceParts = normalized.match(/[^.!?]+[.!?]+/g) || [];
  const uniqueSentences = [];
  const seen = new Set();
  for (const sentence of sentenceParts) {
    const key = sentence
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    uniqueSentences.push(sentence.trim());
  }
  let candidate = normalized;

  if (uniqueSentences.length > 0) {
    candidate = uniqueSentences.slice(0, maxSentences).join(" ").trim();
  }

  if (candidate.length > maxChars) {
    const short = candidate.slice(0, maxChars);
    const lastStop = Math.max(short.lastIndexOf("."), short.lastIndexOf("!"), short.lastIndexOf("?"));
    candidate = (lastStop > 40 ? short.slice(0, lastStop + 1) : short).trim();
  }

  if (!/[.!?]$/.test(candidate)) {
    const lastStop = Math.max(candidate.lastIndexOf("."), candidate.lastIndexOf("!"), candidate.lastIndexOf("?"));
    candidate = (lastStop > 0 ? candidate.slice(0, lastStop + 1) : `${candidate}.`).trim();
  }

  return candidate;
}

app.post("/api/chat", chatLimiter, async (req, res) => {
  const message = (req.body && (req.body.message || req.body.prompt || req.body.text))?.trim();
  const incomingHistory = req.body?.history;

  if (!message) return res.status(400).json({ error: "Inget meddelande mottaget" });

  try {
    let validatedHistory = null;
    if (
      Array.isArray(incomingHistory) &&
      incomingHistory.every(
        (item) =>
          item &&
          (item.role === "user" || item.role === "assistant") &&
          typeof item.content === "string"
      )
    ) {
      validatedHistory = incomingHistory.map((item) => ({
        role: item.role,
        content: item.content,
      }));
    }

    // Cap history to avoid huge payloads
    if (validatedHistory && validatedHistory.length > 12) {
      validatedHistory = validatedHistory.slice(-12);
    }

    if (validatedHistory) {
      validatedHistory = validatedHistory.map((item) => ({
        role: item.role,
        content: item.content.slice(0, 800),
      }));
    }

    let messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "system", content: KNOWLEDGE_BLOCK },
    ];

    if (validatedHistory && validatedHistory.length > 0) {
      messages = messages.concat(validatedHistory);
      const hasLatestUser = validatedHistory.some(
        (item) => item.role === "user" && item.content.trim() === message
      );
      if (!hasLatestUser) {
        messages.push({ role: "user", content: message });
      }
    } else {
      messages.push({ role: "user", content: message });
    }

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages,
        temperature: 0.15,
        max_tokens: 320,
      }),
    });

    const data = await groqRes.json();
    if (!groqRes.ok) {
      console.error("Groq API-fel:", {
        status: groqRes.status,
        error: data?.error || data?.message || "Okänt fel",
      });
      return res.status(502).json({ error: "AI-tjänsten svarade med fel." });
    }

    const rawReply = data?.choices?.[0]?.message?.content;
    if (!rawReply) {
      return res.status(502).json({ error: "Tomt AI-svar." });
    }
    const reply = finalizeReply(rawReply);
    res.json({ reply });
  } catch (error) {
    console.error("API-fel:", error);
    res.status(500).json({ error: "Internt fel" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});
