/**
 * 세일즈 CSV → Supabase 동기화 스크립트
 *
 * 사용법:
 *   npm run sync-sales -- <파일경로>
 *   node scripts/sync_sales.mjs "path/to/sales_data.csv"
 *
 * 동작: source_file이 같은 기존 데이터를 삭제 후 재삽입 (파일 단위 교체)
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { supabase } from "../lib/clients.mjs";

/** sync_log에 기록 */
async function logSync(syncType, filename, rowsProcessed, rowsInserted, status = "success", errorMessage = null) {
  await supabase.from("sync_log").insert({
    sync_type: syncType,
    filename,
    rows_processed: rowsProcessed,
    rows_inserted: rowsInserted,
    status,
    error_message: errorMessage,
  });
}

/** 콤마 제거 후 숫자 변환 */
function parseNumber(val) {
  if (val == null || val === "") return null;
  const cleaned = String(val).replace(/,/g, "").trim();
  if (cleaned === "") return null;
  const num = Number(cleaned);
  return isNaN(num) ? null : num;
}

/** 퍼센트 문자열 → 숫자 (예: "20%" → 20) */
function parsePercent(val) {
  if (val == null || val === "") return null;
  const cleaned = String(val).replace(/%/g, "").replace(/,/g, "").trim();
  if (cleaned === "") return null;
  const num = Number(cleaned);
  return isNaN(num) ? null : num;
}

/** 날짜 변환: "2019.4.18" → "2019-04-18" */
function parseDate(val) {
  if (!val) return null;
  const str = String(val).trim();

  // YYYY.M.D 형식
  const dotMatch = str.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
  if (dotMatch) {
    const [, y, m, d] = dotMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // YYYY-MM-DD 형식 (이미 정상)
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  return str;
}

/** CSV 행을 sales_clean 레코드로 변환 */
function transformRow(row) {
  return {
    row_no: parseNumber(row.row_no),
    sale_date: parseDate(row.sale_date),
    customer_name: row.customer_name?.trim() || null,
    customer_code: row.customer_code?.trim() || null,
    sales_rep: row.sales_rep?.trim() || null,
    product_name: row.product_name?.trim() || null,
    product_group: row.product_group?.trim() || null,
    qty: parseNumber(row.qty),
    unit_price: parseNumber(row.unit_price),
    supply_amount: parseNumber(row.supply_amount),
    margin_rate_pct: parsePercent(row.margin_rate_pct),
    vat: parseNumber(row.vat),
    total_amount: parseNumber(row.total_amount),
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("사용법: node scripts/sync_sales.mjs <CSV파일경로>");
    console.error("예: node scripts/sync_sales.mjs ./sales_data_2025.csv");
    process.exit(1);
  }

  const filePath = path.resolve(args[0]);
  const filename = path.basename(filePath);

  console.log(`\n세일즈 CSV 동기화 시작`);
  console.log(`  파일: ${filePath}\n`);

  // 1. CSV 파싱
  const csvContent = fs.readFileSync(filePath, "utf8");
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
  });

  console.log(`  ${records.length}행 파싱 완료`);

  if (records.length === 0) {
    console.log("데이터가 없습니다.");
    await logSync("sales_csv", filename, 0, 0, "success", "데이터 없음");
    return;
  }

  // 2. 데이터 변환
  const transformed = records.map(transformRow).filter((r) => r.sale_date && r.customer_name);
  console.log(`  ${transformed.length}건 유효 데이터`);

  // 3. 전체 교체: 기존 데이터 모두 삭제 후 재삽입
  // sales_clean 테이블의 모든 데이터를 삭제 (CSV가 전체 데이터를 포함하므로)
  console.log(`\n  기존 데이터 삭제 중...`);
  const { error: delError } = await supabase
    .from("sales_clean")
    .delete()
    .neq("id", 0); // 모든 행 삭제 (Supabase는 무조건 where 필요)
  if (delError) throw new Error(`삭제 오류: ${delError.message}`);

  // 4. Batch insert
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < transformed.length; i += BATCH) {
    const batch = transformed.slice(i, i + BATCH);
    const { error } = await supabase.from("sales_clean").insert(batch);
    if (error) throw new Error(`Insert 오류 (행 ${i}~${i + batch.length}): ${error.message}`);
    inserted += batch.length;
    if (inserted % 5000 === 0 || inserted === transformed.length) {
      console.log(`  insert: ${inserted}/${transformed.length}`);
    }
  }

  // 5. 로그
  await logSync("sales_csv", filename, records.length, inserted);

  console.log(`\n동기화 완료: ${inserted}건 저장\n`);
}

main().catch(async (e) => {
  console.error("오류:", e.message);
  await logSync("sales_csv", process.argv[2] || "unknown", 0, 0, "error", e.message).catch(() => {});
  process.exit(1);
});
