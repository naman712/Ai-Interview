// STT proxy: tries Groq Whisper first, falls back to Deepgram if it fails.
// Keeps all API keys server-side.

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  const { audio, type } = req.body || {};
  if (!audio) return res.status(400).json({ error: "audio is required" });

  const buffer   = Buffer.from(audio, "base64");
  const mimeType = type || "audio/webm";

  // ── 1. Try Groq Whisper ─────────────────────────────────────
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      const text = await transcribeGroq(buffer, mimeType, groqKey);
      if (text) {
        console.log("[transcribe] Groq OK");
        return res.status(200).json({ text, provider: "groq" });
      }
    } catch (err) {
      console.warn("[transcribe] Groq failed:", err.message, "→ trying Deepgram");
    }
  }

  // ── 2. Fallback: Deepgram ───────────────────────────────────
  const dgKey = process.env.DEEPGRAM_API_KEY;
  if (dgKey) {
    try {
      const text = await transcribeDeepgram(buffer, mimeType, dgKey);
      if (text !== null) {
        console.log("[transcribe] Deepgram OK");
        return res.status(200).json({ text, provider: "deepgram" });
      }
    } catch (err) {
      console.error("[transcribe] Deepgram also failed:", err.message);
    }
  }

  // ── 3. Both failed ──────────────────────────────────────────
  return res.status(502).json({ error: "All STT providers failed" });
};

// ── Groq Whisper ────────────────────────────────────────────────
async function transcribeGroq(buffer, mimeType, apiKey) {
  const blob     = new Blob([buffer], { type: mimeType });
  const formData = new FormData();
  formData.append("file",            blob, "recording.webm");
  formData.append("model",           "whisper-large-v3-turbo");
  formData.append("response_format", "json");
  formData.append("language",        "en");

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method:  "POST",
    headers: { "Authorization": `Bearer ${apiKey}` },
    body:    formData,
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Groq ${res.status}: ${detail.slice(0, 200)}`);
  }

  const data = await res.json();
  return (data.text || "").trim();
}

// ── Deepgram nova-2 ─────────────────────────────────────────────
async function transcribeDeepgram(buffer, mimeType, apiKey) {
  const url = "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&language=en";

  const res = await fetch(url, {
    method:  "POST",
    headers: {
      "Authorization": `Token ${apiKey}`,
      "Content-Type":  mimeType,
    },
    body: buffer,
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Deepgram ${res.status}: ${detail.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
  return text.trim();
}
