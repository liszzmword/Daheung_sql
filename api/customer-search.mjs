import { supabase, validateEnv } from "../lib/clients.mjs";
import { verifyAuth, setCorsHeaders, sendUnauthorized } from "../lib/auth.mjs";

/** 거래처명 자동완성 검색 (정식 명칭 입력 보조) */
export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!verifyAuth(req)) return sendUnauthorized(res);

  try {
    validateEnv();

    const q = (req.query?.q || "").toString().trim();
    if (!q) return res.status(200).json({ success: true, customers: [] });

    const limit = Math.min(parseInt(req.query?.limit, 10) || 20, 50);

    // customers 마스터 + sales_clean.customer_name 합쳐서 distinct
    const [c1, c2] = await Promise.all([
      supabase
        .from("customers")
        .select("company_name")
        .ilike("company_name", `%${q}%`)
        .limit(limit),
      supabase
        .from("sales_clean")
        .select("customer_name")
        .ilike("customer_name", `%${q}%`)
        .limit(limit * 3),
    ]);

    const set = new Set();
    (c1.data || []).forEach((r) => r.company_name && set.add(r.company_name));
    (c2.data || []).forEach((r) => r.customer_name && set.add(r.customer_name));

    const sorted = Array.from(set)
      .sort((a, b) => a.length - b.length || a.localeCompare(b, "ko"))
      .slice(0, limit);

    return res.status(200).json({ success: true, customers: sorted });
  } catch (error) {
    console.error("/api/customer-search 오류:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
