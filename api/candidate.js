const admin    = require("firebase-admin");
const { google } = require("googleapis");

// ── Firebase init (singleton) ────────────────────────────────────────
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

// ── Google Sheets writer ─────────────────────────────────────────────
// Reuses the same Firebase service account — just needs Sheets API enabled
// in the same Google Cloud project + sheet shared with the service account email.
// Non-fatal: if GOOGLE_SHEET_ID is missing or write fails, interview still saves.
async function writeToSheet(candidate, fields) {
  if (!process.env.GOOGLE_SHEET_ID) return;

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.FIREBASE_CLIENT_EMAIL,
        private_key:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets  = google.sheets({ version: "v4", auth });
    const sheetId = process.env.GOOGLE_SHEET_ID;
    const email   = String(candidate.Email || "").toLowerCase();

    // Find existing row for this email (column B)
    const lookup = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "Sheet1!B:B",
    });

    const emailCol  = (lookup.data.values || []);
    let targetRow   = -1;
    for (let i = 0; i < emailCol.length; i++) {
      if (emailCol[i] && String(emailCol[i][0]).toLowerCase() === email) {
        targetRow = i + 1; // 1-indexed
        break;
      }
    }

    // Password intentionally excluded from the sheet
    const fmtDate = iso => iso ? new Date(iso).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true
    }) : "";

    const rowData = [
      candidate.Name                    || "",   // A  Name
      candidate.Email                   || "",   // B  Email
      fields["Status"]                  || "",   // C  Status
      fields["AI Score"]                || "",   // D  AI Score
      fields["AI Feedback"]             || "",   // E  AI Feedback
      fields["Suspicion Flags"]         || "",   // F  Suspicion Flags
      fields["Interviewed At"]          || "",   // G  Interviewed At
      fmtDate(candidate.InterviewStart) || "",   // H  Window Start
      fmtDate(candidate.InterviewEnd)   || "",   // I  Window End
      fields["Transcript"]              || "",   // J  Transcript
    ];

    if (targetRow > 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: `Sheet1!A${targetRow}:J${targetRow}`,
        valueInputOption: "USER_ENTERED",
        resource: { values: [rowData] },
      });
    } else {
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: "Sheet1!A:J",
        valueInputOption: "USER_ENTERED",
        resource: { values: [rowData] },
      });
    }
  } catch (err) {
    // Log but don't crash — Firebase is the source of truth
    console.error("Google Sheets write error:", err.message);
  }
}

// ── Request handler ──────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  const { action, email, fields } = req.body || {};
  if (!email) return res.status(400).json({ error: "email is required" });

  const docId = email.trim().toLowerCase();
  const ref   = db.collection("candidates").doc(docId);

  try {
    // ── GET ────────────────────────────────────────────────────────
    if (action === "getCandidate") {
      const snap = await ref.get();
      if (!snap.exists) {
        return res.status(200).json({ success: false, error: "not_found" });
      }
      return res.status(200).json({ success: true, candidate: snap.data() });
    }

    // ── UPDATE (interview submit) ──────────────────────────────────
    if (action === "updateCandidate") {
      const snap = await ref.get();
      if (!snap.exists) {
        return res.status(200).json({ success: false, error: "not_found" });
      }

      // Write to Firebase first
      await ref.update(fields);

      // Mirror to Google Sheets (fire-and-forget style, errors are non-fatal)
      await writeToSheet(snap.data(), fields);

      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ error: "unknown_action" });

  } catch (err) {
    console.error("Firestore error:", err);
    return res.status(500).json({ error: err.message });
  }
};
