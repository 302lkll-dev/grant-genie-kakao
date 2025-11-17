import express from "express";
import path from "path";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.static(path.resolve()));

const CSV_URL =
  "https://docs.google.com/spreadsheets/d/1YtAuoDVMAvS6djbGGMkZsAKdfyYOHj_PcB_tQjSt5UU/export?format=csv";

function parseCSV(text) {
  const lines = text.split("\n");
  const header = lines[0].split(",").map(h => h.trim());
  const results = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < header.length) continue;

    const row = {};
    header.forEach((h, idx) => {
      row[h] = cols[idx] ? cols[idx].trim() : "";
    });

    results.push(row);
  }
  return results;
}

app.get("/api/search", async (req, res) => {
  try {
    const q = req.query.q?.toLowerCase() || "";
    const category = req.query.category?.toLowerCase() || "";

    const r = await fetch(CSV_URL);
    const raw = await r.text();
    const data = parseCSV(raw);

    const filtered = data.filter(item => {
      const title = (item.program_title || "").toLowerCase();
      const cat = (item.category || "").toLowerCase();
      const target = (item.target || "").toLowerCase();
      const region = (item.region || "").toLowerCase();

      const keywordMatch =
        title.includes(q) ||
        target.includes(q) ||
        region.includes(q);

      const categoryMatch = category ? cat.includes(category) : true;

      return keywordMatch && categoryMatch;
    });

    res.json({ count: filtered.length, results: filtered });
  } catch (err) {
    res.status(500).json({ error: "Search failed", detail: err.message });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.resolve("index.html"));
});

app.listen(10000, () => {
  console.log("지원지니 running on port 10000");
});
