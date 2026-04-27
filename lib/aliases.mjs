/**
 * 거래처 별칭 모듈
 * - 사용자가 등록한 별칭 → 정식 명칭으로 질문 텍스트 치환
 * - 별칭은 항상 소문자로 저장/매칭 (대소문자 무시)
 */
import { supabase } from "./clients.mjs";

/** 별칭 정규화: 소문자 + 양끝 공백 제거 */
export function normalizeAlias(s) {
  return String(s || "").trim().toLowerCase();
}

/** customer_aliases 테이블 전체 조회 */
export async function fetchAliases() {
  const { data, error } = await supabase
    .from("customer_aliases")
    .select("id, alias, canonical, created_at")
    .order("alias", { ascending: true });

  if (error) {
    // 테이블이 없거나 RLS 등 문제 시: 빈 배열로 폴백 (별칭 미적용)
    console.error("별칭 조회 실패:", error.message);
    return [];
  }
  return data || [];
}

/** 정규식 메타문자 이스케이프 */
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 사용자 질문에서 등록된 별칭을 정식 명칭으로 치환
 * - 대소문자 무시
 * - 한글/영문/숫자에 인접하지 않은 위치에서만 치환 (단어 경계)
 * - 긴 별칭부터 매칭하여 짧은 별칭이 긴 별칭의 일부를 가로채는 것 방지
 */
export function expandAliases(question, aliases) {
  if (!question || !aliases || aliases.length === 0) return question;

  const sorted = [...aliases].sort((a, b) => b.alias.length - a.alias.length);
  let expanded = question;

  for (const { alias, canonical } of sorted) {
    if (!alias || !canonical) continue;
    const escaped = escapeRegex(alias);
    // 한글/영문/숫자 단어 경계 (negative lookbehind/lookahead)
    const re = new RegExp(`(?<![a-zA-Z0-9가-힣])${escaped}(?![a-zA-Z0-9가-힣])`, "gi");
    expanded = expanded.replace(re, canonical);
  }

  return expanded;
}
