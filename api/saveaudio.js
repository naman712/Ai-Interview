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

const db     = admin.firestore();
const BUCKET = process.env.FIREBASE_STORAGE_BUCKET ||
  `${process.env.FIREBASE_PROJECT_ID}.appspot.com`;

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  const { email, questionKey, audio, type } = req.body || {};
  if (!email || !audio) return res.status(400).json({ error: "email and audio required" });

  try {
    const buffer  = Buffer.from(audio, "base64");
    const ext     = (type || "audio/webm").includes("ogg") ? "ogg" : "webm";
    const key     = String(questionKey || "q0");
    const docId   = email.trim().toLowerCase();
    const filePath = `interviews/${docId}/${key}.${ext}`;

    const bucket = admin.storage().bucket(BUCKET);
    const file   = bucket.file(filePath);

    // metadata token makes the file accessible via Firebase download URL
    const token = require("crypto").randomUUID();
    await file.save(buffer, {
      contentType: type || "audio/webm",
      resumable:   false,
      metadata:    { metadata: { firebaseStorageDownloadTokens: token } },
    });

    const url = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(filePath)}?alt=media&token=${token}`;

    await db.collection("candidates").doc(docId).set(
      { AudioFiles: { [key]: url } },
      { merge: true }
    );

    return res.status(200).json({ success: true, url });
  } catch (err) {
    console.error("[saveaudio]", err);
    return res.status(500).json({ error: err.message });
  }
};
