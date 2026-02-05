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

// 테이블 스키마
const TABLE_SCHEMA = `
테이블명: sales_clean
컬럼: id, row_no, sale_date, customer_name, customer_code, sales_rep,
      product_name, product_group, qty, unit_price, supply_amount,
      margin_rate_pct, vat, total_amount, inserted_at
총 행 수: 51,081개
매출 계산: supply_amount 사용 (부가세 제외)
`;

/**
 * 질문을 임베딩으로 변환
 */
async function embedQuery(question) {
  const embedDim = Number(process.env.EMBED_DIM || "1536");
  const res = await ai.models.embedContent({
    model: process.env.EMBED_MODEL || "gemini-embedding-001",
    contents: [question],
    config: { outputDimensionality: embedDim },
  });
  return res.embeddings[0].values || res.embeddings[0];
}

/**
 * RAG: 관련 문서 검색
 */
async function searchRelevantDocs(embedding) {
  const { data, error } = await supabase.rpc("match_documents", {
    query_embedding: embedding,
    match_threshold: 0.5,
    match_count: 3,
  });
  if (error) throw error;
  return data || [];
}

/**
 * SQL 생성
 */
async function generateSQL(question, ragContext) {
  const prompt = `PostgreSQL SQL 전문가로서 사용자 질문을 SQL로 변환하세요.

# 테이블 스키마
${TABLE_SCHEMA}

# 비즈니스 규칙
${ragContext}

# 질문
${question}

# 규칙
- SELECT 문만 생성
- 매출은 supply_amount 사용
- 날짜 형식: 'YYYY-MM-DD'
- 연도: EXTRACT(YEAR FROM sale_date::date)
- 주석/설명 없이 SQL만 반환
- 세미콜론 제외

SQL:`;

  const result = await ai.models.generateContent({
    model: process.env.GEN_MODEL || "gemini-2.5-flash",
    contents: [prompt],
  });
  let sql = result.text.trim();
  sql = sql.replace(/```sql\n?/g, "").replace(/```\n?/g, "").trim();
  sql = sql.replace(/;$/g, "");
  return sql;
}

/**
 * SQL 실행 (간단 버전)
 */
async function executeSQL(sql) {
  try {
    const { data, error } = await supabase.rpc("exec_sql", { query: sql });

    if (error) {
      return {
        success: false,
        error: `Supabase 오류: ${error.message || JSON.stringify(error)}`,
        sql: sql,
      };
    }

    return { success: true, data: data, rowCount: data?.length || 0 };
  } catch (err) {
    return { success: false, error: err.message, sql: sql };
  }
}

/**
 * 답변 생성
 */
async function generateAnswer(question, sql, result) {
  const resultText = result.success
    ? JSON.stringify(result.data, null, 2)
    : `오류: ${result.error}`;

  const prompt = `세일즈 데이터 분석 전문가로서 결과를 설명하세요.

질문: ${question}
SQL: ${sql}
결과: ${resultText}

답변 지침:
- 숫자는 천 단위 콤마 사용
- 매출은 "원" 단위
- 간결하고 명확하게
- 결과 없으면 "데이터 없음" 안내

답변:`;

  const response = await ai.models.generateContent({
    model: process.env.GEN_MODEL || "gemini-2.5-flash",
    contents: [prompt],
  });
  return response.text;
}

/**
 * SQL RAG 쿼리 실행
 */
async function querySQLRAG(question) {
  try {
    const queryEmbedding = await embedQuery(question);
    const relevantDocs = await searchRelevantDocs(queryEmbedding);

    const ragContext =
      relevantDocs.length > 0
        ? relevantDocs.map((d) => d.content).join("\n\n")
        : "기본 스키마만 사용";

    const sql = await generateSQL(question, ragContext);
    console.log(`\n📝 SQL: ${sql}\n`);

    const result = await executeSQL(sql);

    if (!result.success) {
      return `❌ SQL 실행 실패: ${result.error}\n\n생성된 SQL:\n${sql}\n\n💡 Supabase에서 직접 실행해보세요.`;
    }

    const answer = await generateAnswer(question, sql, result);
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
  console.log("🤖 세일즈 SQL RAG 챗봇");
  console.log("=".repeat(80));
  console.log("\n세일즈 데이터에 대해 질문해주세요. SQL을 자동 생성하여 답변합니다.");
  console.log('종료: "exit", "quit", "q" 입력\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const askQuestion = () => {
    rl.question("\n💬 질문: ", async (question) => {
      const trimmed = question.trim().toLowerCase();

      if (["exit", "quit", "q", "종료"].includes(trimmed)) {
        console.log("\n👋 챗봇을 종료합니다. 감사합니다!\n");
        rl.close();
        return;
      }

      if (!question.trim()) {
        askQuestion();
        return;
      }

      console.log("\n🔍 분석 중...");
      const answer = await querySQLRAG(question.trim());

      console.log("\n🤖 답변:\n");
      console.log(answer);
      console.log("\n" + "-".repeat(80));

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
