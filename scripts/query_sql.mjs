import "dotenv/config";
import { embedQuery } from "../lib/embedding.mjs";
import { searchRelevantDocs, buildContext } from "../lib/rag.mjs";
import { generateAndExecuteSQL, generateSQLAnswer } from "../lib/sql.mjs";

/** CLI 단일 질의 (Text-to-SQL) */
async function main() {
  const question = process.argv[2];

  if (!question) {
    console.error('사용법: node scripts/query_sql.mjs "질문 내용"');
    console.error('  예: node scripts/query_sql.mjs "2024년 전체 매출은?"');
    process.exit(1);
  }

  console.log(`\n질문: ${question}\n`);

  // 1. RAG 검색
  const embedding = await embedQuery(question);
  const docs = await searchRelevantDocs(embedding);
  const ragContext = buildContext(docs) || "기본 스키마만 사용";

  if (docs.length > 0) {
    console.log(`참고 문서 ${docs.length}건 발견`);
  }

  // 2. SQL 생성 + 실행
  const { sql, result } = await generateAndExecuteSQL(question, ragContext);

  console.log(`SQL: ${sql}\n`);

  if (!result.success) {
    console.log(`SQL 실행 실패: ${result.error}\n`);
    return;
  }

  console.log(`결과: ${result.rowCount}건\n`);

  // 3. 답변 생성
  const answer = await generateSQLAnswer(question, sql, result);
  console.log(`답변:\n${answer}\n`);
}

main().catch((e) => {
  console.error("오류:", e.message);
  process.exit(1);
});
