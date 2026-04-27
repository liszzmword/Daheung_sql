import { validateEnv } from "../lib/clients.mjs";
import { embedQuery } from "../lib/embedding.mjs";
import { searchRelevantDocs, buildContext, streamRAGAnswer } from "../lib/rag.mjs";
import { fetchAliases, expandAliases } from "../lib/aliases.mjs";
import { logQuery } from "../lib/logger.mjs";
import { verifyAuth, setCorsHeaders, sendUnauthorized } from "../lib/auth.mjs";

function sendSSE(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** RAG 문서 질의응답 API (SSE 스트리밍) */
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

    const rawQ = question.trim();
    const safeHistory = Array.isArray(history) ? history.slice(-10) : [];

    // 별칭 치환
    const aliases = await fetchAliases();
    const q = expandAliases(rawQ, aliases);

    const embedding = await embedQuery(q);
    const docs = await searchRelevantDocs(embedding, { count: 5 });

    if (!docs || docs.length === 0) {
      const noDocAnswer = "관련 문서를 찾을 수 없습니다.";
      logQuery({ mode: "rag", question: rawQ, answer: noDocAnswer, success: true });
      return res.status(200).json({
        success: true,
        question: rawQ,
        answer: noDocAnswer,
        sources: [],
      });
    }

    const context = buildContext(docs);
    const sources = docs.map((d) => ({ doc_id: d.doc_id, similarity: d.similarity }));

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    sendSSE(res, "meta", { success: true, question: rawQ, sources });

    let fullAnswer = "";
    for await (const chunk of streamRAGAnswer(rawQ, context, safeHistory)) {
      fullAnswer += chunk;
      sendSSE(res, "delta", { text: chunk });
    }

    sendSSE(res, "done", { answer: fullAnswer });
    res.end();

    logQuery({ mode: "rag", question: rawQ, answer: fullAnswer, sources, success: true });
  } catch (error) {
    console.error("API 오류:", error);
    if (res.headersSent) {
      sendSSE(res, "error", { error: error.message });
      res.end();
    } else {
      res.status(500).json({ success: false, error: "서버 오류가 발생했습니다.", message: error.message });
    }
    logQuery({ mode: "rag", question: req.body?.question, success: false, error_message: error.message });
  }
}
