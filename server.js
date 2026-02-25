const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const { SYSTEM_PROMPT, KNOWLEDGE_BLOCK } = require("./prompts");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("."));

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
        temperature: 0.25,
        max_tokens: 300,
      }),
    });

    const data = await groqRes.json();
    const reply = data?.choices?.[0]?.message?.content;
    res.json({ reply });
  } catch (error) {
    console.error("API-fel:", error);
    res.status(500).json({ error: "Internt fel" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Anna-AI (Unified Meeting Identity) kör på port ${PORT}`));
