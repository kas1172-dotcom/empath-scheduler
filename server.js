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

// Conversational scheduling assistant. The manager asks a question or describes a change in plain
// English; the model replies in plain English and, only when it's actually proposing a change, a
// small set of structured, typed actions. Nothing here ever touches state.json or app state —
// the browser is the only thing that applies an action, and only after the manager reviews it in a
// preview (same confirm-before-commit shape as photo import). This endpoint is stateless: it gets
// the current schedule context fresh on every call from the browser, it doesn't keep its own copy.
app.post("/api/chat", async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return res.status(503).json({
      error: "The assistant isn't configured on this server yet. Set ANTHROPIC_API_KEY as a Fly secret (fly secrets set ANTHROPIC_API_KEY=sk-ant-...) and redeploy.",
    });
  }
  const { message, history, context } = req.body || {};
  if (!message || typeof message !== "string") return res.status(400).json({ error: "missing message" });

  const sys = `You are a scheduling assistant embedded in a nurse-scheduling app for a psychiatric crisis stabilization unit (EMPATH model). A manager is talking to you directly, in plain English, either asking a question about the current schedule/roster/census, or asking for something to change.

Current context (JSON), already scoped to what you need: ${JSON.stringify(context || {})}

Rules:
- Only ever refer to nurses by the exact "name" strings given in context.nurses. Never invent a name. If the manager's request is ambiguous (unclear nurse, date, or which shift they mean), ask a clarifying question in "reply" and return an empty actions array rather than guessing.
- If the manager is just asking a question ("who's working Saturday night", "how many hours does Dawn have this week"), answer it directly and concisely in "reply" using the data in context, and return an empty actions array. You're not expected to change anything for a question.
- If the manager wants something changed, put a short plain-English summary of what you're proposing (and why) in "reply", and the actual structured change(s) in "actions". Nothing is applied automatically, the manager reviews and confirms every action before it touches the real schedule, so propose freely and explain your reasoning, don't ask permission first, the review step IS the permission step.
- Action types, each needs "type" and "why" (a short clause explaining that specific action), plus:
  - add_shift: nurseName, date (YYYY-MM-DD), start (0-23, hour it begins), duration (hours)
  - remove_shift: nurseName, date, start (must match an existing shift's start hour that date)
  - time_off: nurseName, startDate, endDate (inclusive; same date twice for one day), offType ("PTO" or "Off") — marks every day in that range approved-off and clears any shifts already on the books for them in that range
  - set_fte: nurseName, fte (a number, typically 0-1.2)
  - set_census: date, day (integer patient count), night (integer patient count)
- Stay inside this domain: shifts, time off, census, FTE. For anything else (adding/removing a nurse entirely, changing role or cert status, pay/budget figures), say in "reply" that it needs to be done directly in the Roster or Census & FTE tab, you can't do it from here.
- Standard shift length is 12 hours; day band is roughly 7a-7p, night 7p-7a; a week runs Monday-Sunday.
- Be concise, this is a working manager, not a chat companion.`;

  const msgs = [];
  (Array.isArray(history) ? history : []).slice(-8).forEach((h) => {
    if (h && (h.role === "user" || h.role === "assistant") && typeof h.text === "string") {
      msgs.push({ role: h.role, content: h.text });
    }
  });
  msgs.push({ role: "user", content: message });

  const tool = {
    name: "respond",
    description: "Reply to the manager and, optionally, propose schedule changes for them to review.",
    input_schema: {
      type: "object",
      properties: {
        reply: { type: "string", description: "Plain-English reply shown directly to the manager." },
        actions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["add_shift", "remove_shift", "time_off", "set_fte", "set_census"] },
              why: { type: "string" },
              nurseName: { type: "string" },
              date: { type: "string" },
              start: { type: "number" },
              duration: { type: "number" },
              startDate: { type: "string" },
              endDate: { type: "string" },
              offType: { type: "string", enum: ["PTO", "Off"] },
              fte: { type: "number" },
              day: { type: "number" },
              night: { type: "number" },
            },
            required: ["type", "why"],
          },
        },
      },
      required: ["reply", "actions"],
    },
  };

  try {
    const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        system: sys,
        messages: msgs,
        tools: [tool],
        tool_choice: { type: "tool", name: "respond" },
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      return res.status(502).json({ error: "The assistant call failed.", detail: t.slice(0, 800) });
    }
    const j = await r.json();
    const toolUse = (j.content || []).find((c) => c.type === "tool_use" && c.name === "respond");
    if (!toolUse) return res.status(502).json({ error: "The assistant didn't return a usable reply." });
    const out = toolUse.input || {};
    res.json({ reply: String(out.reply || ""), actions: Array.isArray(out.actions) ? out.actions : [] });
  } catch (e) {
    res.status(500).json({ error: String((e && e.message) || e) });
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
