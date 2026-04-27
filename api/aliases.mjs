import { supabase, validateEnv } from "../lib/clients.mjs";
import { normalizeAlias } from "../lib/aliases.mjs";
import { verifyAuth, setCorsHeaders, sendUnauthorized } from "../lib/auth.mjs";

/** 거래처 별칭 관리 API (GET/POST/DELETE) */
export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (!verifyAuth(req)) return sendUnauthorized(res);

  try {
    validateEnv();

    if (req.method === "GET") return handleGet(req, res);
    if (req.method === "POST") return handlePost(req, res);
    if (req.method === "DELETE") return handleDelete(req, res);
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error("/api/aliases 오류:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

/** GET /api/aliases — 전체 목록 */
async function handleGet(_req, res) {
  const { data, error } = await supabase
    .from("customer_aliases")
    .select("id, alias, canonical, created_at")
    .order("alias", { ascending: true });

  if (error) return res.status(500).json({ success: false, error: error.message });
  return res.status(200).json({ success: true, aliases: data || [] });
}

/** POST /api/aliases body: { alias, canonical } */
async function handlePost(req, res) {
  const { alias, canonical } = req.body || {};

  if (!alias || typeof alias !== "string" || !alias.trim()) {
    return res.status(400).json({ success: false, error: "별칭을 입력해주세요." });
  }
  if (!canonical || typeof canonical !== "string" || !canonical.trim()) {
    return res.status(400).json({ success: false, error: "정식 명칭을 입력해주세요." });
  }

  const normAlias = normalizeAlias(alias);
  const cleanCanonical = canonical.trim();

  // 중복 체크: 이미 존재하면 어떤 회사에 매핑되어 있는지 알려줌
  const { data: existing, error: checkErr } = await supabase
    .from("customer_aliases")
    .select("alias, canonical")
    .eq("alias", normAlias)
    .maybeSingle();

  if (checkErr) return res.status(500).json({ success: false, error: checkErr.message });
  if (existing) {
    return res.status(409).json({
      success: false,
      error: `이미 등록된 별칭입니다 (현재 "${existing.canonical}"에 매핑됨). 기존 별칭을 먼저 삭제하세요.`,
      existing,
    });
  }

  const { data, error } = await supabase
    .from("customer_aliases")
    .insert({ alias: normAlias, canonical: cleanCanonical })
    .select("id, alias, canonical, created_at")
    .single();

  if (error) {
    // UNIQUE 위반 (race condition 등) — 안전한 메시지
    if (error.code === "23505") {
      return res.status(409).json({ success: false, error: "이미 등록된 별칭입니다." });
    }
    return res.status(500).json({ success: false, error: error.message });
  }

  return res.status(201).json({ success: true, alias: data });
}

/** DELETE /api/aliases?id=123 또는 ?alias=3h */
async function handleDelete(req, res) {
  const id = req.query?.id ? Number(req.query.id) : null;
  const aliasText = req.query?.alias ? normalizeAlias(req.query.alias) : null;

  if (!id && !aliasText) {
    return res.status(400).json({ success: false, error: "id 또는 alias 파라미터가 필요합니다." });
  }

  let q = supabase.from("customer_aliases").delete();
  q = id ? q.eq("id", id) : q.eq("alias", aliasText);

  const { error } = await q;
  if (error) return res.status(500).json({ success: false, error: error.message });
  return res.status(200).json({ success: true });
}
