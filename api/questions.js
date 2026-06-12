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
  "Tell us about yourself and your professional background.",
  "What motivated you to apply for this role?",
  "Describe a challenging project you worked on and what you learned from it.",
  "How do you handle tight deadlines or competing priorities?",
  "Give an example of a time you worked effectively in a team.",
  "What are your greatest technical strengths relevant to this position?",
  "How do you stay current with industry trends and new technologies?",
  "Where do you see yourself professionally in the next three to five years?"
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
