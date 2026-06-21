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

  // Truncate very long transcripts to avoid context-window failures (~6000 chars ≈ ~1500 tokens)
  const MAX_CHARS = 6000;
  const safeTranscript = transcript.length > MAX_CHARS
    ? transcript.slice(0, MAX_CHARS) + "\n\n[transcript truncated for scoring]"
    : transcript;

  const systemPrompt =
    'You are a senior technical interviewer evaluating an AI/MLOps Engineer candidate. ' +
    'Score them out of 10 based on technical depth, clarity, and relevance of answers. ' +
    'Be concise. Return ONLY valid JSON — no markdown, no prose outside the JSON:\n' +
    '{"score": <integer 1-10>, "feedback": "<2-3 sentence summary>"}';

  function parseScore(raw) {
    raw = raw.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/,"").trim();
    try {
      const p = JSON.parse(raw);
      if (typeof p.score === "number") return { score: p.score, feedback: p.feedback || "" };
    } catch (_) {}
    // Broad regex fallback — handles "score: 7" or '"score":7' etc.
    const sm = raw.match(/["\s]score[":\s]+(\d+(?:\.\d+)?)/i);
    const fm = raw.match(/["\s]feedback[":\s]+"([^"]{10,})"/i);
    if (sm) return { score: parseFloat(sm[1]), feedback: fm ? fm[1] : "" };
    return null;
  }

  const MAX_ATTEMPTS = 3;
  let lastErr = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
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
            { role: "system", content: systemPrompt },
            { role: "user",   content: safeTranscript },
          ],
        }),
      });

      if (!upstream.ok) {
        lastErr = `HTTP ${upstream.status}`;
        if (attempt < MAX_ATTEMPTS) await new Promise(r => setTimeout(r, 1500 * attempt));
        continue;
      }

      const data = await upstream.json();
      const raw  = (data.choices?.[0]?.message?.content || "").trim();
      const parsed = parseScore(raw);

      if (parsed) return res.status(200).json(parsed);

      lastErr = "Could not parse score: " + raw.slice(0, 200);
      if (attempt < MAX_ATTEMPTS) await new Promise(r => setTimeout(r, 1000 * attempt));

    } catch (err) {
      lastErr = err.message;
      if (attempt < MAX_ATTEMPTS) await new Promise(r => setTimeout(r, 1500 * attempt));
    }
  }

  return res.status(502).json({ error: "Scoring failed after retries", detail: lastErr });
};
