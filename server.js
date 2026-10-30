// Zero-dependency micro-SaaS server (Node 20+). Run: node --env-file=.env server.js
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const PAYMENT_LINK = process.env.STRIPE_PAYMENT_LINK || "";
const FREE_USES = Number(process.env.FREE_USES || 3);
const ACCESS_CODES = new Set((process.env.ACCESS_CODES || "").split(",").map((s) => s.trim()).filter(Boolean));

// Customize this for your niche.
const SYSTEM_PROMPT =
  process.env.SYSTEM_PROMPT ||
  "You are an expert resume coach. Rewrite the user's resume bullet points to be concise, quantified, and ATS-friendly. Return only the improved text.";

const usage = new Map(); // ip -> free uses consumed (in-memory; use a DB in production)
const PUBLIC = path.join(__dirname, "public");
const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" };

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "Content-Type": type });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req, limit = 20000) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > limit) {
        reject(new Error("too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

async function generate(req, res) {
  let input;
  try {
    input = JSON.parse(await readBody(req));
  } catch {
    return send(res, 400, { error: "Invalid request" });
  }
  const text = String(input.text || "").trim();
  if (!text) return send(res, 400, { error: "Please enter some text." });
  if (!API_KEY) return send(res, 500, { error: "Server missing OPENAI_API_KEY." });

  const paid = ACCESS_CODES.has(String(input.code || "").trim());
  const ip = req.headers["cf-connecting-ip"] || (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress;
  const used = usage.get(ip) || 0;
  if (!paid && used >= FREE_USES) {
    return send(res, 402, { error: "Free limit reached.", paymentLink: PAYMENT_LINK });
  }

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: text },
        ],
      }),
    });
    const data = await r.json();
    if (!r.ok) return send(res, 502, { error: data.error?.message || "AI provider error" });
    if (!paid) usage.set(ip, used + 1);
    send(res, 200, { result: data.choices[0].message.content, remaining: paid ? null : FREE_USES - used - 1 });
  } catch (e) {
    send(res, 502, { error: "AI request failed." });
  }
}

http
  .createServer((req, res) => {
    if (req.method === "POST" && req.url === "/api/generate") return generate(req, res);
    if (req.method !== "GET") return send(res, 405, { error: "Method not allowed" });
    const name = req.url.split("?")[0] === "/" ? "index.html" : path.normalize(req.url.split("?")[0]).replace(/^([/\\])+/, "");
    const file = path.join(PUBLIC, name);
    if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, "Forbidden", "text/plain");
    fs.readFile(file, (err, buf) => {
      if (err) return send(res, 404, "Not found", "text/plain");
      send(res, 200, buf, TYPES[path.extname(file)] || "application/octet-stream");
    });
  })
  .listen(PORT, () => console.log(`Running on http://localhost:${PORT}`));
