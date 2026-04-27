/**
 * RAG (벡터 검색 + 답변 생성) 모듈
 */
import { ai, GEN_MODEL } from "./clients.mjs";
import { supabase } from "./clients.mjs";

/** Supabase에서 유사 문서 검색 */
export async function searchRelevantDocs(embedding, { threshold = 0.5, count = 3 } = {}) {
  const { data, error } = await supabase.rpc("match_documents", {
    query_embedding: embedding,
    match_threshold: threshold,
    match_count: count,
  });
  if (error) throw error;
  return data || [];
}

/** 검색된 문서들을 컨텍스트 문자열로 조합 */
export function buildContext(docs) {
  if (!docs || docs.length === 0) return "";
  return docs.map((d) => `[${d.doc_id}]\n${d.content}`).join("\n\n---\n\n");
}

/** 대화 이력을 프롬프트 텍스트로 변환 (RAG용) */
function formatRAGHistory(history) {
  if (!history || history.length === 0) return "";

  const turns = history.map((h) => {
    if (h.role === "user") return `사용자: ${h.content}`;
    return `시스템: ${(h.content || "").slice(0, 300)}`;
  }).join("\n");

  return `
# 이전 대화
${turns}

- 사용자가 이전 대화를 참조하면 맥락을 이어서 답변하세요.
- 이전 대화와 무관한 새 질문이면 맥락을 무시하세요.
`;
}

/** RAG 문서 기반 답변 생성 (문서 질의응답 모드) */
export async function generateRAGAnswer(question, context, history = []) {
  const historyText = formatRAGHistory(history);

  const prompt = `당신은 세일즈 데이터 분석 전문가입니다. 아래 문서 내용을 바탕으로 질문에 답변해주세요.

# 참고 문서
${context}
${historyText}
# 질문
${question}

# 답변 지침
1. 문서에 있는 정보만 사용하세요
2. 명확하고 구체적으로 답변하세요
3. 관련 수치나 예시가 있다면 포함하세요
4. 문서에 없는 내용이면 "문서에서 해당 정보를 찾을 수 없습니다"라고 답변하세요

답변:`;

  const result = await ai.models.generateContent({
    model: GEN_MODEL,
    contents: prompt,
  });
  return result.text;
}
