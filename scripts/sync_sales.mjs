/**
 * 세일즈/매입 CSV/XLSX → Supabase 동기화 스크립트
 *
 * 사용법:
 *   node scripts/sync_sales.mjs <파일경로> [--type sales|purchases]
 *
 * 예시:
 *   node scripts/sync_sales.mjs "./DATA/매출데이터_2020.csv"
 *   node scripts/sync_sales.mjs "./DATA/매입내역_2020.csv" --type purchases
 *   node scripts/sync_sales.mjs "./매출상세내역.xlsx"
 *
 * 동작: 같은 파일명(source_file)의 기존 데이터만 삭제 후 재삽입
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import { parse } from "csv-parse/sync";
import { supabase } from "../lib/clients.mjs";
import { excelSerialToDate } from "../lib/diary.mjs";
import { buildCustomerLookupMap, lookupCustomerCode } from "../lib/customers.mjs";

/** 매출 CSV 15컬럼 매핑 */
const SALES_COLUMN_MAP = {
  "번호": "row_no",
  "매출일": "sale_date",
  "거래일자": "sale_date",
  "거래처": "customer_name",
  "담당사원": "sales_rep",
  "담당자": "sales_rep",
  "제품명": "product_name",
  "상품번호": "product_name",
  "규격(재단)": "product_spec",
  "규격(사이즈)": "product_spec",
  "규격": "product_spec",
  "제품군": "product_group",
  "상품분류": "product_group",
  "수량": "qty",
  "매입단가(3%)": "purchase_price",
  "판매단가": "unit_price",
  "단가(원)": "unit_price",
  "공급가액": "supply_amount",
  "금액/합계": "supply_amount",
  "부가세": "vat",
  "합계": "total_amount",
  "마진율": "margin_rate_pct",
  "할인율": "margin_rate_pct",
  "스탁번호": "stock_no",
};

/** 매입 CSV 12컬럼 매핑 */
const PURCHASE_COLUMN_MAP = {
  "번호": "row_no",
  "매입일": "purchase_date",
  "거래처": "customer_name",
  "담당사원": "sales_rep",
  "제품명": "product_name",
  "규격(재단)": "product_spec",
  "규격": "product_spec",
  "제품군": "product_group",
  "수량": "qty",
  "매입원가": "purchase_cost",
  "공급가액": "supply_amount",
  "부가세": "vat",
  "합계": "total_amount",
};

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

function parseNumber(val) {
  if (val == null || val === "") return null;
  const cleaned = String(val).replace(/,/g, "").trim();
  if (cleaned === "") return null;
  const num = Number(cleaned);
  return isNaN(num) ? null : num;
}

function parsePercent(val) {
  if (val == null || val === "") return null;
  const cleaned = String(val).replace(/%/g, "").replace(/,/g, "").trim();
  if (cleaned === "") return null;
  const num = Number(cleaned);
  return isNaN(num) ? null : num;
}

function parseDate(val, fallbackYear = null) {
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

  // M/D/YY (5/25/20)
  const mdyyMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (mdyyMatch) {
    const [, m, d, yy] = mdyyMatch;
    const year = parseInt(yy, 10) + 2000;
    return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // M/D/YYYY (5/25/2020)
  const mdyyyyMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyyyyMatch) {
    const [, m, d, y] = mdyyyyMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // MM/DD (06/24) - 매입 데이터용, fallbackYear 필요
  const mmddMatch = str.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (mmddMatch && fallbackYear) {
    const [, m, d] = mmddMatch;
    return `${fallbackYear}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // YYYY.M.D
  const dotMatch = str.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
  if (dotMatch) {
    const [, y, m, d] = dotMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  const isoMatch = str.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];

  return null;
}

/** 매출 CSV 처리 */
async function processSalesCSV(filePath, filename, lookupMap) {
  const csvContent = fs.readFileSync(filePath, "utf8");
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
  });

  console.log(`  ${records.length}행 파싱 완료`);

  const sampleRow = records[0];
  const colMap = {};
  for (const key of Object.keys(sampleRow)) {
    const mapped = SALES_COLUMN_MAP[key.trim()];
    if (mapped) colMap[mapped] = key;
  }

  const transformed = [];
  for (let idx = 0; idx < records.length; idx++) {
    const row = records[idx];
    const get = (field) => row[colMap[field]]?.trim() || null;

    const customerName = get("customer_name");
    if (!customerName) continue;

    const saleDate = parseDate(get("sale_date"));
    if (!saleDate) continue;

    let customerCode = null;
    if (lookupMap.size > 0) {
      const match = lookupCustomerCode(customerName, lookupMap);
      customerCode = match.customer_code;
    }

    transformed.push({
      row_no: parseNumber(get("row_no")) || idx + 1,
      sale_date: saleDate,
      customer_name: customerName,
      customer_code: customerCode,
      sales_rep: get("sales_rep"),
      product_name: get("product_name"),
      product_spec: get("product_spec"),
      product_group: get("product_group"),
      qty: parseNumber(get("qty")),
      purchase_price: parseNumber(get("purchase_price")),
      unit_price: parseNumber(get("unit_price")),
      supply_amount: parseNumber(get("supply_amount")),
      vat: parseNumber(get("vat")),
      total_amount: parseNumber(get("total_amount")),
      margin_rate_pct: parsePercent(get("margin_rate_pct")),
      stock_no: get("stock_no"),
      source_file: filename,
    });
  }

  return { transformed, totalRows: records.length, tableName: "sales_clean" };
}

/** 매입 CSV 처리 */
async function processPurchaseCSV(filePath, filename, lookupMap) {
  const yearMatch = filename.match(/(\d{4})/);
  const fallbackYear = yearMatch ? parseInt(yearMatch[1], 10) : null;
  if (!fallbackYear || fallbackYear < 2000 || fallbackYear > 2100) {
    throw new Error("매입 파일명에 연도가 포함되어야 합니다. (예: 매입내역_2020.csv)");
  }

  const csvContent = fs.readFileSync(filePath, "utf8");
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
  });

  console.log(`  ${records.length}행 파싱 완료 (연도: ${fallbackYear})`);

  const sampleRow = records[0];
  const colMap = {};
  for (const key of Object.keys(sampleRow)) {
    const mapped = PURCHASE_COLUMN_MAP[key.trim()];
    if (mapped) colMap[mapped] = key;
  }

  const transformed = [];
  for (let idx = 0; idx < records.length; idx++) {
    const row = records[idx];
    const get = (field) => row[colMap[field]]?.trim() || null;

    const customerName = get("customer_name");
    if (!customerName) continue;

    const purchaseDate = parseDate(get("purchase_date"), fallbackYear);
    if (!purchaseDate) continue;

    let customerCode = null;
    if (lookupMap.size > 0) {
      const match = lookupCustomerCode(customerName, lookupMap);
      customerCode = match.customer_code;
    }

    transformed.push({
      row_no: parseNumber(get("row_no")) || idx + 1,
      purchase_date: purchaseDate,
      customer_name: customerName,
      customer_code: customerCode,
      sales_rep: get("sales_rep"),
      product_name: get("product_name"),
      product_spec: get("product_spec"),
      product_group: get("product_group"),
      qty: parseNumber(get("qty")),
      purchase_cost: parseNumber(get("purchase_cost")),
      supply_amount: parseNumber(get("supply_amount")),
      vat: parseNumber(get("vat")),
      total_amount: parseNumber(get("total_amount")),
      source_file: filename,
    });
  }

  return { transformed, totalRows: records.length, tableName: "purchases" };
}

/** 매출 XLSX 처리 (멀티시트) */
async function processSalesXLSX(filePath, filename, lookupMap) {
  const buffer = fs.readFileSync(filePath);
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });

  const transformed = [];
  let totalRows = 0;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

    if (rows.length < 2) continue;

    const headers = rows[0].map((h) => String(h || "").trim());
    const columnIndices = {};

    for (let i = 0; i < headers.length; i++) {
      const mapped = SALES_COLUMN_MAP[headers[i]];
      if (mapped) columnIndices[mapped] = i;
    }

    if (columnIndices.sale_date == null || columnIndices.customer_name == null) continue;

    console.log(`  시트 [${sheetName}]: ${rows.length - 1}행`);
    totalRows += rows.length - 1;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.every((c) => c == null || c === "")) continue;

      const get = (key) => (columnIndices[key] != null ? row[columnIndices[key]] : null);

      const customerName = get("customer_name");
      if (!customerName) continue;
      const nameStr = String(customerName).trim();

      const saleDate = parseDate(get("sale_date"));
      if (!saleDate) continue;

      let customerCode = null;
      if (lookupMap.size > 0) {
        const match = lookupCustomerCode(nameStr, lookupMap);
        customerCode = match.customer_code;
      }

      transformed.push({
        row_no: transformed.length + 1,
        sale_date: saleDate,
        customer_name: nameStr,
        customer_code: customerCode,
        sales_rep: get("sales_rep") ? String(get("sales_rep")).trim() : null,
        product_name: get("product_name") ? String(get("product_name")).trim() : null,
        product_spec: get("product_spec") ? String(get("product_spec")).trim() : null,
        product_group: get("product_group") ? String(get("product_group")).trim() : null,
        qty: parseNumber(get("qty")),
        purchase_price: parseNumber(get("purchase_price")),
        unit_price: parseNumber(get("unit_price")),
        supply_amount: parseNumber(get("supply_amount")),
        vat: parseNumber(get("vat")),
        total_amount: parseNumber(get("total_amount")),
        margin_rate_pct: parsePercent(get("margin_rate_pct")),
        stock_no: get("stock_no") ? String(get("stock_no")).trim() : null,
        source_file: filename,
      });
    }
  }

  return { transformed, totalRows, tableName: "sales_clean" };
}

async function main() {
  const args = process.argv.slice(2);
  const typeIdx = args.indexOf("--type");
  let dataType = null;
  let filePaths = [];

  if (typeIdx >= 0) {
    dataType = args[typeIdx + 1];
    filePaths = args.filter((_, i) => i !== typeIdx && i !== typeIdx + 1);
  } else {
    filePaths = args;
  }

  if (filePaths.length < 1) {
    console.error("사용법: node scripts/sync_sales.mjs <파일경로> [--type sales|purchases]");
    console.error("  매출: node scripts/sync_sales.mjs ./DATA/매출데이터_2020.csv");
    console.error("  매입: node scripts/sync_sales.mjs ./DATA/매입내역_2020.csv --type purchases");
    process.exit(1);
  }

  const filePath = path.resolve(filePaths[0]);
  const filename = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();

  // 타입 자동 감지
  if (!dataType) {
    dataType = filename.includes("매입") ? "purchases" : "sales";
  }

  console.log(`\n${dataType === "purchases" ? "매입" : "매출"} 동기화 시작`);
  console.log(`  파일: ${filePath}\n`);

  console.log("  거래처 룩업맵 로드 중...");
  const lookupMap = await buildCustomerLookupMap();
  console.log(`  거래처 ${lookupMap.size}건 로드\n`);

  let transformed, totalRows, tableName;

  if (dataType === "purchases") {
    if (ext !== ".csv") throw new Error("매입 데이터는 CSV 파일만 지원합니다.");
    ({ transformed, totalRows, tableName } = await processPurchaseCSV(filePath, filename, lookupMap));
  } else if (ext === ".csv") {
    ({ transformed, totalRows, tableName } = await processSalesCSV(filePath, filename, lookupMap));
  } else if (ext === ".xlsx" || ext === ".xls") {
    ({ transformed, totalRows, tableName } = await processSalesXLSX(filePath, filename, lookupMap));
  } else {
    throw new Error(`지원하지 않는 파일 형식: ${ext}`);
  }

  console.log(`  ${transformed.length}건 유효 데이터`);

  // 파일 단위 교체
  await supabase.from(tableName).delete().eq("source_file", filename);

  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < transformed.length; i += BATCH) {
    const batch = transformed.slice(i, i + BATCH);
    const { error } = await supabase.from(tableName).insert(batch);
    if (error) throw new Error(`Insert 오류 (행 ${i}~${i + batch.length}): ${error.message}`);
    inserted += batch.length;
    if (inserted % 5000 === 0 || inserted === transformed.length) {
      console.log(`  insert: ${inserted}/${transformed.length}`);
    }
  }

  const matched = transformed.filter((r) => r.customer_code).length;
  const unmatched = transformed.filter((r) => !r.customer_code).length;

  await logSync(`${dataType}_${ext.replace(".", "")}`, filename, totalRows, inserted);

  console.log(`\n동기화 완료: ${inserted}건 → ${tableName}`);
  console.log(`  거래처 매칭: ${matched}건, 미매칭: ${unmatched}건\n`);
}

main().catch(async (e) => {
  console.error("오류:", e.message);
  await logSync("sync", process.argv[2] || "unknown", 0, 0, "error", e.message).catch(() => {});
  process.exit(1);
});
