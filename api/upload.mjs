/**
 * 파일 업로드 API (세일즈 CSV/XLSX / 영업일지 XLS / 거래처 마스터 XLS)
 * POST /api/upload
 * multipart/form-data: file, type(sales|diary|customers)
 */
import { Writable } from "stream";
import formidable from "formidable";
import * as XLSX from "xlsx";
import { parse } from "csv-parse/sync";
import { validateEnv, supabase } from "../lib/clients.mjs";
import { embedTexts } from "../lib/embedding.mjs";
import { parseDiaryXLS, composeDiaryText, excelSerialToDate } from "../lib/diary.mjs";
import { verifyAuth, setCorsHeaders, sendUnauthorized } from "../lib/auth.mjs";
import {
  parseCustomerXLS,
  upsertCustomers,
  buildCustomerLookupMap,
  lookupCustomerCode,
} from "../lib/customers.mjs";

/** Vercel에서 body parsing 비활성화 */
export const config = { api: { bodyParser: false } };

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = [".csv", ".xls", ".xlsx"];

/** 한글 → 영문 컬럼 매핑 (표준 10컬럼 기준) */
const KOREAN_COLUMN_MAP = {
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
  "판매단가": "unit_price",
  "단가(원)": "unit_price",
  "공급가액": "supply_amount",
  "금액/합계": "supply_amount",
  "마진율": "margin_rate_pct",
  "할인율": "margin_rate_pct",
};

/** 텍스트를 청크로 분할 */
function chunkText(text, chunkSize = 1000, overlap = 150) {
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(text.length, i + chunkSize);
    const chunk = text.slice(i, end).trim();
    if (chunk) chunks.push(chunk);
    i += chunkSize - overlap;
  }
  return chunks;
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

/** 날짜 변환 (다양한 형식 지원) */
function parseDate(val) {
  if (val == null || val === "") return null;

  // Excel serial number
  if (typeof val === "number" && val > 40000) {
    const d = excelSerialToDate(val);
    if (d) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }
  }

  // Date 객체
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const day = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  const str = String(val).trim();

  // YYYY.M.D 형식
  const dotMatch = str.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
  if (dotMatch) {
    const [, y, m, d] = dotMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // YYYY-MM-DD 형식
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  // YYYY-MM-DD... (날짜 뒤에 시간 등 붙은 경우)
  const isoMatch = str.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];

  return str;
}

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

/** 세일즈 CSV 처리 (기존 영문 컬럼) */
async function processSalesCSV(buffer, filename) {
  const csvContent = buffer.toString("utf8");
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
  });

  // 거래처 코드 룩업맵 (customer_code가 없는 행에 대해)
  let lookupMap = null;

  const transformed = [];
  for (let idx = 0; idx < records.length; idx++) {
    const row = records[idx];
    const customerCode = row.customer_code?.trim() || null;

    let resolvedCode = customerCode;
    if (!resolvedCode && row.customer_name) {
      if (!lookupMap) lookupMap = await buildCustomerLookupMap();
      const match = lookupCustomerCode(row.customer_name.trim(), lookupMap);
      resolvedCode = match.customer_code;
    }

    transformed.push({
      row_no: parseNumber(row.row_no) || idx + 1,
      sale_date: parseDate(row.sale_date),
      customer_name: row.customer_name?.trim() || null,
      customer_code: resolvedCode,
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
    });
  }

  const valid = transformed.filter((r) => r.sale_date && r.customer_name);

  // 파일 단위 교체
  await supabase.from("sales_clean").delete().eq("source_file", filename);

  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < valid.length; i += BATCH) {
    const batch = valid.slice(i, i + BATCH);
    const { error } = await supabase.from("sales_clean").insert(batch);
    if (error) throw new Error(`Insert 오류: ${error.message}`);
    inserted += batch.length;
  }

  await logSync("sales_csv", filename, records.length, inserted);

  // 매칭 통계
  const matched = valid.filter((r) => r.customer_code).length;
  const unmatched = valid.filter((r) => !r.customer_code).length;
  const unmatchedNames = [...new Set(valid.filter((r) => !r.customer_code).map((r) => r.customer_name))];

  return { rows_processed: records.length, rows_inserted: inserted, matched, unmatched, unmatched_names: unmatchedNames };
}

/** 세일즈 XLSX 처리 (한글 컬럼, 멀티시트 지원) */
async function processSalesXLSX(buffer, filename) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });

  // 거래처 코드 룩업맵
  const lookupMap = await buildCustomerLookupMap();

  const transformed = [];
  let totalRows = 0;

  // 모든 시트 순회
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

    if (rows.length < 2) continue;

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
             "customer_code", "row_no"].includes(lower)) {
          columnIndices[lower] = i;
        }
      }
    }

    // 필수 컬럼 없으면 이 시트 건너뜀
    if (columnIndices.sale_date == null || columnIndices.customer_name == null) continue;

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

      // 거래처 코드 매칭
      const codeFromFile = get("customer_code");
      let customerCode = codeFromFile ? String(codeFromFile).trim() : null;
      if (!customerCode && lookupMap.size > 0) {
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
        unit_price: parseNumber(get("unit_price")),
        supply_amount: parseNumber(get("supply_amount")),
        margin_rate_pct: parseNumber(get("margin_rate_pct")),
        source_file: filename,
      });
    }
  }

  if (transformed.length === 0) throw new Error("유효한 데이터가 없습니다.");

  // 파일 단위 교체
  await supabase.from("sales_clean").delete().eq("source_file", filename);

  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < transformed.length; i += BATCH) {
    const batch = transformed.slice(i, i + BATCH);
    const { error } = await supabase.from("sales_clean").insert(batch);
    if (error) throw new Error(`Insert 오류: ${error.message}`);
    inserted += batch.length;
  }

  await logSync("sales_xlsx", filename, totalRows, inserted);

  // 매칭 통계
  const matched = transformed.filter((r) => r.customer_code).length;
  const unmatched = transformed.filter((r) => !r.customer_code).length;
  const unmatchedNames = [...new Set(transformed.filter((r) => !r.customer_code).map((r) => r.customer_name))];

  return { rows_processed: totalRows, rows_inserted: inserted, matched, unmatched, unmatched_names: unmatchedNames };
}

/** 거래처 마스터 XLS 처리 */
async function processCustomerXLS(buffer, filename) {
  const customers = parseCustomerXLS(buffer);
  if (customers.length === 0) {
    await logSync("customers", filename, 0, 0, "success", "데이터 없음");
    return { rows_processed: 0, rows_inserted: 0 };
  }

  const upserted = await upsertCustomers(customers);
  await logSync("customers", filename, customers.length, upserted);

  return { rows_processed: customers.length, rows_inserted: upserted };
}

/** 영업일지 XLS 처리 */
async function processDiaryXLS(buffer, filename, year) {
  const { entries, sheetNames } = parseDiaryXLS(buffer, year);

  if (entries.length === 0) {
    await logSync("diary_xls", filename, 0, 0, "success", "데이터 없음");
    return { rows_processed: 0, rows_inserted: 0, sales_reps: sheetNames };
  }

  // 거래처 코드 매칭
  const lookupMap = await buildCustomerLookupMap();
  const entriesWithCode = entries.map((e) => {
    if (lookupMap.size > 0) {
      const match = lookupCustomerCode(e.company_name, lookupMap);
      return { ...e, customer_code: match.customer_code };
    }
    return { ...e, customer_code: null };
  });

  // 기존 데이터 삭제
  await supabase.from("sales_diary").delete().eq("source_file", filename);

  // Insert
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < entriesWithCode.length; i += BATCH) {
    const batch = entriesWithCode.slice(i, i + BATCH).map((e) => ({ ...e, source_file: filename }));
    const { error } = await supabase.from("sales_diary").insert(batch);
    if (error) throw new Error(`Insert 오류: ${error.message}`);
    inserted += batch.length;
  }

  // RAG 임베딩
  const composedText = composeDiaryText(entries);
  const chunks = chunkText(composedText);
  const months = [...new Set(entries.map((e) => e.diary_date.slice(0, 7)))];
  const docId = `diary_${months[0] || year}`;

  await supabase.from("rag_chunks").delete().eq("doc_id", docId);

  if (chunks.length > 0) {
    const embeddings = await embedTexts(chunks);
    for (let i = 0; i < chunks.length; i++) {
      const embeddingVector = embeddings[i].values || embeddings[i];
      await supabase.from("rag_chunks").insert({
        doc_id: docId,
        chunk_idx: i,
        content: chunks[i],
        metadata: { source: "diary", file: filename, months },
        embedding: embeddingVector,
      });
    }
  }

  await logSync("diary_xls", filename, entries.length, inserted);

  // 매칭 통계
  const matched = entriesWithCode.filter((e) => e.customer_code).length;
  const unmatched = entriesWithCode.filter((e) => !e.customer_code).length;

  return { rows_processed: entries.length, rows_inserted: inserted, sales_reps: sheetNames, matched, unmatched };
}

/** formidable로 파일 파싱 (Vercel 호환) */
function parseForm(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    const form = formidable({
      maxFileSize: MAX_FILE_SIZE,
      fileWriteStreamHandler: () => {
        const writable = new Writable({
          write(chunk, _encoding, callback) {
            chunks.push(chunk);
            callback();
          },
        });
        return writable;
      },
    });

    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);

      const fileKey = Object.keys(files)[0];
      const file = files[fileKey];
      const fileObj = Array.isArray(file) ? file[0] : file;

      resolve({
        fields: Object.fromEntries(
          Object.entries(fields).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
        ),
        file: fileObj,
        buffer: Buffer.concat(chunks),
      });
    });
  });
}

export default async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!verifyAuth(req)) return sendUnauthorized(res);

  try {
    validateEnv();

    const { fields, file, buffer } = await parseForm(req);
    const type = fields.type; // "sales", "diary", or "customers"
    const filename = file?.originalFilename || "unknown";

    // 확장자 검증
    const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0];
    if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
      return res.status(400).json({
        success: false,
        error: `허용되지 않는 파일 형식입니다. (${ALLOWED_EXTENSIONS.join(", ")}만 가능)`,
      });
    }

    // 타입 검증
    if (!type || !["sales", "diary", "customers"].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'type은 "sales", "diary", 또는 "customers"이어야 합니다.',
      });
    }

    let result;

    if (type === "customers") {
      result = await processCustomerXLS(buffer, filename);
    } else if (type === "sales") {
      if (ext === ".csv") {
        result = await processSalesCSV(buffer, filename);
      } else {
        result = await processSalesXLSX(buffer, filename);
      }
    } else {
      // diary
      const yearMatch = filename.match(/(\d{4})/);
      const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
      if (!year || year < 2000 || year > 2100) {
        return res.status(400).json({
          success: false,
          error: "파일명에 연도가 포함되어야 합니다. (예: sales_diary_2026_01.xls)",
        });
      }
      result = await processDiaryXLS(buffer, filename, year);
    }

    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("업로드 오류:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
