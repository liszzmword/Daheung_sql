/**
 * Text-to-SQL 모듈 (SQL 생성 + 실행 + 답변)
 */
import { ai, GEN_MODEL } from "./clients.mjs";
import { supabase } from "./clients.mjs";
import { TABLE_SCHEMA } from "./schema.mjs";

const FORBIDDEN_SQL = /\b(DROP|DELETE|UPDATE|INSERT|ALTER|TRUNCATE|CREATE|GRANT|REVOKE)\b/i;

/** Gemini 응답에서 순수 SQL만 추출 */
function cleanSQL(raw) {
  let sql = raw.trim();

  // 1. 코드블록이 있으면 안의 내용만 추출
  const codeBlock = sql.match(/```(?:sql)?\s*\n?([\s\S]*?)```/);
  if (codeBlock) {
    sql = codeBlock[1].trim();
  }

  // 2. SELECT/WITH 이전의 설명 텍스트 제거
  const sqlStart = sql.search(/\b(SELECT|WITH)\b/i);
  if (sqlStart > 0) {
    sql = sql.substring(sqlStart);
  }

  // 3. 주석 제거
  sql = sql.replace(/--.*$/gm, "");
  sql = sql.replace(/\/\*[\s\S]*?\*\//g, "");

  // 4. SQL 끝 이후 설명문 제거 (빈 줄 후 문장)
  sql = sql.replace(/\n\s*\n\s*(?:[가-힣A-Za-z])[\s\S]*$/, "");

  // 5. 세미콜론 및 공백 정리
  sql = sql.replace(/;[\s]*$/g, "").trim();

  return sql;
}

/** 생성된 SQL 안전성 검증 */
export function validateSQL(sql) {
  if (FORBIDDEN_SQL.test(sql)) {
    throw new Error("허용되지 않는 SQL 명령입니다. SELECT만 사용 가능합니다.");
  }
  const trimmed = sql.trim().toUpperCase();
  if (!trimmed.startsWith("SELECT") && !trimmed.startsWith("WITH")) {
    throw new Error("SELECT 또는 WITH(CTE)로 시작하는 쿼리만 허용됩니다.");
  }
  return sql;
}

/** 대화 이력을 프롬프트 텍스트로 변환 */
function formatHistory(history) {
  if (!history || history.length === 0) return "";

  const turns = history.map((h) => {
    if (h.role === "user") return `사용자: ${h.content}`;
    let text = `시스템 답변 요약: ${(h.content || "").slice(0, 200)}`;
    if (h.sql) text += `\n[실행된 SQL]\n${h.sql}`;
    if (h.rowCount != null) text += `\n[결과 건수: ${h.rowCount}건]`;
    return text;
  }).join("\n\n");

  return `
# 이전 대화 맥락
${turns}

# 맥락 활용 규칙 (매우 중요 - 반드시 따를 것)
- 사용자가 "그 기업들", "위 결과", "해당 거래처", "이 제품들" 등 이전 결과를 참조하면:
  → 이전에 실행된 SQL을 WITH(CTE) 서브쿼리로 감싸서 새 SQL에서 재활용하세요.
  → 절대로 데이터 값을 직접 나열(하드코딩)하지 마세요.
  → 예시: WITH prev_result AS ( <이전 SQL> ) SELECT ... FROM sales_clean WHERE customer_name IN (SELECT customer_name FROM prev_result)
- 이전 대화와 무관한 완전히 새로운 질문이면 맥락을 무시하고 독립적으로 SQL을 생성하세요.
`;
}

/** 자연어 질문 → SQL 생성 */
export async function generateSQL(question, ragContext, history = []) {
  const historyText = formatHistory(history);

  const prompt = `PostgreSQL SQL 전문가로서 사용자 질문을 SQL로 변환하세요.

# 테이블 스키마
${TABLE_SCHEMA}

# 비즈니스 규칙 (RAG 검색 결과)
${ragContext || "관련 비즈니스 규칙이 검색되지 않았습니다."}
${historyText}
# 질문
${question}

# SQL 생성 규칙
- SELECT 문만 생성 (WITH CTE 허용)
- 매출 계산: supply_amount 사용 (부가세 제외)
- 연도 추출: EXTRACT(YEAR FROM sale_date)
- 월 추출: EXTRACT(MONTH FROM sale_date)
- 금액은 숫자 그대로 반환 (포맷팅 불필요)
- 세미콜론(;) 제외
- 주석/설명 없이 SQL만 반환

# 이름 검색 규칙 (중요 - 반드시 따를 것)
- customer_name, product_name 검색 시 오타/유사 입력을 허용하기 위해 아래 패턴 사용
- CTE로 가장 유사한 이름 1개를 먼저 특정한 후, 해당 이름으로 필터링
- 고객명 검색 예시:
  WITH matched_customer AS (
    SELECT customer_name FROM (
      SELECT DISTINCT customer_name,
        CASE WHEN customer_name LIKE '%검색어%' THEN 0 ELSE 1 END AS priority,
        similarity(customer_name, '검색어') AS sim
      FROM sales_clean
      WHERE customer_name LIKE '%검색어%'
         OR similarity(customer_name, '검색어') > 0.3
    ) t
    ORDER BY priority, sim DESC
    LIMIT 1
  )
  SELECT ... FROM sales_clean
  WHERE customer_name = (SELECT customer_name FROM matched_customer)
- 제품명 검색도 동일한 패턴 사용 (product_name으로 대체)
- sales_rep(담당자)만 정확 일치(=) 허용
- = 직접 비교 사용 금지 (customer_name = '...' 금지)

# 성장률/증감률 계산 규칙
- 연도별 매출은 EXTRACT(YEAR FROM sale_date)::int AS year 로 추출 (정수형 필수)
- 전년 대비 증감률: LAG() 윈도우 함수 사용
  예시: ROUND((yearly_sales - LAG(yearly_sales) OVER (ORDER BY year)) * 100.0 / NULLIF(LAG(yearly_sales) OVER (ORDER BY year), 0), 1) AS growth_rate_pct
- 연평균 성장률(CAGR) 계산:
  예시: ROUND((POWER(last_year_sales::numeric / NULLIF(first_year_sales::numeric, 0), 1.0 / NULLIF(year_count - 1, 0)) - 1) * 100, 1) AS cagr_pct
- 성장률 결과는 소수점 1자리까지 ROUND 처리
- 0으로 나누기 방지를 위해 반드시 NULLIF 사용

SQL:`;

  const result = await ai.models.generateContent({
    model: GEN_MODEL,
    contents: [prompt],
  });

  let sql = result.text.trim();
  sql = cleanSQL(sql);
  return sql;
}

/** SQL 실행 (Supabase exec_sql RPC) */
export async function executeSQL(sql) {
  try {
    validateSQL(sql);
    const { data, error } = await supabase.rpc("exec_sql", { query: sql });
    if (error) {
      return { success: false, error: `DB 오류: ${error.message || JSON.stringify(error)}`, sql };
    }
    return { success: true, data, rowCount: data?.length || 0 };
  } catch (err) {
    return { success: false, error: err.message, sql };
  }
}

/** SQL 결과를 자연어 답변으로 변환 */
export async function generateSQLAnswer(question, sql, result) {
  const resultText = result.success
    ? JSON.stringify(result.data, null, 2)
    : `오류: ${result.error}`;

  const prompt = `세일즈 데이터 분석 전문가로서 SQL 결과를 설명하세요.

질문: ${question}
SQL: ${sql}
결과: ${resultText}

답변 지침:
- 고객명/제품명은 질문이 아닌 SQL 결과 데이터에 있는 실제 이름을 사용 (오타 교정 반영)
- 금액은 천 단위 콤마 사용 (예: 1,234,567원)
- 매출은 "원" 단위 표시
- 연도는 콤마 없이 그대로 표시 (예: 2019, 2020, 2024)
- 비율/퍼센트는 소수점 1자리까지 표시 (예: 12.3%)
- 간결하고 명확하게
- 결과 없으면 "해당 조건에 맞는 데이터가 없습니다" 안내
- SQL 오류가 있으면 원인 설명

답변:`;

  const response = await ai.models.generateContent({
    model: GEN_MODEL,
    contents: [prompt],
  });
  return response.text;
}

/** SQL 생성 + 실행 (실패 시 재시도) */
export async function generateAndExecuteSQL(question, ragContext, maxRetries = 1, history = []) {
  let lastError = null;
  let lastSQL = null;

  for (let i = 0; i <= maxRetries; i++) {
    const errorHint = lastError
      ? `\n\n⚠️ 이전 시도에서 오류 발생: ${lastError}\n수정된 SQL을 생성하세요.`
      : "";

    const sql = await generateSQL(question, ragContext + errorHint, history);
    lastSQL = sql;

    const result = await executeSQL(sql);
    if (result.success) return { sql, result };

    lastError = result.error;
  }

  return { sql: lastSQL, result: { success: false, error: lastError } };
}
