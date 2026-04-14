import "dotenv/config";
import readline from "readline";
import { embedQuery } from "../lib/embedding.mjs";
import { searchRelevantDocs, buildContext } from "../lib/rag.mjs";
import { generateAndExecuteSQL, generateSQLAnswer } from "../lib/sql.mjs";

/** 대화형 SQL 챗봇 */
async function startChat() {
  console.log("\n세일즈 SQL 챗봇");
  console.log("매출 데이터에 대해 질문하면 SQL을 자동 생성하여 답변합니다.");
  console.log("대화가 이어지므로 후속 질문이 가능합니다.");
  console.log('종료: exit / quit / q\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const history = []; // 대화 이력

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

        const { sql, result } = await generateAndExecuteSQL(trimmed, ragContext, 1, history);
        console.log(`SQL: ${sql}\n`);

        // 이력에 사용자 질문 추가
        history.push({ role: "user", content: trimmed });

        if (!result.success) {
          console.log(`실행 실패: ${result.error}\n`);
          history.push({ role: "assistant", content: `오류: ${result.error}` });
        } else {
          const answer = await generateSQLAnswer(trimmed, sql, result);
          console.log(`${answer}\n`);
          history.push({ role: "assistant", content: answer, sql, rowCount: result.data?.length || 0 });
        }

        // 이력이 너무 길어지지 않도록 최근 10턴만 유지
        if (history.length > 10) history.splice(0, history.length - 10);
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
