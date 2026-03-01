const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const fetch = require("node-fetch");
const rateLimit = require("express-rate-limit");
const fs = require("fs/promises");
const path = require("path");
const { SYSTEM_PROMPT, KNOWLEDGE_BLOCK } = require("./prompts");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("."));
const LEADS_FILE = path.join(__dirname, "data", "match-leads.json");
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
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

async function saveMatchLead(lead) {
  const dir = path.dirname(LEADS_FILE);
  await fs.mkdir(dir, { recursive: true });

  let leads = [];
  try {
    const current = await fs.readFile(LEADS_FILE, "utf8");
    const parsed = JSON.parse(current);
    if (Array.isArray(parsed)) leads = parsed;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  leads.push(lead);
  await fs.writeFile(LEADS_FILE, JSON.stringify(leads, null, 2), "utf8");
}

async function readMatchLeads() {
  try {
    const current = await fs.readFile(LEADS_FILE, "utf8");
    const parsed = JSON.parse(current);
    if (!Array.isArray(parsed)) return [];
    return parsed.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

function isAdminAuthorized(req) {
  const token = String(req.headers["x-admin-token"] || "").trim();
  return Boolean(ADMIN_TOKEN) && token === ADMIN_TOKEN;
}

// --- API ENDPOINT ---

app.post("/api/match-lead", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const consent = Boolean(req.body?.consent);
    const answers = req.body?.answers || {};
    const score = Number(req.body?.score || 0);
    const percentage = Number(req.body?.percentage || 0);
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const validAnswers = ["q1", "q2", "q3", "q4"].every((key) => {
      const value = Number(answers[key]);
      return Number.isInteger(value) && value >= 1 && value <= 5;
    });

    if (!emailOk) return res.status(400).json({ error: "Ogiltig e-postadress." });
    if (!consent) return res.status(400).json({ error: "Samtycke krävs." });
    if (!validAnswers) return res.status(400).json({ error: "Ofullständiga svar." });

    await saveMatchLead({
      email,
      consent,
      answers: {
        q1: Number(answers.q1),
        q2: Number(answers.q2),
        q3: Number(answers.q3),
        q4: Number(answers.q4),
      },
      score,
      percentage,
      createdAt: new Date().toISOString(),
      source: "match-form",
    });

    res.json({ ok: true });
  } catch (error) {
    console.error("Lead-fel:", error);
    res.status(500).json({ error: "Kunde inte spara lead just nu." });
  }
});

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

app.get("/api/admin/leads", async (req, res) => {
  try {
    if (!isAdminAuthorized(req)) return res.status(401).json({ error: "Unauthorized" });
    const leads = await readMatchLeads();
    res.set("Cache-Control", "no-store");
    res.json({ leads, count: leads.length });
  } catch (error) {
    console.error("Admin leads-fel:", error);
    res.status(500).json({ error: "Kunde inte läsa leads just nu." });
  }
});

app.get("/api/admin/leads.csv", async (req, res) => {
  try {
    if (!isAdminAuthorized(req)) return res.status(401).send("Unauthorized");
    const leads = await readMatchLeads();
    const lines = ["email,score,percentage,createdAt,q1,q2,q3,q4"];
    for (const lead of leads) {
      const row = [
        String(lead.email || "").replace(/"/g, '""'),
        Number(lead.score || 0),
        Number(lead.percentage || 0),
        String(lead.createdAt || "").replace(/"/g, '""'),
        Number(lead.answers?.q1 || 0),
        Number(lead.answers?.q2 || 0),
        Number(lead.answers?.q3 || 0),
        Number(lead.answers?.q4 || 0),
      ];
      lines.push(`"${row[0]}",${row[1]},${row[2]},"${row[3]}",${row[4]},${row[5]},${row[6]},${row[7]}`);
    }
    res.set("Cache-Control", "no-store");
    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Content-Disposition", "attachment; filename=match-leads.csv");
    res.send(lines.join("\n"));
  } catch (error) {
    console.error("Admin CSV-fel:", error);
    res.status(500).send("Kunde inte exportera leads just nu.");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});
