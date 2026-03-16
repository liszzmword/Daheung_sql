/**
 * 파일 업로드 API (세일즈 CSV / 영업일지 XLS)
 * POST /api/upload
 * multipart/form-data: file, type(sales|diary), year(diary용)
 */
import { Writable } from "stream";
import formidable from "formidable";
import { parse } from "csv-parse/sync";
import { validateEnv, supabase } from "../lib/clients.mjs";
import { embedTexts } from "../lib/embedding.mjs";
import { parseDiaryXLS, composeDiaryText } from "../lib/diary.mjs";
import { verifyAuth, setCorsHeaders, sendUnauthorized } from "../lib/auth.mjs";

/** Vercel에서 body parsing 비활성화 */
export const config = { api: { bodyParser: false } };

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = [".csv", ".xls", ".xlsx"];

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

/** 날짜 변환 */
function parseDate(val) {
  if (!val) return null;
  const str = String(val).trim();
  const dotMatch = str.match(/^(\d{4})\.(\d{1,2})\.(\d{1,2})$/);
  if (dotMatch) {
    const [, y, m, d] = dotMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
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

/** 세일즈 CSV 처리 */
async function processSalesCSV(buffer, filename) {
  const csvContent = buffer.toString("utf8");
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true,
  });

  const transformed = records
    .map((row) => ({
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
    }))
    .filter((r) => r.sale_date && r.customer_name);

  // 전체 교체
  await supabase.from("sales_clean").delete().neq("id", 0);

  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < transformed.length; i += BATCH) {
    const batch = transformed.slice(i, i + BATCH);
    const { error } = await supabase.from("sales_clean").insert(batch);
    if (error) throw new Error(`Insert 오류: ${error.message}`);
    inserted += batch.length;
  }

  await logSync("sales_csv", filename, records.length, inserted);
  return { rows_processed: records.length, rows_inserted: inserted };
}

/** 영업일지 XLS 처리 */
async function processDiaryXLS(buffer, filename, year) {
  const { entries, sheetNames } = parseDiaryXLS(buffer, year);

  if (entries.length === 0) {
    await logSync("diary_xls", filename, 0, 0, "success", "데이터 없음");
    return { rows_processed: 0, rows_inserted: 0, sales_reps: sheetNames };
  }

  // 기존 데이터 삭제
  await supabase.from("sales_diary").delete().eq("source_file", filename);

  // Insert
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH).map((e) => ({ ...e, source_file: filename }));
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
  return { rows_processed: entries.length, rows_inserted: inserted, sales_reps: sheetNames };
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
    const type = fields.type; // "sales" or "diary"
    const year = parseInt(fields.year, 10);
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
    if (!type || !["sales", "diary"].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'type은 "sales" 또는 "diary"이어야 합니다.',
      });
    }

    if (type === "diary" && (isNaN(year) || year < 2000 || year > 2100)) {
      return res.status(400).json({
        success: false,
        error: "영업일지는 연도(year)가 필요합니다. (2000~2100)",
      });
    }

    let result;
    if (type === "sales") {
      result = await processSalesCSV(buffer, filename);
    } else {
      result = await processDiaryXLS(buffer, filename, year);
    }

    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("업로드 오류:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
