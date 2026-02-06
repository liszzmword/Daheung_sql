import "dotenv/config";
import { embedQuery } from "../lib/embedding.mjs";
import { searchRelevantDocs, buildContext, generateRAGAnswer } from "../lib/rag.mjs";

/** CLI 단일 질의 (RAG 문서 기반) */
async function main() {
  const question = process.argv[2];

  if (!question) {
    console.error('사용법: node scripts/query_rag.mjs "질문 내용"');
    console.error('  예: node scripts/query_rag.mjs "매출 계산 방법은?"');
    process.exit(1);
  }

  console.log(`\n질문: ${question}\n`);

  const embedding = await embedQuery(question);
  const docs = await searchRelevantDocs(embedding, { count: 5 });

  if (!docs || docs.length === 0) {
    console.log("관련 문서를 찾을 수 없습니다.\n");
    return;
  }

  console.log(`참고 문서 ${docs.length}건:`);
  docs.forEach((d, i) => console.log(`  ${i + 1}. ${d.doc_id} (${(d.similarity * 100).toFixed(1)}%)`));

  const context = buildContext(docs);
  const answer = await generateRAGAnswer(question, context);

  console.log(`\n답변:\n${answer}\n`);
}

main().catch((e) => {
  console.error("오류:", e.message);
  process.exit(1);
});
