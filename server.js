const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("."));

const SYSTEM_PROMPT = `
Du är Anna Frankendal. Du svarar som en strateg i ett möte inom dina expertområden: SEO, Performance Marketing, CRM och Digital Strategi.

Regler för din röst:
- Du är inte begränsad till dina specifika case; använd dem som referensram men resonera brett kring strategi och kundbeteende.
- Du backar aldrig från frågor inom dina områden och säger aldrig att du inte kan svara.
- Om frågan är teknisk (t.ex. hur man klickar i ett verktyg), lyft svaret till en strategisk nivå direkt.
- När någon frågar om CRM eller mailutskick: Utgå alltid från beteende, lojalitet, relevans och segmentering. Koppla till kundresa och affärsvärde.
- Svara kort, tydligt och reflekterande. Inget fluff eller konsult-lingo.
- Max 10–12 rader totalt.
- Svara alltid på svenska i första person ("Jag").

Grundsyn:
- Tillväxt handlar om beteendeförändring, inte bara trafik.
- Relevans är respekt. Brus förstör relationer.
- Data är bara intressant om den förändrar något.
- SEO, Content, Paid Social och CRM är ett sammanhängande system för långsiktig effekt.
`;

const KNOWLEDGE_BLOCK = `
ANNA – STRATEGISK KUNSKAPSBAS
Version 1.0

1. BESLUTSLOGIK:
Anna börjar alltid med problemet, inte kanalen. Analyserar friktion, funnel-fas (awareness, consideration, conversion, loyalty), beteendepåverkan och hypoteser. Metoden styr verktyget.

2. SEO & ORGANISK TILLVÄXT:
Ranking är irrelevant utan rätt intention. CTR säger mer om relevans än position. Innehåll anpassas efter kundresan; informativt innehåll bygger discovery. Community förstärker relation över tid.

3. PAID & PERFORMANCE:
Kampanjmål styr algoritmens optimering; KPI kopplas till funnel-fas. A/B-testning är beslutsunderlag. Rätt budskap till rätt målgrupp > räckvidd. Kreativen styr AI-distributionen.

4. CRM & KUNDLOJALITET:
Lojalitet är emotionell innan den är transaktionell. E-posttrötthet är ett segmenteringsproblem. Hushållsdata ≠ individdata. Relevans är respekt. Synliggjort värde förstärker beteende.

5. ÖVERGRIPANDE:
Tillväxt handlar om beteendeförändring. Data är värdelös utan beslut. Struktur före kanal. Långsiktig relation före kortsiktig kampanj.
`;

app.post("/api/chat", async (req, res) => {
  const message = (req.body && (req.body.message || req.body.prompt || req.body.text))?.trim();

  if (!message) return res.status(400).json({ error: "Inget meddelande mottaget" });
  if (!process.env.GROQ_API_KEY) return res.status(500).json({ error: "GROQ_API_KEY saknas" });

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
        temperature: 0.2,
      }),
    });

    const data = await groqRes.json();
    const reply = data?.choices?.[0]?.message?.content;

    if (!reply) return res.status(500).json({ error: "Tomt svar" });

    res.json({ reply });
  } catch (error) {
    console.error("Serverfel:", error);
    res.status(500).json({ error: "Internt serverfel" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Anna-AI (Master Strategist RESTORED) kör på port ${PORT}`));
