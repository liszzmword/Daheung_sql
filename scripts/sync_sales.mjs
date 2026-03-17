/**
 * 세일즈 CSV/XLSX → Supabase 동기화 스크립트
 *
 * 사용법:
 *   npm run sync-sales -- <파일경로>
 *   node scripts/sync_sales.mjs "path/to/sales_data.csv"
 *   node scripts/sync_sales.mjs "path/to/sales_data_2026_01.xlsx"
 *
 * 동작: 같은 파일명(source_file)의 기존 데이터만 삭제 후 재삽입 (추가 방식)
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import { parse } from "csv-parse/sync";
import { supabase } from "../lib/clients.mjs";
import { excelSerialToDate } from "../lib/diary.mjs";
import { buildCustomerLookupMap, lookupCustomerCode } from "../lib/customers.mjs";

/** 한글 → 영문 컬럼 매핑 */
const KOREAN_COLUMN_MAP = {
  "거래일자": "sale_date",
  "매출일": "sale_date",
  "거래처": "customer_name",
  "담당자": "sales_rep",
  "담당사원": "sales_rep",
  "상품번호": "product_name",
  "제품명": "product_name",
  "규격(사이즈)": "product_spec",
  "규격(재단)": "product_spec",
  "규격": "product_spec",
  "상품분류": "product_group",
  "제품군": "product_group",
  "수량": "qty",
  "단가(원)": "unit_price",
  "판매단가": "unit_price",
  "금액/합계": "supply_amount",
  "공급가액": "supply_amount",
  "할인율": "margin_rate_pct",
  "마진율": "margin_rate_pct",
  "할인금액": "vat",
  "부가세": "vat",
  "결제금액": "total_amount",
  "합계": "total_amount",
};

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

/** 퍼센트 문자열 → 숫자 */
function parsePercent(val) {
  if (val == null || val === "") return null;
  const cleaned = String(val).replace(/%/g, "").replace(/,/g, "").trim();
  if (cleaned === "") return null;
  const num = Number(cleaned);
  return isNaN(num) ? null : num;
}

/** 날짜 변환 */
function parseDate(val) {
  if (val == null || val === "") return null;

  if (typeof val === "number" && val > 40000) {
    const d = excelSerialToDate(val);
    if (d) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }
  }

  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const day = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  const str = String(val).trim();
  const dotMatch = str.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
  if (dotMatch) {
    const [, y, m, d] = dotMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  const isoMatch = str.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];

  return str;
}

/** CSV 처리 */
async function processCSV(filePath, filename, lookupMap) {
  const csvContent = fs.readFileSync(filePath, "utf8");
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
  });

  console.log(`  ${records.length}행 파싱 완료`);

  const transformed = records.map((row, idx) => {
    let customerCode = row.customer_code?.trim() || null;
    if (!customerCode && row.customer_name && lookupMap.size > 0) {
      const match = lookupCustomerCode(row.customer_name.trim(), lookupMap);
      customerCode = match.customer_code;
    }

    return {
      row_no: parseNumber(row.row_no) || idx + 1,
      sale_date: parseDate(row.sale_date),
      customer_name: row.customer_name?.trim() || null,
      customer_code: customerCode,
      sales_rep: row.sales_rep?.trim() || null,
      product_name: row.product_name?.trim() || null,
      product_spec: row.product_spec?.trim() || null,
      product_group: row.product_group?.trim() || null,
      qty: parseNumber(row.qty),
      unit_price: parseNumber(row.unit_price),
      supply_amount: parseNumber(row.supply_amount),
      margin_rate_pct: parsePercent(row.margin_rate_pct),
      vat: parseNumber(row.vat),
      total_amount: parseNumber(row.total_amount),
      source_file: filename,
    };
  }).filter((r) => r.sale_date && r.customer_name);

  return { transformed, totalRows: records.length };
}

/** XLSX 처리 */
async function processXLSX(filePath, filename, lookupMap) {
  const buffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

  if (rows.length < 2) throw new Error("데이터가 없습니다.");

  // 헤더 매핑
  const headers = rows[0].map((h) => String(h || "").trim());
  const columnIndices = {};

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    const mapped = KOREAN_COLUMN_MAP[h];
    if (mapped) {
      columnIndices[mapped] = i;
    } else {
      const lower = h.toLowerCase();
      if (["sale_date", "customer_name", "sales_rep", "product_name", "product_spec",
           "product_group", "qty", "unit_price", "supply_amount", "margin_rate_pct",
           "vat", "total_amount", "customer_code", "row_no"].includes(lower)) {
        columnIndices[lower] = i;
      }
    }
  }

  if (columnIndices.sale_date == null || columnIndices.customer_name == null) {
    throw new Error(`필수 컬럼을 찾을 수 없습니다. 헤더: ${headers.join(", ")}`);
  }

  console.log(`  ${rows.length - 1}행 파싱 완료`);

  const transformed = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => c == null || c === "")) continue;

    const get = (key) => (columnIndices[key] != null ? row[columnIndices[key]] : null);

    const customerName = get("customer_name");
    if (!customerName) continue;
    const nameStr = String(customerName).trim();

    const saleDate = parseDate(get("sale_date"));
    if (!saleDate) continue;

    let customerCode = get("customer_code") ? String(get("customer_code")).trim() : null;
    if (!customerCode && lookupMap.size > 0) {
      const match = lookupCustomerCode(nameStr, lookupMap);
      customerCode = match.customer_code;
    }

    transformed.push({
      row_no: i,
      sale_date: saleDate,
      customer_name: nameStr,
      customer_code: customerCode,
      sales_rep: get("sales_rep") ? String(get("sales_rep")).trim() : null,
      product_name: get("product_name") ? String(get("product_name")).trim() : null,
      product_spec: get("product_spec") ? String(get("product_spec")).trim() : null,
      product_group: get("product_group") ? String(get("product_group")).trim() : null,
      qty: parseNumber(get("qty")),
      unit_price: parseNumber(get("unit_price")),
      supply_amount: parseNumber(get("supply_amount")),
      margin_rate_pct: parsePercent(get("margin_rate_pct")),
      vat: parseNumber(get("vat")),
      total_amount: parseNumber(get("total_amount")),
      source_file: filename,
    });
  }

  return { transformed, totalRows: rows.length - 1 };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("사용법: node scripts/sync_sales.mjs <파일경로>");
    console.error("  CSV: node scripts/sync_sales.mjs ./sales_data_2025.csv");
    console.error("  XLSX: node scripts/sync_sales.mjs ./sales_data_2026_01.xlsx");
    process.exit(1);
  }

  const filePath = path.resolve(args[0]);
  const filename = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();

  console.log(`\n세일즈 동기화 시작`);
  console.log(`  파일: ${filePath}\n`);

  // 거래처 룩업맵 로드
  console.log("  거래처 룩업맵 로드 중...");
  const lookupMap = await buildCustomerLookupMap();
  console.log(`  거래처 ${lookupMap.size}건 로드\n`);

  let transformed, totalRows;
  if (ext === ".csv") {
    ({ transformed, totalRows } = await processCSV(filePath, filename, lookupMap));
  } else if (ext === ".xlsx" || ext === ".xls") {
    ({ transformed, totalRows } = await processXLSX(filePath, filename, lookupMap));
  } else {
    throw new Error(`지원하지 않는 파일 형식: ${ext}`);
  }

  console.log(`  ${transformed.length}건 유효 데이터`);

  // 파일 단위 교체
  console.log(`\n  기존 데이터 삭제 중 (source_file: ${filename})...`);
  const { error: delError } = await supabase
    .from("sales_clean")
    .delete()
    .eq("source_file", filename);
  if (delError) throw new Error(`삭제 오류: ${delError.message}`);

  // Batch insert
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

  // 매칭 통계
  const matched = transformed.filter((r) => r.customer_code).length;
  const unmatched = transformed.filter((r) => !r.customer_code).length;

  await logSync(ext === ".csv" ? "sales_csv" : "sales_xlsx", filename, totalRows, inserted);

  console.log(`\n동기화 완료: ${inserted}건 저장`);
  console.log(`  거래처 매칭: ${matched}건, 미매칭: ${unmatched}건\n`);
}

main().catch(async (e) => {
  console.error("오류:", e.message);
  await logSync("sales", process.argv[2] || "unknown", 0, 0, "error", e.message).catch(() => {});
  process.exit(1);
});
