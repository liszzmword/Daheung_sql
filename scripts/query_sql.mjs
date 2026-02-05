import "dotenv/config";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

// 클라이언트 초기화
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 테이블 스키마 정보
const TABLE_SCHEMA = `
테이블명: sales_clean

컬럼 정보:
- id: 고유 ID (number)
- row_no: 행 번호 (number)
- sale_date: 매출일 (string, 형식: YYYY-MM-DD, 예: '2019-04-18')
- customer_name: 거래처명 (string, 예: '세명아크릴')
- customer_code: 거래처 코드 (string, 예: '20190418001')
- sales_rep: 영업 담당자 (string, 예: '김도순')
- product_name: 제품명 (string, 예: 'PS양면')
- product_group: 제품군 (string, 예: 'OTH')
- qty: 수량 (number)
- unit_price: 판매 단가 (number)
- supply_amount: 공급가액 (부가세 제외) (number) ⭐ 매출 계산 시 이 컬럼 사용
- margin_rate_pct: 마진율 (%, number)
- vat: 부가세 (number)
- total_amount: 합계 (공급가액 + 부가세) (number)
- inserted_at: 입력 일시 (string)

총 행 수: 51,081개
`;

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
 * RAG: 관련 비즈니스 규칙/데이터 정의 검색
 */
async function searchRelevantDocs(embedding, topK = 3) {
  const { data, error } = await supabase.rpc("match_documents", {
    query_embedding: embedding,
    match_threshold: 0.5,
    match_count: topK,
  });

  if (error) throw error;
  return data || [];
}

/**
 * SQL 쿼리 생성
 */
async function generateSQL(question, ragContext) {
  const prompt = `당신은 PostgreSQL SQL 전문가입니다. 사용자 질문을 분석하여 정확한 SQL 쿼리를 생성하세요.

# 테이블 스키마
${TABLE_SCHEMA}

# 비즈니스 규칙 및 데이터 정의 (RAG 검색 결과)
${ragContext}

# 사용자 질문
${question}

# SQL 생성 지침
1. **반드시 PostgreSQL 문법을 사용하세요**
2. **매출 계산 시 supply_amount 컬럼을 사용하세요** (business_rules 참고)
3. **날짜 필터링 시 sale_date 컬럼을 사용하세요** (형식: 'YYYY-MM-DD')
4. **연도 추출**: EXTRACT(YEAR FROM sale_date::date)
5. **월 추출**: EXTRACT(MONTH FROM sale_date::date)
6. **집계 함수**: SUM(), COUNT(), AVG() 등 활용
7. **정렬**: ORDER BY 사용
8. **LIMIT**: 상위 N개 조회 시 사용
9. **고객명 검색**: customer_name LIKE '%검색어%' 또는 customer_name = '정확한이름'
10. **금액 포맷팅**: 결과에 천 단위 콤마 추가 불필요 (숫자로 반환)

# 중요 규칙
- SELECT 문만 생성하세요 (UPDATE, DELETE, DROP 등 금지)
- 세미콜론(;)은 포함하지 마세요
- 주석 없이 SQL 쿼리만 반환하세요
- 문자열은 작은따옴표('')로 감싸세요

SQL 쿼리:`;

  const result = await ai.models.generateContent({
    model: process.env.GEN_MODEL || "gemini-2.5-flash",
    contents: [prompt],
  });
  let sql = result.text.trim();

  // SQL 정리 (마크다운 코드 블록 제거)
  sql = sql.replace(/```sql\n?/g, "").replace(/```\n?/g, "").trim();
  sql = sql.replace(/;$/g, ""); // 세미콜론 제거

  return sql;
}

/**
 * SQL 실행
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

    return {
      success: true,
      data: data,
      rowCount: data?.length || 0,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      sql: sql,
    };
  }
}

/**
 * 결과를 자연어 답변으로 변환
 */
async function generateAnswer(question, sql, result) {
  const resultText = result.success
    ? JSON.stringify(result.data, null, 2)
    : `SQL 실행 오류: ${result.error}`;

  const prompt = `당신은 세일즈 데이터 분석 전문가입니다. SQL 쿼리 결과를 바탕으로 사용자 질문에 친절하게 답변하세요.

# 사용자 질문
${question}

# 실행된 SQL
${sql}

# 쿼리 결과
${resultText}

# 답변 지침
1. 결과를 이해하기 쉽게 설명하세요
2. 숫자는 천 단위 콤마를 넣어서 표시하세요 (예: 1,234,567원)
3. 매출은 "원" 단위로 표시하세요
4. 테이블 형식이 적절하면 마크다운 테이블로 표시하세요
5. 결과가 없으면 "해당 조건에 맞는 데이터가 없습니다"라고 답변하세요
6. SQL 오류가 있으면 원인을 설명하고 재시도 방법을 안내하세요

답변:`;

  const response = await ai.models.generateContent({
    model: process.env.GEN_MODEL || "gemini-2.5-flash",
    contents: [prompt],
  });
  return response.text;
}

/**
 * Text-to-SQL RAG 메인 함수
 */
async function querySQLRAG(question) {
  console.log(`\n🔍 질문: ${question}\n`);
  console.log("=".repeat(80) + "\n");

  try {
    // 1. 질문을 임베딩으로 변환
    console.log("📊 질문 분석 중...");
    const queryEmbedding = await embedQuery(question);

    // 2. 관련 비즈니스 규칙/데이터 정의 검색
    console.log("📚 관련 규칙 검색 중...");
    const relevantDocs = await searchRelevantDocs(queryEmbedding, 3);

    let ragContext = "";
    if (relevantDocs && relevantDocs.length > 0) {
      console.log(`✅ ${relevantDocs.length}개의 관련 문서 발견`);
      ragContext = relevantDocs
        .map((doc) => `[${doc.doc_id}]\n${doc.content}`)
        .join("\n\n---\n\n");
    } else {
      console.log("⚠️  관련 문서 없음 (기본 스키마만 사용)");
      ragContext = "관련 비즈니스 규칙이 검색되지 않았습니다.";
    }

    // 3. SQL 생성
    console.log("🔧 SQL 쿼리 생성 중...\n");
    const sql = await generateSQL(question, ragContext);

    console.log("📝 생성된 SQL:\n");
    console.log("```sql");
    console.log(sql);
    console.log("```\n");

    // 4. SQL 실행
    console.log("⚙️  SQL 실행 중...\n");
    const result = await executeSQL(sql);

    if (!result.success) {
      console.log("❌ SQL 실행 실패:");
      console.log(result.error);
      console.log("\n💡 생성된 SQL을 Supabase에서 직접 실행해보세요.\n");
      return;
    }

    console.log(`✅ 쿼리 성공 (${result.rowCount}개 행 반환)\n`);

    // 5. 자연어 답변 생성
    console.log("💬 답변 생성 중...\n");
    const answer = await generateAnswer(question, sql, result);

    console.log("🤖 답변:\n");
    console.log(answer);
    console.log("\n" + "=".repeat(80) + "\n");

    return {
      question,
      sql,
      result: result.data,
      answer,
    };
  } catch (error) {
    console.error("\n❌ 오류 발생:", error.message);
    console.log("\n" + "=".repeat(80) + "\n");
    throw error;
  }
}

/**
 * 메인 실행
 */
async function main() {
  const question = process.argv[2];

  if (!question) {
    console.error("❌ 사용법: node scripts/query_sql.mjs \"질문 내용\"");
    console.error("\n예시:");
    console.error('  node scripts/query_sql.mjs "2024년 전체 매출은?"');
    console.error('  node scripts/query_sql.mjs "2024년 세명아크릴 매출 알려줘"');
    console.error('  node scripts/query_sql.mjs "상위 10개 거래처는?"');
    console.error('  node scripts/query_sql.mjs "김도순 담당 2024년 매출은?"');
    process.exit(1);
  }

  await querySQLRAG(question);
}

main().catch((e) => {
  console.error("❌ 오류:", e.message);
  process.exit(1);
});
