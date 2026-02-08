import { supabase, validateEnv } from "../lib/clients.mjs";

/** 질문/답변 히스토리 조회 API */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    validateEnv();

    const { mode, limit = "30", offset = "0", from, to } = req.query;
    const limitNum = Math.min(Number(limit) || 30, 100);
    const offsetNum = Number(offset) || 0;

    let query = supabase
      .from("query_logs")
      .select("id, mode, question, answer, sql_generated, success, error_message, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offsetNum, offsetNum + limitNum - 1);

    if (mode && (mode === "rag" || mode === "sql")) {
      query = query.eq("mode", mode);
    }

    // 날짜 필터
    if (from) {
      query = query.gte("created_at", `${from}T00:00:00`);
    }
    if (to) {
      query = query.lte("created_at", `${to}T23:59:59`);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    return res.status(200).json({
      success: true,
      data,
      total: count,
      limit: limitNum,
      offset: offsetNum,
    });
  } catch (error) {
    console.error("히스토리 조회 오류:", error);
    return res.status(500).json({ success: false, error: "서버 오류가 발생했습니다." });
  }
}
