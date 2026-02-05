import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

// 환경 변수에서 설정 가져오기
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEN_MODEL = process.env.GEN_MODEL || "gemini-2.5-flash";
const EMBED_MODEL = process.env.EMBED_MODEL || "gemini-embedding-001";
const EMBED_DIM = Number(process.env.EMBED_DIM || "1536");

// 클라이언트 초기화
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * 질문을 임베딩으로 변환
 */
async function embedQuery(question) {
  const res = await ai.models.embedContent({
    model: EMBED_MODEL,
    contents: [question],
    config: {
      outputDimensionality: EMBED_DIM,
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
    match_threshold: 0.5,
    match_count: topK,
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

  const result = await ai.models.generateContent({
    model: GEN_MODEL,
    contents: prompt,
  });

  return result.text;
}

/**
 * RAG 쿼리 메인 함수
 */
async function queryRAG(question) {
  // 1. 질문을 임베딩으로 변환
  const queryEmbedding = await embedQuery(question);

  // 2. 유사한 청크 검색
  const similarChunks = await searchSimilarChunks(queryEmbedding, 5);

  if (!similarChunks || similarChunks.length === 0) {
    return {
      answer: "관련 문서를 찾을 수 없습니다.",
      sources: [],
    };
  }

  // 3. 컨텍스트 구성
  const context = similarChunks
    .map((chunk) => `[${chunk.doc_id}]\n${chunk.content}`)
    .join("\n\n---\n\n");

  // 4. 답변 생성
  const answer = await generateAnswer(question, context);

  return {
    answer,
    sources: similarChunks.map((c) => ({
      doc_id: c.doc_id,
      similarity: c.similarity,
    })),
  };
}

/**
 * Vercel Serverless Function Handler
 */
export default async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,POST");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  // OPTIONS 요청 처리 (CORS preflight)
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // POST 요청만 허용
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { question } = req.body;

    // 질문 검증
    if (!question || typeof question !== "string" || question.trim() === "") {
      return res.status(400).json({ error: "질문을 입력해주세요." });
    }

    // 환경 변수 검증
    if (!GEMINI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({
        error: "서버 설정 오류: 환경 변수가 설정되지 않았습니다.",
      });
    }

    // RAG 쿼리 실행
    const result = await queryRAG(question.trim());

    return res.status(200).json({
      success: true,
      question: question.trim(),
      ...result,
    });
  } catch (error) {
    console.error("API 오류:", error);
    return res.status(500).json({
      success: false,
      error: "서버 오류가 발생했습니다.",
      message: error.message,
    });
  }
}
