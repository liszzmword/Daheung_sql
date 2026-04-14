import "dotenv/config";
import fs from "fs";
import path from "path";
import { supabase } from "../lib/clients.mjs";
import { embedTexts } from "../lib/embedding.mjs";

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

/** 문서 하나를 청킹 → 임베딩 → DB 저장 */
async function ingestDoc(docId, filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const chunks = chunkText(text);

  console.log(`  ${docId}: ${chunks.length}개 청크`);

  // 기존 데이터 삭제 (중복 방지)
  const del = await supabase.from("rag_chunks").delete().eq("doc_id", docId);
  if (del.error) throw del.error;

  const embeddings = await embedTexts(chunks);

  for (let i = 0; i < chunks.length; i++) {
    const embeddingVector = embeddings[i].values || embeddings[i];
    const { error } = await supabase.from("rag_chunks").insert({
      doc_id: docId,
      chunk_idx: i,
      content: chunks[i],
      metadata: { source: filePath },
      embedding: embeddingVector,
    });
    if (error) throw error;
  }
}

async function main() {
  console.log("\n📥 RAG 문서 인제스트 시작\n");

  const base = path.resolve("rag_docs");

  await ingestDoc("data_dictionary", path.join(base, "data_dictionary.md"));
  await ingestDoc("metrics", path.join(base, "metrics.md"));
  await ingestDoc("business_rules", path.join(base, "business_rules.md"));

  console.log("\n✅ 인제스트 완료\n");
}

main().catch((e) => {
  console.error("❌ 오류:", e.message);
  process.exit(1);
});
