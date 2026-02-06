import { validateEnv } from "../lib/clients.mjs";
import { embedQuery } from "../lib/embedding.mjs";
import { searchRelevantDocs, buildContext } from "../lib/rag.mjs";
import { generateAndExecuteSQL, generateSQLAnswer } from "../lib/sql.mjs";

/** Text-to-SQL 데이터 조회 API */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,POST");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    validateEnv();

    const { question } = req.body;
    if (!question || typeof question !== "string" || question.trim() === "") {
      return res.status(400).json({ error: "질문을 입력해주세요." });
    }

    const q = question.trim();

    // 1. RAG 검색으로 비즈니스 규칙 가져오기
    const embedding = await embedQuery(q);
    const docs = await searchRelevantDocs(embedding);
    const ragContext = buildContext(docs) || "기본 스키마 사용";

    // 2. SQL 생성 + 실행 (실패 시 1회 재시도)
    const { sql, result } = await generateAndExecuteSQL(q, ragContext);

    if (!result.success) {
      return res.status(200).json({
        success: false,
        question: q,
        sql,
        error: result.error,
      });
    }

    // 3. 자연어 답변 생성
    const answer = await generateSQLAnswer(q, sql, result);

    return res.status(200).json({
      success: true,
      question: q,
      sql,
      data: result.data,
      answer,
    });
  } catch (error) {
    console.error("API 오류:", error);
    return res.status(500).json({ success: false, error: "서버 오류가 발생했습니다.", message: error.message });
  }
}
