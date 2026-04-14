/**
 * 동기화 현황 API
 * GET /api/sync-status
 * 세일즈/영업일지 데이터 건수 + 최근 동기화 시간
 */
import { supabase, validateEnv } from "../lib/clients.mjs";
import { verifyAuth, setCorsHeaders, sendUnauthorized } from "../lib/auth.mjs";

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!verifyAuth(req)) return sendUnauthorized(res);

  try {
    validateEnv();

    // 세일즈 건수
    const { count: salesCount } = await supabase
      .from("sales_clean")
      .select("id", { count: "exact", head: true });

    // 영업일지 건수
    const { count: diaryCount } = await supabase
      .from("sales_diary")
      .select("id", { count: "exact", head: true });

    // 최근 동기화 로그
    const { data: lastSync } = await supabase
      .from("sync_log")
      .select("sync_type, filename, rows_inserted, status, synced_at")
      .order("synced_at", { ascending: false })
      .limit(5);

    return res.status(200).json({
      success: true,
      sales_count: salesCount || 0,
      diary_count: diaryCount || 0,
      recent_syncs: lastSync || [],
    });
  } catch (error) {
    console.error("동기화 현황 오류:", error);
    return res.status(500).json({ success: false, error: "서버 오류가 발생했습니다." });
  }
}
