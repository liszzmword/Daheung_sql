/**
 * 영업일지 XLS → Supabase 동기화 스크립트
 *
 * 사용법:
 *   npm run sync-diary -- <파일경로> <연도>
 *   node scripts/sync_diary.mjs "path/to/12월영업일지.xls" 2025
 */
import "dotenv/config";
import path from "path";
import { supabase } from "../lib/clients.mjs";
import { embedTexts } from "../lib/embedding.mjs";
import { parseDiaryXLS, composeDiaryText } from "../lib/diary.mjs";

/** 텍스트를 청크로 분할 (ingest_rag_gemini.mjs와 동일) */
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

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error("사용법: node scripts/sync_diary.mjs <파일경로> <연도>");
    console.error("예: node scripts/sync_diary.mjs ./12월영업일지.xls 2025");
    process.exit(1);
  }

  const filePath = path.resolve(args[0]);
  const year = parseInt(args[1], 10);
  const filename = path.basename(filePath);

  if (isNaN(year) || year < 2000 || year > 2100) {
    console.error("유효한 연도를 입력해주세요 (2000~2100)");
    process.exit(1);
  }

  console.log(`\n영업일지 동기화 시작`);
  console.log(`  파일: ${filePath}`);
  console.log(`  연도: ${year}\n`);

  // 1. XLS 파싱
  const { entries, sheetNames } = parseDiaryXLS(filePath, year);
  console.log(`  시트(영업사원): ${sheetNames.join(", ")}`);
  console.log(`  총 ${entries.length}건 파싱 완료\n`);

  if (entries.length === 0) {
    console.log("파싱된 데이터가 없습니다.");
    await logSync("diary_xls", filename, 0, 0, "success", "데이터 없음");
    return;
  }

  // 2. 기존 데이터 삭제 (같은 파일명)
  const { error: delError } = await supabase
    .from("sales_diary")
    .delete()
    .eq("source_file", filename);
  if (delError) console.warn("  기존 데이터 삭제 경고:", delError.message);

  // 3. sales_diary에 batch insert
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH).map((e) => ({
      ...e,
      source_file: filename,
    }));
    const { error } = await supabase.from("sales_diary").insert(batch);
    if (error) throw new Error(`Insert 오류: ${error.message}`);
    inserted += batch.length;
    console.log(`  sales_diary insert: ${inserted}/${entries.length}`);
  }

  // 4. RAG 임베딩 (영업일지 노트를 벡터화)
  const composedText = composeDiaryText(entries);
  const chunks = chunkText(composedText);
  console.log(`\n  RAG 청크: ${chunks.length}개`);

  // 월 추출 (파일명 또는 데이터에서)
  const months = [...new Set(entries.map((e) => e.diary_date.slice(0, 7)))];
  const docId = `diary_${months[0] || year}`;

  // 기존 RAG 청크 삭제
  const { error: ragDelError } = await supabase
    .from("rag_chunks")
    .delete()
    .eq("doc_id", docId);
  if (ragDelError) console.warn("  기존 RAG 청크 삭제 경고:", ragDelError.message);

  // 임베딩 생성 및 저장
  if (chunks.length > 0) {
    const embeddings = await embedTexts(chunks);
    for (let i = 0; i < chunks.length; i++) {
      const embeddingVector = embeddings[i].values || embeddings[i];
      const { error } = await supabase.from("rag_chunks").insert({
        doc_id: docId,
        chunk_idx: i,
        content: chunks[i],
        metadata: { source: "diary", file: filename, months },
        embedding: embeddingVector,
      });
      if (error) throw new Error(`RAG insert 오류: ${error.message}`);
    }
    console.log(`  RAG 임베딩 저장 완료 (doc_id: ${docId})`);
  }

  // 5. 로그 기록
  await logSync("diary_xls", filename, entries.length, inserted);

  console.log(`\n동기화 완료: ${inserted}건 저장\n`);
}

main().catch(async (e) => {
  console.error("오류:", e.message);
  await logSync("diary_xls", process.argv[2] || "unknown", 0, 0, "error", e.message).catch(() => {});
  process.exit(1);
});
