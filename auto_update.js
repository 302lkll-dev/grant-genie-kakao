// auto_update.js — 지원지니: 정책 JSON → 구글시트 자동 업로드
import 'dotenv/config';
import fetch from 'node-fetch';
import { google } from 'googleapis';

// 1) 데이터 소스 (collector가 만든 JSON을 app.js로 정적 서빙)
const SOURCE_URLS = [
  'http://localhost:3000/policies.json'
];

// 2) 환경변수 (너의 .env에 있는 이름과 일치)
const SHEET_ID            = process.env.SHEET_ID;
const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const GOOGLE_PRIVATE_KEY  = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

// 3) 구글 인증
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: GOOGLE_CLIENT_EMAIL,
    private_key: GOOGLE_PRIVATE_KEY,
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

// 4) 행 변환 (시트 컬럼 순서에 맞춤)
// title, region, target, industry, budget, benefit_type, deadline, link, summary, keywords
function toRow(p) {
  return [
    p.title || '',
    p.region || '',
    p.target || '',
    p.industry || '',
    p.budget || '',
    p.benefit_type || '',
    p.deadline || '',
    p.link || '',
    p.summary || '',
    p.keywords || '',
  ];
}

async function updateSheet() {
  try {
    console.log('🚀 지원지니 자동 업데이트 시작...');

    // 5) 모든 소스에서 데이터 수집
    let all = [];
    for (const url of SOURCE_URLS) {
      console.log(`📦 불러오는 중: ${url}`);
      const res = await fetch(url, { timeout: 20000 });
      if (!res.ok) throw new Error(`Fetch 실패 (${res.status}) - ${url}`);
      const json = await res.json();
      if (Array.isArray(json)) all = all.concat(json);
    }

    if (all.length === 0) {
      console.log('⚠️ 불러온 데이터가 없습니다. 종료합니다.');
      return;
    }

    console.log(`✅ 총 ${all.length}건 불러옴, 시트에 업데이트 중...`);

    // 6) 시트에 기록할 범위(탭 이름 꼭 확인!)
    const DATA_RANGE = 'grantgenie_template!A2:J'; // 데이터 본문
    const META_RANGE = 'grantgenie_template!K1:K2'; // 메타(K1,K2)

    // 7) 기존 데이터 지우기
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SHEET_ID,
      range: DATA_RANGE,
    });

    // 8) 새 데이터 쓰기
    const rows = all.map(toRow);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: DATA_RANGE,
      valueInputOption: 'RAW',
      requestBody: { values: rows },
    });

    // 9) 메타정보(업데이트 시간/건수) 기록
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: META_RANGE,
      valueInputOption: 'RAW',
      requestBody: {
        values: [
          [`Last updated: ${new Date().toISOString()}`],
          [`Rows: ${all.length}`],
        ],
      },
    });

    console.log(`🎯 ${all.length}건 업로드 완료 (시트ID: ${SHEET_ID})`);
  } catch (err) {
    // 구글 API 에러 바디가 있으면 우선 출력
    const msg = err?.response?.data || err?.message || err;
    console.error('❌ 자동 업데이트 오류:', msg);
  }
}

updateSheet();
