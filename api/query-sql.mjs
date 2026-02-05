import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEN_MODEL = process.env.GEN_MODEL || "gemini-2.5-flash";
const EMBED_MODEL = process.env.EMBED_MODEL || "gemini-embedding-001";
const EMBED_DIM = Number(process.env.EMBED_DIM || "1536");

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const TABLE_SCHEMA = `
테이블명: sales_clean
컬럼: sale_date (YYYY-MM-DD), customer_name, sales_rep, product_name,
      supply_amount (매출-부가세제외), total_amount (매출+부가세),
      qty, unit_price, margin_rate_pct, vat
매출 계산: supply_amount 사용`;

async function embedQuery(question) {
  const res = await ai.models.embedContent({
    model: EMBED_MODEL,
    contents: [question],
    config: { outputDimensionality: EMBED_DIM },
  });
  return res.embeddings[0].values || res.embeddings[0];
}

async function searchRelevantDocs(embedding) {
  const { data, error } = await supabase.rpc("match_documents", {
    query_embedding: embedding,
    match_threshold: 0.5,
    match_count: 3,
  });
  if (error) throw error;
  return data || [];
}

async function generateSQL(question, ragContext) {
  const prompt = `PostgreSQL SQL 전문가로서 질문을 SQL로 변환하세요.

${TABLE_SCHEMA}

비즈니스 규칙: ${ragContext}

질문: ${question}

규칙:
- SELECT만 생성
- 매출은 supply_amount 사용
- 날짜: EXTRACT(YEAR FROM sale_date::date) for year
- 세미콜론 제외
- SQL만 반환

SQL:`;

  const result = await ai.models.generateContent({
    model: GEN_MODEL,
    contents: prompt,
  });

  let sql = result.text.trim();
  sql = sql.replace(/```sql\n?/g, "").replace(/```\n?/g, "").trim();
  sql = sql.replace(/;$/g, "");
  return sql;
}

async function executeSQL(sql) {
  try {
    const { data, error } = await supabase.rpc("exec_sql", { query: sql });
    if (error) {
      return {
        success: false,
        error: `DB 오류: ${error.message}`,
        sql: sql,
      };
    }
    return { success: true, data: data, rowCount: data?.length || 0 };
  } catch (err) {
    return { success: false, error: err.message, sql: sql };
  }
}

async function generateAnswer(question, sql, result) {
  const resultText = result.success
    ? JSON.stringify(result.data, null, 2)
    : `오류: ${result.error}`;

  const prompt = `SQL 결과를 쉽게 설명하세요.

질문: ${question}
SQL: ${sql}
결과: ${resultText}

- 숫자는 천 단위 콤마 사용
- 매출은 "원" 단위
- 간결하게

답변:`;

  const response = await ai.models.generateContent({
    model: GEN_MODEL,
    contents: prompt,
  });
  return response.text;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,POST");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { question } = req.body;

    if (!question || typeof question !== "string" || question.trim() === "") {
      return res.status(400).json({ error: "질문을 입력해주세요." });
    }

    if (!GEMINI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({
        error: "서버 설정 오류",
      });
    }

    const queryEmbedding = await embedQuery(question.trim());
    const relevantDocs = await searchRelevantDocs(queryEmbedding);

    const ragContext =
      relevantDocs.length > 0
        ? relevantDocs.map((d) => d.content).join("\n")
        : "기본 스키마 사용";

    const sql = await generateSQL(question.trim(), ragContext);
    const result = await executeSQL(sql);

    if (!result.success) {
      return res.status(200).json({
        success: false,
        question: question.trim(),
        sql: sql,
        error: result.error,
      });
    }

    const answer = await generateAnswer(question.trim(), sql, result);

    return res.status(200).json({
      success: true,
      question: question.trim(),
      sql: sql,
      data: result.data,
      answer: answer,
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
