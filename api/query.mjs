import { validateEnv } from "../lib/clients.mjs";
import { embedQuery } from "../lib/embedding.mjs";
import { searchRelevantDocs, buildContext, generateRAGAnswer } from "../lib/rag.mjs";

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

    const { question } = req.body;
    if (!question || typeof question !== "string" || question.trim() === "") {
      return res.status(400).json({ error: "질문을 입력해주세요." });
    }

    const q = question.trim();
    const embedding = await embedQuery(q);
    const docs = await searchRelevantDocs(embedding, { count: 5 });

    if (!docs || docs.length === 0) {
      return res.status(200).json({
        success: true,
        question: q,
        answer: "관련 문서를 찾을 수 없습니다.",
        sources: [],
      });
    }

    const context = buildContext(docs);
    const answer = await generateRAGAnswer(q, context);

    return res.status(200).json({
      success: true,
      question: q,
      answer,
      sources: docs.map((d) => ({ doc_id: d.doc_id, similarity: d.similarity })),
    });
  } catch (error) {
    console.error("API 오류:", error);
    return res.status(500).json({ success: false, error: "서버 오류가 발생했습니다.", message: error.message });
  }
}
