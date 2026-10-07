// EMPATH Unit Scheduler — minimal backend.
// Two jobs: (1) persist the app's single JSON state document to a file on a Fly Volume, so data
// survives restarts and syncs across every device hitting this one server; (2) optionally turn a
// photographed schedule into structured shift data via a vision model call, when ANTHROPIC_API_KEY
// is set. Everything else about the app (all the real logic) still lives in index.html — this is
// just the durable-storage and vision-call plumbing that a static host (GitHub Pages, the Claude
// artifact viewer) can't provide on its own.
const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json({ limit: "15mb" })); // generous enough for a phone photo as base64

const DATA_DIR = process.env.DATA_DIR || "/data";
const STATE_FILE = path.join(DATA_DIR, "state.json");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readState() {
  ensureDataDir();
  if (!fs.existsSync(STATE_FILE)) return { updatedAt: 0, data: null };
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch (e) {
    // a half-written file from a crash mid-write — never crash the server over it, just report empty
    return { updatedAt: 0, data: null };
  }
}

function writeState(data) {
  ensureDataDir();
  const body = { updatedAt: Date.now(), data };
  // write-to-temp-then-rename so a reader never sees a half-written file, even under a crash
  const tmp = STATE_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(body));
  fs.renameSync(tmp, STATE_FILE);
  return body;
}

app.get("/api/state", (req, res) => {
  res.json(readState());
});

app.put("/api/state", (req, res) => {
  const data = req.body && req.body.data;
  if (!data || typeof data !== "object") return res.status(400).json({ error: "missing data" });
  res.json(writeState(data));
});

// Turns a photographed/scanned schedule into structured shift rows via a vision-capable model.
// Requires the caller's own ANTHROPIC_API_KEY set as a Fly secret — this server never ships with one.
app.post("/api/parse-schedule-image", async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(503).json({
      error: "Image import isn't configured on this server yet. Set ANTHROPIC_API_KEY as a Fly secret (fly secrets set ANTHROPIC_API_KEY=sk-ant-...) and redeploy.",
    });
  }
  const { imageBase64, mediaType } = req.body || {};
  if (!imageBase64) return res.status(400).json({ error: "missing imageBase64" });

  const prompt = `You are reading a photo of a nurse work schedule (could be a printed grid, a handwritten roster, or a spreadsheet screenshot). Extract every shift you can clearly read.

Return ONLY a JSON array, nothing else, no markdown fences, no commentary. Each element:
{"date":"YYYY-MM-DD","nurse":"<name as written>","start":"<e.g. 7a, 7am, 19:00, 7p>","end":"<e.g. 7p, 19:00, or null if unreadable>"}

Rules:
- If the schedule shows a date range or week but individual day columns only have day-of-week headers (Mon, Tue...) and a visible week-start or week-ending date somewhere, compute each full date from that anchor.
- If you truly cannot determine the year, use the most recent plausible year.
- Skip cells you can't confidently read rather than guessing; accuracy matters more than completeness.
- "nurse" should be exactly the name as it appears in the image (don't invent a full name from initials).
- If a shift's end time isn't shown, set "end" to null (the caller can fall back to a default duration).
- Output nothing but the JSON array.`;

  try {
    const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType || "image/jpeg", data: imageBase64 } },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      return res.status(502).json({ error: "The vision model call failed.", detail: t.slice(0, 800) });
    }
    const j = await r.json();
    const text = (j.content || []).map((c) => c.text || "").join("");
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return res.status(502).json({ error: "Couldn't find a parseable shift list in the model's reply.", raw: text.slice(0, 800) });
    let shifts;
    try {
      shifts = JSON.parse(match[0]);
    } catch (e) {
      return res.status(502).json({ error: "The model's reply wasn't valid JSON.", raw: match[0].slice(0, 800) });
    }
    res.json({ shifts });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
});

// Serve the app itself — same index.html used standalone on GitHub Pages / the Claude artifact
// viewer, this server just also answers the /api/* routes above so it can tell it's hosted here.
app.use(express.static(path.join(__dirname), { extensions: ["html"] }));
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`empath-scheduler server listening on :${PORT}`));
