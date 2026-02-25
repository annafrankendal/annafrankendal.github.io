const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const fetch = require("node-fetch");
const { SYSTEM_PROMPT, KNOWLEDGE_BLOCK } = require("./prompts");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("."));

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

// --- API ENDPOINT ---

app.post("/api/chat", async (req, res) => {
  const message = (req.body && (req.body.message || req.body.prompt || req.body.text))?.trim();

  if (!message) return res.status(400).json({ error: "Inget meddelande mottaget" });

  try {
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "system", content: KNOWLEDGE_BLOCK },
          { role: "user", content: message },
        ],
        temperature: 0.15,
        max_tokens: 320,
      }),
    });

    const data = await groqRes.json();
    const rawReply = data?.choices?.[0]?.message?.content || "";
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
