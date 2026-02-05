import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import readline from "readline";

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
 * Supabase에서 유사한 청크 검색
 */
async function searchSimilarChunks(embedding, topK = 5) {
  const { data, error } = await supabase.rpc("match_documents", {
    query_embedding: embedding,
    match_threshold: 0.5,
    match_count: topK,
  });

  if (error) throw error;
  return data;
}

/**
 * RAG 답변 생성
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
  try {
    // 1. 임베딩 생성
    const queryEmbedding = await embedQuery(question);

    // 2. 유사한 청크 검색
    const similarChunks = await searchSimilarChunks(queryEmbedding, 5);

    if (!similarChunks || similarChunks.length === 0) {
      return "관련 문서를 찾을 수 없습니다.";
    }

    // 3. 컨텍스트 구성
    const context = similarChunks
      .map((chunk) => `[${chunk.doc_id}]\n${chunk.content}`)
      .join("\n\n---\n\n");

    // 4. 답변 생성
    const answer = await generateAnswer(question, context);

    return answer;
  } catch (error) {
    return `오류 발생: ${error.message}`;
  }
}

/**
 * 대화형 CLI
 */
async function startChat() {
  console.log("\n" + "=".repeat(80));
  console.log("🤖 세일즈 RAG 챗봇");
  console.log("=".repeat(80));
  console.log("\n세일즈 데이터 분석에 대해 질문해주세요.");
  console.log("종료하려면 'exit', 'quit', 'q'를 입력하세요.\n");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const askQuestion = () => {
    rl.question("\n💬 질문: ", async (question) => {
      const trimmed = question.trim().toLowerCase();

      // 종료 명령어
      if (["exit", "quit", "q", "종료"].includes(trimmed)) {
        console.log("\n👋 챗봇을 종료합니다. 감사합니다!\n");
        rl.close();
        return;
      }

      // 빈 입력
      if (!question.trim()) {
        askQuestion();
        return;
      }

      // RAG 쿼리 실행
      console.log("\n🔍 답변 생성 중...\n");
      const answer = await queryRAG(question.trim());

      console.log("🤖 답변:\n");
      console.log(answer);
      console.log("\n" + "-".repeat(80));

      // 다음 질문
      askQuestion();
    });
  };

  askQuestion();
}

/**
 * 메인 실행
 */
async function main() {
  try {
    await startChat();
  } catch (error) {
    console.error("❌ 오류:", error.message);
    process.exit(1);
  }
}

main();
