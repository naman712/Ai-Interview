// Serverless OpenRouter scoring
// Keeps OPENROUTER_API_KEY out of the browser

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.OPENROUTER_API_KEY;
  const model  = process.env.OPENROUTER_MODEL || "google/gemma-4-31b-it:free";

  if (!apiKey) return res.status(500).json({ error: "OPENROUTER_API_KEY not configured" });

  const { transcript } = req.body || {};
  if (!transcript) return res.status(400).json({ error: "transcript is required" });

  try {
    const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": req.headers.origin || req.headers.referer || "https://interview-platform.vercel.app",
        "X-Title": "AI Interview Platform",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content:
              'You are an interview evaluator. Score the candidate out of 10 based on clarity, depth, and relevance of answers. ' +
              'Return ONLY valid JSON with no markdown: { "score": number, "feedback": "2-3 sentence summary" }',
          },
          { role: "user", content: transcript },
        ],
      }),
    });

    if (!upstream.ok) {
      const errText = await upstream.text();
      return res.status(502).json({ error: "OpenRouter error", detail: errText.slice(0, 400) });
    }

    const data = await upstream.json();

    // Parse the LLM content into { score, feedback } server-side
    let raw = (data.choices?.[0]?.message?.content || "").trim();
    // Strip markdown code fences if model wraps in them
    raw = raw.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/, "").trim();

    let score    = null;
    let feedback = "";
    try {
      const parsed = JSON.parse(raw);
      score    = parsed.score;
      feedback = parsed.feedback || "";
    } catch (_) {
      // Model didn't return valid JSON — try a simple regex fallback
      const m = raw.match(/"score"\s*:\s*(\d+(?:\.\d+)?)/);
      if (m) score = parseFloat(m[1]);
      const f = raw.match(/"feedback"\s*:\s*"([^"]+)"/);
      if (f) feedback = f[1];
    }

    if (score === null) {
      return res.status(502).json({ error: "Could not parse score from LLM response", raw });
    }

    return res.status(200).json({ score, feedback });

  } catch (err) {
    return res.status(502).json({ error: "Failed to reach OpenRouter", detail: err.message });
  }
};
