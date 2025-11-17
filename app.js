import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';

const __dirname = path.resolve();
const app = express();

// CORS & JSON
app.use(cors());
app.use(express.json());

// 정적 파일: ./public/index.html 사용
app.use(express.static(path.join(__dirname, 'public')));

// 정책 데이터 불러오기(policies.json)
const POLICIES_PATH = path.join(__dirname, 'policies.json');
let POLICIES = [];

function loadPolicies() {
  try {
    const raw = fs.readFileSync(POLICIES_PATH, 'utf8');
    POLICIES = JSON.parse(raw);
    console.log(`✅ 정책 ${POLICIES.length}건 로드 완료`);
  } catch (err) {
    console.error('❌ 정책 파일 로드 실패:', err.message);
    POLICIES = [];
  }
}

loadPolicies();

// 헬스체크용
app.get('/api/health', (req, res) => {
  res.json({ ok: true, count: POLICIES.length });
});

// 🔍 검색 API
app.get('/api/search', (req, res) => {
  try {
    const keyword = (req.query.q || '').trim().toLowerCase();   // 검색어
    const category = (req.query.category || '').trim();         // 청년, 한부모 ...
    const target = (req.query.target || '').trim();             // 전체 대상, 기업, 개인 등

    let results = POLICIES;

    // 1) 카테고리 필터 (청년, 한부모 등)
    if (category && category !== '전체') {
      results = results.filter((p) => {
        const cat = (p.category || p.target_category || '').toLowerCase();
        return cat.includes(category.toLowerCase());
      });
    }

    // 2) 대상 필터 (전체 대상 제외)
    if (target && target !== '전체 대상') {
      results = results.filter((p) => {
        const t = (p.target || '').toLowerCase();
        return t.includes(target.toLowerCase());
      });
    }

    // 3) 키워드 필터 (제목 + 요약 + 지역 + 산업 + 키워드)
    if (keyword) {
      results = results.filter((p) => {
        const haystack = [
          p.title,
          p.region,
          p.summary,
          p.industry,
          p.keywords,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return haystack.includes(keyword);
      });
    }

    // 너무 많아지면 상위 100개만
    const limited = results.slice(0, 100);

    res.json({
      count: results.length,
      results: limited,
    });
  } catch (err) {
    console.error('❌ /api/search 오류:', err);
    res.status(500).json({ error: 'SEARCH_ERROR' });
  }
});

// 서버 시작
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`지원지니 running on port ${PORT}`);
});
