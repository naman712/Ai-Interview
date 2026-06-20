// Public endpoint — returns active questions from Firebase
// Falls back to defaults if none have been saved yet

const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

const db = admin.firestore();

const DEFAULTS = [
  // Q1 — Easy | Experience & Background
  "Walk me through a production ML/AI system you've built or owned. What was your role, and what did it actually run on?",

  // Q2 — Easy→Medium | FastAPI + CI/CD
  "How do you structure a FastAPI service for an AI model endpoint — and how is it deployed and updated in CI/CD?",

  // Q3 — Medium | RAG & Knowledge Graphs (screens for experience, then branches)
  "Have you worked on a RAG pipeline or a graph database like Neo4j in any project? If yes, describe that pipeline — how you chunked documents, chose embeddings, and handled retrieval quality issues. If not, explain how you'd design a system to search across thousands of enterprise documents — what components you'd use and why.",

  // Q4 — Medium | HuggingFace Loading & Serving (screens for experience, then branches)
  "Have you worked with open-source LLMs from HuggingFace — loading, fine-tuning, or serving them in a real project? If yes, which model did you use and how did you handle GPU memory, quantization, and batching to make it production-viable? If not, how would you approach serving a 7B LLM from HuggingFace on a single GPU?",

  // Q5 — Medium→Hard | HuggingFace Inference & Ops (screens for experience, then branches)
  "Have you tuned or optimized inference latency for an LLM in production — throughput, concurrency, or serving frameworks? If yes, describe a scenario where your model handled light load fine but degraded badly at scale — what did you change and what did it cost you? If not, walk through where you'd start if your HuggingFace model's latency was too high for production.",

  // Q6 — Hard | System Design
  "Design a multi-tenant document processing pipeline — covering ingestion, parsing, embeddings, and retrieval — that handles 10x traffic spikes without downtime."
];

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  try {
    const snap = await db.collection("config").doc("questions").get();
    const list = snap.exists ? (snap.data().list || []) : [];
    return res.status(200).json({ questions: list.length ? list : DEFAULTS });
  } catch (err) {
    console.error("Questions fetch error:", err.message);
    return res.status(200).json({ questions: DEFAULTS });
  }
};
