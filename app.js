// app.js — GrantGenie 2.0 (Render 완벽 호환 버전)
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// ✅ 헬스 체크 (Render가 앱 살아있는지 확인용)
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// ✅ 홈화면
app.get('/', (req, res) => {
  res.send(`
    <h2>지원지니 웹 검색</h2>
    <p>정상 작동 중 ✅</p>
    <p>예시: <a href="/api/search?q=청년">/api/search?q=청년</a></p>
  `);
});

// ✅ 정책 검색 API
app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  const filePath = path.join(__dirname, 'policies.json');

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: '데이터 파일 없음' });
  }

  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const results = data.filter(item =>
    Object.values(item).some(v =>
      String(v).toLowerCase().includes(q)
    )
  );

  res.json({
    query: q,
    count: results.length,
    results,
  });
});

// ✅ Render 배포용 포트 설정
const PORT = process.env.PORT || 10000; // Render 자동 포트 지원
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ GrantGenie running on port ${PORT}`);
});
