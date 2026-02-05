import "dotenv/config";
import fs from "fs";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

// 1) Gemini 클라이언트 (임베딩 만들 때 사용)
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// 2) Supabase 클라이언트 (DB에 저장할 때 사용)
// ⚠️ service_role 키는 로컬/서버에서만 사용. 절대 브라우저에 넣지 말기.
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 3) 문서를 잘게 쪼개기(청킹) - RAG 검색 성능을 위해 필요
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

// 4) 여러 chunk를 한 번에 임베딩 생성(배치)
async function embedTexts(texts) {
  const embedDim = Number(process.env.EMBED_DIM || "1536");

  const res = await ai.models.embedContent({
    model: process.env.EMBED_MODEL || "gemini-embedding-001",
    contents: texts,
    config: {
      outputDimensionality: embedDim,
    },
  });

  return res.embeddings;
}

// 5) 문서 하나를 읽어서 → 청킹 → 임베딩 → DB 저장
async function ingestDoc(docId, filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const chunks = chunkText(text);

  console.log(`Ingesting ${docId}: ${chunks.length} chunks`);

  // 재실행할 때 중복 저장 방지: 같은 doc_id는 삭제 후 다시 넣기
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
  const base = path.resolve("rag_docs");

  await ingestDoc("data_dictionary", path.join(base, "data_dictionary.md"));
  await ingestDoc("metrics", path.join(base, "metrics.md"));
  await ingestDoc("business_rules", path.join(base, "business_rules.md"));

  console.log("✅ done");
}

main().catch((e) => {
  console.error("❌ error:", e);
  process.exit(1);
});
