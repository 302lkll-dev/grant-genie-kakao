// ======================= 기본 설정 =======================
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { google } from 'googleapis';
import { parse as csvParse } from 'csv-parse/sync';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// __dirname 대체 (ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 정적 파일 (index.html, 스타일 등)
app.use(express.static(__dirname));

// 서버 포트
const PORT = process.env.PORT || 3000;

// ======================= 정규화 함수 =======================
function normalizeRow(r = {}) {
  const title =
    r.title ||
    r.program_title ||
    r['사업명'] ||
    r['프로그램명'] ||
    r.name ||
    r['제목'] ||
    '';

  const region = r.region || r['지역'] || '';
  const target = r.target || r['대상'] || '';
  const industry = r.industry || r['산업분야'] || r['분야'] || '';
  const budget = r.budget || r['예산'] || '';
  const benefit_type = r.benefit_type || r['유형'] || r['지원형태'] || '';
  const deadline = r.deadline || r['마감일'] || r['접수마감'] || '';
  const link = r.link || r['링크'] || r.url || '';
  const summary = r.summary || r['요약'] || r['설명'] || '';
  const keywords = r.keywords || r['keywords'] || r['키워드'] || '';

  return {
    title,
    region,
    target,
    industry,
    budget,
    benefit_type,
    deadline,
    link,
    summary,
    keywords,
  };
}

// ======================= 데이터 로더 =======================
// 1) Google Sheets → JSON
async function loadFromSheet() {
  const SHEET_ID = process.env.SHEET_ID;
  const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
  const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;

  if (!SHEET_ID || !GOOGLE_CLIENT_EMAIL || !GOOGLE_PRIVATE_KEY) return [];

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: GOOGLE_CLIENT_EMAIL,
        // env에 들어간 개행문자(\n) 처리
        private_key: GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // A1:J 열까지 가정 (title~keywords)
    const range = 'A1:J9999';
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range,
    });

    const rows = resp.data.values || [];
    if (rows.length < 2) return [];

    const header = rows[0].map((h) => (h || '').toString().trim());
    const dataRows = rows.slice(1);

    const records = dataRows.map((arr) => {
      const obj = {};
      header.forEach((h, i) => (obj[h] = arr[i] ?? ''));
      return normalizeRow(obj);
    });

    return records;
  } catch (e) {
    console.error('[Sheets Error]', e);
    return [];
  }
}

// 2) 공개 CSV(URL) → JSON  (예: 구글시트 “웹에 게시” CSV 링크)
async function loadFromCSV() {
  const CSV_URL = process.env.CSV_URL;
  if (!CSV_URL) return [];
  try {
    const r = await fetch(CSV_URL);
    if (!r.ok) throw new Error(`CSV fetch failed: ${r.status}`);
    const text = await r.text();

    const rows = csvParse(text, {
      columns: true,
      skip_empty_lines: true,
    });

    return rows.map(normalizeRow);
  } catch (e) {
    console.error('[CSV Error]', e.message || e);
    return [];
  }
}

// 3) 로컬 JSON (policies.json) → JSON
import fs from 'fs/promises';
async function loadFromLocalJSON() {
  try {
    const p = path.join(__dirname, 'policies.json');
    const text = await fs.readFile(p, 'utf-8');
    const arr = JSON.parse(text);
    if (Array.isArray(arr)) return arr.map(normalizeRow);
    return [];
  } catch {
    return [];
  }
}

// 4) 전체 로드 & 캐시
let CACHE = [];
let LAST_LOADED = 0;
const TTL_MS = 5 * 60 * 1000; // 5분

async function fetchPrograms(force = false) {
  const now = Date.now();
  if (!force && now - LAST_LOADED < TTL_MS && CACHE.length) return CACHE;

  const [s1, s2, s3] = await Promise.all([
    loadFromSheet(),
    loadFromCSV(),
    loadFromLocalJSON(),
  ]);

  // 시트 > CSV > 로컬 순으로 합치고, 비어있는 title은 제거
  const merged = [...s1, ...s2, ...s3].filter((x) => (x.title || '').trim());

  CACHE = merged;
  LAST_LOADED = now;
  return CACHE;
}

// ======================= 검색 유틸 =======================
function matchScore(item, q) {
  const hay = (
    `${item.title} ${item.region} ${item.target} ${item.industry} ` +
    `${item.budget} ${item.benefit_type} ${item.deadline} ${item.summary} ${item.keywords}`
  )
    .toLowerCase()
    .replace(/\s+/g, ' ');
  const qs = q.toLowerCase().trim().split(/\s+/);

  let score = 0;
  for (const token of qs) {
    if (hay.includes(token)) score += 1;
  }
  return score;
}

// ======================= 라우트 =======================
// 홈(검색 UI)
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 데이터 덤프(확인용)
app.get('/policies.json', async (_req, res) => {
  const rows = await fetchPrograms(false);
  res.json(rows);
});

// 검색 API
app.get('/api/search', async (req, res) => {
  try {
    const q = (req.query.q || '').toString();
    const count = parseInt(req.query.count || '10', 10);

    const rows = await fetchPrograms(false);
    if (!q.trim()) {
      return res.json({
        query: q,
        count,
        results: rows.slice(0, count),
      });
    }

    const scored = rows
      .map((r) => ({ r, s: matchScore(r, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, count)
      .map((x) => x.r);

    res.json({
      query: q,
      count,
      results: scored,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '검색 중 오류 발생' });
  }
});

// 디버그: 강제 리로드
app.get('/debug/reload', async (_req, res) => {
  await fetchPrograms(true);
  res.json({ reloaded: true, size: CACHE.length });
});

// ======================= 서버 시작 =======================
app.listen(PORT, () => {
  console.log(`✅ GrantGenie running on http://localhost:${PORT}`);
  console.log('   • 검색: /api/search?q=청년 창업');
  console.log('   • 데이터: /policies.json');
});
