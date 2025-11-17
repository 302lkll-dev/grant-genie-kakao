import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 10000;  // ← Render는 PORT, 로컬은 10000 사용

// 경로 설정
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 정적 파일 경로 설정 (public 폴더)
app.use(express.static(path.join(__dirname, "public")));

// 정책 데이터 불러오기
function loadPolicies() {
  try {
    const data = fs.readFileSync("./policies.json", "utf8");
    return JSON.parse(data);
  } catch (err) {
    console.error("❌ 정책 파일 로드 오류:", err);
    return [];
  }
}

// 정책 전체 제공
app.get("/policies.json", (req, res) => {
  const policies = loadPolicies();
  res.json(policies);
});

// 메인 페이지
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 서버 실행
app.listen(PORT, () => {
  console.log(`지원지니 running on port ${PORT}`);
});
