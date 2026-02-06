import "dotenv/config";
import readline from "readline";
import { embedQuery } from "../lib/embedding.mjs";
import { searchRelevantDocs, buildContext } from "../lib/rag.mjs";
import { generateAndExecuteSQL, generateSQLAnswer } from "../lib/sql.mjs";

/** 대화형 SQL 챗봇 */
async function startChat() {
  console.log("\n세일즈 SQL 챗봇");
  console.log("매출 데이터에 대해 질문하면 SQL을 자동 생성하여 답변합니다.");
  console.log('종료: exit / quit / q\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const ask = () => {
    rl.question("질문: ", async (input) => {
      const trimmed = input.trim();
      if (!trimmed) return ask();
      if (["exit", "quit", "q", "종료"].includes(trimmed.toLowerCase())) {
        console.log("\n종료합니다.\n");
        rl.close();
        return;
      }

      console.log("\n분석 중...");
      try {
        const embedding = await embedQuery(trimmed);
        const docs = await searchRelevantDocs(embedding);
        const ragContext = buildContext(docs) || "기본 스키마만 사용";

        const { sql, result } = await generateAndExecuteSQL(trimmed, ragContext);
        console.log(`SQL: ${sql}\n`);

        if (!result.success) {
          console.log(`실행 실패: ${result.error}\n`);
        } else {
          const answer = await generateSQLAnswer(trimmed, sql, result);
          console.log(`${answer}\n`);
        }
      } catch (err) {
        console.log(`\n오류: ${err.message}\n`);
      }

      ask();
    });
  };

  ask();
}

startChat().catch((e) => {
  console.error("오류:", e.message);
  process.exit(1);
});
