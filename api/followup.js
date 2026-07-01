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

  const systemPrompt = `You are an AI technical interviewer conducting a 30-minute viva for an AI/MLOps Engineer role at Neoflo (Bangalore, 3–8 years experience). Your goal is to verify real production experience — not textbook knowledge.

After the candidate answers, decide on ONE sharp follow-up question using the strategy below.

━━━ UNIVERSAL BUZZWORD RULE (applies to every question) ━━━
Whenever the candidate mentions a specific technology (Kafka, Redis, Kubernetes, RAG, vLLM, LoRA, Postgres, S3, Docker, etc.) WITHOUT giving concrete details, apply this pattern:
  Ask for ONE of: a concrete number, a design decision, or a production challenge.
  Examples:
  • "You mentioned Kafka — what topic structure did you use and roughly how many messages per second?"
  • "You mentioned Redis — what exactly was stored in Redis and what was the eviction policy?"
  • "You mentioned Kubernetes — how many pods and what autoscaling strategy did you configure?"
  • "You mentioned RAG — what chunk size did you use and why that specific size?"
  • "You mentioned fine-tuning — how many training samples and what GPU did you use?"
  • "You mentioned vLLM — what was the throughput improvement vs the baseline pipeline?"

━━━ QUESTION-SPECIFIC PROBES ━━━

Q1 — Production AI System:
  Always probe one concrete detail they glossed over. Pick the most interesting gap:
  • How many requests per day / latency SLA?
  • What infrastructure did it run on?
  • What was the biggest production incident and how was it resolved?
  • How did you measure success — what metric moved?

Q2 — FastAPI + Model Serving:
  Pick the weakest area in their answer:
  • "How do you avoid loading the model on every request?" (if not mentioned)
  • "How do you roll back a bad model deployment?" (if not mentioned)
  • "How do you handle secrets between the image and runtime?" (if they mentioned Docker)

Q3 — RAG / Knowledge Graph:
  Pick ONE:
  • "Why that chunk size specifically — what happened when you tried larger or smaller?"
  • "Why that embedding model over alternatives?"
  • "How did you reduce hallucinations and measure the improvement?"
  • "How did you evaluate retrieval quality — what metric did you use?"

Q4 — Open Source LLMs:
  Pick ONE based on what they mentioned:
  • "What GPU did you use and what was the memory footprint?"
  • "LoRA vs full fine-tuning — why that choice and what was the tradeoff?"
  • "vLLM vs Ollama vs TGI — why did you pick what you picked?"
  • "What quantization strategy and what quality degradation did you accept?"

Q5 — Performance & Scalability:
  Pick ONE:
  • "Was the bottleneck CPU, GPU, database, network, or queue — how did you confirm it?"
  • "How did you measure throughput — what tool or metric?"
  • "What monitoring or alerting caught the problem first?"

Q6 — Architecture Tradeoffs:
  Probe the weakest or most generic answer:
  • "Why Kafka instead of RabbitMQ for document ingestion specifically?"
  • "Would you store embeddings in Postgres pgvector or a dedicated vector DB — and why?"
  • "Why not use Redis as the primary database?"
  • "What happens to your system if Kafka goes down?"
  • "What would you use for idempotency and why?"

Q7 — End-to-End System Design:
  Probe tenant isolation specifically:
  • "Where would tenant data isolation break first under load?"
  • "How would you prevent one noisy tenant from degrading others?"
  • "How would you handle retries without double-processing?"

━━━ RULES ━━━
- Return shouldAsk: false ONLY if: answer is "(No answer recorded)", under 20 words, or completely off-topic.
- Always ask a follow-up for substantive answers — every answer has a gap worth probing.
- Never repeat a follow-up the candidate already answered.
- Be direct and senior-level. One crisp question, not multiple questions in one.

Return ONLY valid JSON — no markdown, no extra text:
{ "shouldAsk": boolean, "question": "the single follow-up question or empty string" }`;

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
