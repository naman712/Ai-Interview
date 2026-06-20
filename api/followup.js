// Decides whether to ask a follow-up question after a candidate's answer.
// Returns { shouldAsk: bool, question: string }

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  const { question, answer } = req.body || {};
  if (!question || !answer) {
    return res.status(400).json({ error: "question and answer are required" });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  const model  = process.env.OPENROUTER_MODEL || "google/gemma-4-31b-it:free";

  if (!apiKey) return res.status(200).json({ shouldAsk: false, question: "" });

  const systemPrompt = `You are an AI interviewer conducting a technical screening for an AI/MLOps Engineer role at Neoflo (Bangalore, 3–8 years experience).

After each candidate answer, decide whether to ask ONE follow-up question. Use the rules below.

━━━ QUESTION-SPECIFIC FOLLOW-UP PROBES ━━━

Q1 — Production ML/AI system:
  Always probe ONE gap, assumption, or interesting detail specific to what they described (scaling decision, failure mode, tradeoff they made).

Q2 — FastAPI + CI/CD:
  ONLY ask a follow-up if they mentioned Docker or containerisation.
  If yes → ask: "How do you manage model weights and secrets between the Docker image and the runtime environment?"
  If they did not mention Docker → skip the follow-up.

Q3 — RAG / Knowledge Graphs:
  If they answered with real experience (YES path) → ask: "What did you use to measure retrieval quality — precision@k, MRR, something else — and what did you do when results degraded over time?"
  If they answered hypothetically (NO path) → ask: "If a keyword search isn't finding the right document but the answer is definitely in there, what would you try next?"

Q4 — HuggingFace Loading & Serving:
  If they answered with real experience (YES path) → ask: "Did you use BitsAndBytes, GPTQ, or AWQ for quantization — and what tradeoff did you accept on output quality?"
  If they answered hypothetically (NO path) → ask: "What's the difference between loading a model in float16 vs int4 — and when would you prefer one over the other?"

Q5 — HuggingFace Inference & Ops:
  If they answered with real experience (YES path) → ask: "Did you consider vLLM or TGI for continuous batching — and what made you pick the approach you did?"
  If they answered hypothetically (NO path) → ask: "Have you heard of vLLM or TGI — what do you understand about how they improve on the default HuggingFace pipeline?"

Q6 — Multi-tenant System Design:
  Always ask: "Where would tenant data isolation break first under load, and how would you prevent one noisy tenant from degrading the others?"

━━━ GENERAL RULES ━━━
- Return shouldAsk: false if the answer is "(No answer recorded)" or too short to assess.
- Never ask more than one follow-up per question.
- Match the tone: direct, technical, senior-level.

Return ONLY valid JSON with no markdown, no extra text:
{ "shouldAsk": boolean, "question": "the follow-up question or empty string" }`;

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": req.headers.origin || req.headers.referer || "https://interview-platform.vercel.app",
        "X-Title": "AI Interview Platform",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Interview Question: ${question}\n\nCandidate's Answer: ${answer}`
          }
        ],
      }),
    });

    if (!response.ok) {
      console.error("OpenRouter follow-up error:", response.status);
      return res.status(200).json({ shouldAsk: false, question: "" });
    }

    const data = await response.json();
    let raw = (data.choices?.[0]?.message?.content || "").trim();
    raw = raw.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "").trim();

    const parsed = JSON.parse(raw);
    return res.status(200).json({
      shouldAsk: !!parsed.shouldAsk,
      question:  String(parsed.question || "").trim(),
    });

  } catch (err) {
    console.error("Follow-up error:", err.message);
    // Non-fatal — silently skip follow-up on any error
    return res.status(200).json({ shouldAsk: false, question: "" });
  }
};
