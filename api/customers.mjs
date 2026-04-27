import { supabase, validateEnv } from "../lib/clients.mjs";
import { normalizeName } from "../lib/customers.mjs";
import { verifyAuth, setCorsHeaders, sendUnauthorized } from "../lib/auth.mjs";

/** 거래처 목록 조회 + 별칭 편집 API */
export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (!verifyAuth(req)) return sendUnauthorized(res);

  try {
    validateEnv();

    if (req.method === "GET") return handleGet(req, res);
    if (req.method === "PUT") return handlePut(req, res);
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("/api/customers 오류:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

/** GET /api/customers?q=검색어&limit=100 */
async function handleGet(req, res) {
  const q = (req.query?.q || "").toString().trim();
  const limit = Math.min(parseInt(req.query?.limit, 10) || 100, 500);

  let query = supabase
    .from("customers")
    .select("customer_code, company_name, normalized_name, aliases")
    .order("company_name", { ascending: true })
    .limit(limit);

  if (q) {
    // 검색어를 정규화해서 normalized_name과 비교 (저장된 형식과 동일하게 매칭)
    const norm = normalizeName(q).replace(/[%_]/g, "");
    if (norm) query = query.ilike("normalized_name", `%${norm}%`);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ success: false, error: error.message });

  return res.status(200).json({ success: true, customers: data || [] });
}

/** PUT /api/customers body: { customer_code, aliases: ["..."] } */
async function handlePut(req, res) {
  const { customer_code, aliases } = req.body || {};

  if (!customer_code || typeof customer_code !== "string") {
    return res.status(400).json({ success: false, error: "customer_code가 필요합니다." });
  }
  if (!Array.isArray(aliases)) {
    return res.status(400).json({ success: false, error: "aliases는 배열이어야 합니다." });
  }

  // 각 별칭을 정규화 (검색 시점 정규화와 동일하게 매칭되도록)
  const cleaned = aliases
    .map((a) => (typeof a === "string" ? normalizeName(a) : ""))
    .filter((a) => a.length > 0);
  // 중복 제거
  const unique = [...new Set(cleaned)];

  const { data, error } = await supabase
    .from("customers")
    .update({ aliases: unique })
    .eq("customer_code", customer_code)
    .select("customer_code, company_name, normalized_name, aliases")
    .single();

  if (error) return res.status(500).json({ success: false, error: error.message });
  if (!data) return res.status(404).json({ success: false, error: "거래처를 찾을 수 없습니다." });

  return res.status(200).json({ success: true, customer: data });
}
