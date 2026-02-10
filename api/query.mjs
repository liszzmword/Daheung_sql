import { validateEnv } from "../lib/clients.mjs";
import { embedQuery } from "../lib/embedding.mjs";
import { searchRelevantDocs, buildContext, generateRAGAnswer } from "../lib/rag.mjs";
import { logQuery } from "../lib/logger.mjs";

/** RAG 문서 질의응답 API */
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

    const { question, history = [] } = req.body;
    if (!question || typeof question !== "string" || question.trim() === "") {
      return res.status(400).json({ error: "질문을 입력해주세요." });
    }

    const q = question.trim();
    // history 안전성: 배열이고 최대 10턴만 허용
    const safeHistory = Array.isArray(history) ? history.slice(-10) : [];

    const embedding = await embedQuery(q);
    const docs = await searchRelevantDocs(embedding, { count: 5 });

    if (!docs || docs.length === 0) {
      const noDocAnswer = "관련 문서를 찾을 수 없습니다.";
      logQuery({ mode: "rag", question: q, answer: noDocAnswer, success: true });
      return res.status(200).json({
        success: true,
        question: q,
        answer: noDocAnswer,
        sources: [],
      });
    }

    const context = buildContext(docs);
    const answer = await generateRAGAnswer(q, context, safeHistory);
    const sources = docs.map((d) => ({ doc_id: d.doc_id, similarity: d.similarity }));

    logQuery({ mode: "rag", question: q, answer, sources, success: true });

    return res.status(200).json({
      success: true,
      question: q,
      answer,
      sources,
    });
  } catch (error) {
    console.error("API 오류:", error);
    logQuery({ mode: "rag", question: req.body?.question, success: false, error_message: error.message });
    return res.status(500).json({ success: false, error: "서버 오류가 발생했습니다.", message: error.message });
  }
}
