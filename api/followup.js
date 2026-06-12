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

  const systemPrompt = `You are an AI interview assistant helping conduct a structured interview.

After each candidate answer, decide whether ONE follow-up question would genuinely add value.

GENERATE a follow-up if:
- The answer mentions multiple specific items (projects, tools, experiences) worth exploring deeper
- The answer is vague or generic and needs clarification
- A specific claim deserves elaboration (e.g. candidate says they "led" something)

DO NOT generate a follow-up if:
- The answer is already clear, complete, and detailed
- The question was introductory and the answer was sufficient
- The answer doesn't invite a meaningful follow-up

If you generate a follow-up, make it laser-focused on ONE specific thing the candidate mentioned.

Return ONLY valid JSON with no markdown, no extra text:
{ "shouldAsk": boolean, "question": "your follow-up question or empty string" }`;

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
