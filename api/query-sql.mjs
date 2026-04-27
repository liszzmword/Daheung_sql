import { validateEnv } from "../lib/clients.mjs";
import { embedQuery } from "../lib/embedding.mjs";
import { searchRelevantDocs, buildContext } from "../lib/rag.mjs";
import { generateAndExecuteSQL, streamSQLAnswer } from "../lib/sql.mjs";
import { logQuery } from "../lib/logger.mjs";
import { verifyAuth, setCorsHeaders, sendUnauthorized } from "../lib/auth.mjs";

function sendSSE(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** Text-to-SQL 데이터 조회 API (SSE 스트리밍) */
export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!verifyAuth(req)) return sendUnauthorized(res);

  try {
    validateEnv();

    const { question, history = [] } = req.body;
    if (!question || typeof question !== "string" || question.trim() === "") {
      return res.status(400).json({ error: "질문을 입력해주세요." });
    }

    const q = question.trim();
    const safeHistory = Array.isArray(history) ? history.slice(-10) : [];

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    // 1. RAG 검색으로 비즈니스 규칙 가져오기
    const embedding = await embedQuery(q);
    const docs = await searchRelevantDocs(embedding);
    const ragContext = buildContext(docs) || "기본 스키마 사용";

    // 2. SQL 생성 + 실행 (실패 시 1회 재시도)
    const { sql, result } = await generateAndExecuteSQL(q, ragContext, 1, safeHistory);

    if (!result.success) {
      sendSSE(res, "error", { success: false, question: q, sql, error: result.error });
      res.end();
      logQuery({ mode: "sql", question: q, sql_generated: sql, success: false, error_message: result.error });
      return;
    }

    // 3. SQL + 데이터를 즉시 전송 (테이블이 답변보다 먼저 보임)
    sendSSE(res, "meta", { success: true, question: q, sql, data: result.data });

    // 4. 자연어 답변 스트리밍
    let fullAnswer = "";
    for await (const chunk of streamSQLAnswer(q, sql, result)) {
      fullAnswer += chunk;
      sendSSE(res, "delta", { text: chunk });
    }

    sendSSE(res, "done", { answer: fullAnswer });
    res.end();

    logQuery({ mode: "sql", question: q, answer: fullAnswer, sql_generated: sql, data: result.data, success: true });
  } catch (error) {
    console.error("API 오류:", error);
    if (res.headersSent) {
      sendSSE(res, "error", { error: error.message });
      res.end();
    } else {
      res.status(500).json({ success: false, error: "서버 오류가 발생했습니다.", message: error.message });
    }
    logQuery({ mode: "sql", question: req.body?.question, success: false, error_message: error.message });
  }
}
