import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

// 클라이언트 초기화
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * 질문을 임베딩으로 변환
 */
async function embedQuery(question) {
  const embedDim = Number(process.env.EMBED_DIM || "1536");

  const res = await ai.models.embedContent({
    model: process.env.EMBED_MODEL || "gemini-embedding-001",
    contents: [question],
    config: {
      outputDimensionality: embedDim,
    },
  });

  return res.embeddings[0].values || res.embeddings[0];
}

/**
 * Supabase에서 유사한 청크 검색 (벡터 유사도 검색)
 */
async function searchSimilarChunks(embedding, topK = 5) {
  const { data, error } = await supabase.rpc("match_documents", {
    query_embedding: embedding,
    match_threshold: 0.5, // 유사도 임계값 (0~1)
    match_count: topK, // 상위 K개
  });

  if (error) {
    console.error("검색 오류:", error);
    throw error;
  }

  return data;
}

/**
 * RAG: 검색된 컨텍스트로 답변 생성
 */
async function generateAnswer(question, context) {
  const model = ai.models.generate({
    model: process.env.GEN_MODEL || "gemini-2.5-flash",
  });

  const prompt = `당신은 세일즈 데이터 분석 전문가입니다. 아래 문서 내용을 바탕으로 질문에 답변해주세요.

# 참고 문서
${context}

# 질문
${question}

# 답변 지침
1. 문서에 있는 정보만 사용하세요
2. 명확하고 구체적으로 답변하세요
3. 관련 수치나 예시가 있다면 포함하세요
4. 문서에 없는 내용이면 "문서에서 해당 정보를 찾을 수 없습니다"라고 답변하세요

답변:`;

  const result = await model.generateContent({ contents: prompt });
  return result.response.text();
}

/**
 * RAG 쿼리 메인 함수
 */
async function queryRAG(question) {
  console.log(`\n🔍 질문: ${question}\n`);

  // 1. 질문을 임베딩으로 변환
  console.log("📊 임베딩 생성 중...");
  const queryEmbedding = await embedQuery(question);

  // 2. 유사한 청크 검색
  console.log("🔎 관련 문서 검색 중...");
  const similarChunks = await searchSimilarChunks(queryEmbedding, 5);

  if (!similarChunks || similarChunks.length === 0) {
    console.log("❌ 관련 문서를 찾을 수 없습니다.");
    return null;
  }

  console.log(`✅ ${similarChunks.length}개의 관련 청크 발견\n`);

  // 검색된 청크 정보 출력
  console.log("📄 검색된 문서:");
  similarChunks.forEach((chunk, idx) => {
    console.log(
      `  ${idx + 1}. ${chunk.doc_id} (유사도: ${(chunk.similarity * 100).toFixed(1)}%)`
    );
  });
  console.log();

  // 3. 컨텍스트 구성
  const context = similarChunks
    .map((chunk) => `[${chunk.doc_id}]\n${chunk.content}`)
    .join("\n\n---\n\n");

  // 4. 답변 생성
  console.log("💬 답변 생성 중...\n");
  const answer = await generateAnswer(question, context);

  console.log("🤖 답변:\n");
  console.log(answer);
  console.log("\n" + "=".repeat(80) + "\n");

  return {
    question,
    answer,
    sources: similarChunks.map((c) => ({
      doc_id: c.doc_id,
      similarity: c.similarity,
    })),
  };
}

/**
 * 메인 실행
 */
async function main() {
  const question = process.argv[2];

  if (!question) {
    console.error("❌ 사용법: node scripts/query_rag.mjs \"질문 내용\"");
    console.error("\n예시:");
    console.error('  node scripts/query_rag.mjs "2024년 매출 계산 방법은?"');
    console.error('  node scripts/query_rag.mjs "이탈 고객은 어떻게 정의하나요?"');
    process.exit(1);
  }

  await queryRAG(question);
}

main().catch((e) => {
  console.error("❌ 오류:", e.message);
  process.exit(1);
});
