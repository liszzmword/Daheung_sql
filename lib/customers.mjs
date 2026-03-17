/**
 * 거래처 마스터 파싱 + 거래처 코드 자동 매칭 모듈
 */
import * as XLSX from "xlsx";
import { supabase } from "./clients.mjs";

/**
 * 거래처 마스터 XLS/XLSX 파싱
 * @param {Buffer} buffer - 파일 버퍼
 * @returns {{ customer_code, company_name, ... }[]}
 */
export function parseCustomerXLS(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  // 헤더 행 찾기: "거래처 코드" 또는 "거래처코드" 포함 행
  let headerIdx = -1;
  let colMap = {};
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const row = rows[i];
    if (!row) continue;
    const cells = row.map((c) => String(c || "").trim());
    const codeIdx = cells.findIndex((c) => c.includes("거래처") && c.includes("코드"));
    if (codeIdx >= 0) {
      headerIdx = i;
      // 컬럼 위치 매핑
      for (let j = 0; j < cells.length; j++) {
        const h = cells[j];
        if (h.includes("거래처") && h.includes("코드")) colMap.customer_code = j;
        else if (h === "거래처" || h.includes("회사") || (h.includes("거래처") && !h.includes("담당"))) {
          if (!colMap.company_name) colMap.company_name = j;
        }
        else if (h.includes("담당자") && !h.includes("거래처")) colMap.sales_rep = j;
        else if (h.includes("사업자") || h.includes("통신")) colMap.business_number = j;
        else if (h.includes("거래처") && h.includes("담당")) colMap.contact_person = j;
        else if (h.includes("담당부서") || h.includes("부서")) colMap.department = j;
        else if (h.includes("상태")) colMap.status = j;
        else if (h.includes("기타")) colMap.notes = j;
      }
      break;
    }
  }

  if (headerIdx < 0) {
    throw new Error("거래처 코드 컬럼을 찾을 수 없습니다.");
  }

  // 회사명 컬럼이 없으면 거래처 코드 다음 컬럼 사용
  if (colMap.company_name == null && colMap.customer_code != null) {
    colMap.company_name = colMap.customer_code + 1;
  }

  const customers = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    const code = row[colMap.customer_code];
    const name = row[colMap.company_name];
    if (!code || !name) continue;

    const codeStr = String(code).trim();
    const nameStr = String(name).trim();
    if (!codeStr || !nameStr) continue;

    customers.push({
      customer_code: codeStr,
      company_name: nameStr,
      sales_rep: colMap.sales_rep != null ? (row[colMap.sales_rep] ? String(row[colMap.sales_rep]).trim() : null) : null,
      business_number: colMap.business_number != null ? (row[colMap.business_number] ? String(row[colMap.business_number]).trim() : null) : null,
      contact_person: colMap.contact_person != null ? (row[colMap.contact_person] ? String(row[colMap.contact_person]).trim() : null) : null,
      department: colMap.department != null ? (row[colMap.department] ? String(row[colMap.department]).trim() : null) : null,
      status: colMap.status != null ? (row[colMap.status] ? String(row[colMap.status]).trim() : null) : null,
      notes: colMap.notes != null ? (row[colMap.notes] ? String(row[colMap.notes]).trim() : null) : null,
    });
  }

  return customers;
}

/**
 * Supabase에 거래처 batch upsert
 */
export async function upsertCustomers(customers) {
  const BATCH = 500;
  let upserted = 0;

  for (let i = 0; i < customers.length; i += BATCH) {
    const batch = customers.slice(i, i + BATCH).map((c) => ({
      ...c,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from("customers")
      .upsert(batch, { onConflict: "customer_code" });
    if (error) throw new Error(`거래처 upsert 오류: ${error.message}`);
    upserted += batch.length;
  }

  return upserted;
}

/**
 * customers 테이블에서 전체 조회하여 룩업맵 생성
 * @returns {Map<normalizedName, { customer_code, company_name }>}
 */
export async function buildCustomerLookupMap() {
  const { data, error } = await supabase
    .from("customers")
    .select("customer_code, company_name");

  if (error) throw new Error(`거래처 조회 오류: ${error.message}`);
  if (!data || data.length === 0) return new Map();

  const map = new Map();
  for (const c of data) {
    const normalized = normalizeName(c.company_name);
    map.set(normalized, {
      customer_code: c.customer_code,
      company_name: c.company_name,
    });
  }
  return map;
}

/**
 * 이름 정규화 (공백/괄호 제거, 소문자)
 */
export function normalizeName(name) {
  if (!name) return "";
  return name
    .trim()
    .replace(/\s+/g, "")
    .replace(/[\(\)（）]/g, "")
    .toLowerCase();
}

/**
 * Dice coefficient (bigram similarity)
 */
function diceCoefficient(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const bigramsA = new Set();
  for (let i = 0; i < a.length - 1; i++) bigramsA.add(a.slice(i, i + 2));

  const bigramsB = new Set();
  for (let i = 0; i < b.length - 1; i++) bigramsB.add(b.slice(i, i + 2));

  if (bigramsA.size === 0 || bigramsB.size === 0) return 0;

  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }

  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

/**
 * 거래처명으로 거래처 코드 조회
 * Step 1: 정규화 후 정확 매칭
 * Step 2: 유사도 매칭 (Dice coefficient, 임계값 0.6)
 * @param {string} customerName
 * @param {Map} lookupMap - buildCustomerLookupMap() 결과
 * @returns {{ customer_code: string, company_name: string, matched: boolean }}
 */
export function lookupCustomerCode(customerName, lookupMap) {
  if (!customerName || lookupMap.size === 0) {
    return { customer_code: null, company_name: customerName, matched: false };
  }

  const normalized = normalizeName(customerName);

  // Step 1: 정확 매칭
  const exact = lookupMap.get(normalized);
  if (exact) {
    return { customer_code: exact.customer_code, company_name: customerName, matched: true };
  }

  // Step 2: 유사도 매칭
  let bestMatch = null;
  let bestScore = 0;

  for (const [key, value] of lookupMap) {
    const score = diceCoefficient(normalized, key);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = value;
    }
  }

  if (bestMatch && bestScore >= 0.6) {
    return { customer_code: bestMatch.customer_code, company_name: customerName, matched: true };
  }

  return { customer_code: null, company_name: customerName, matched: false };
}
