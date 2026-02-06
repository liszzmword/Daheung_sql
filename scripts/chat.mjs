import "dotenv/config";
import readline from "readline";
import { embedQuery } from "../lib/embedding.mjs";
import { searchRelevantDocs, buildContext, generateRAGAnswer } from "../lib/rag.mjs";

/** 대화형 RAG 챗봇 */
async function startChat() {
  console.log("\n세일즈 RAG 챗봇");
  console.log("비즈니스 규칙, 데이터 정의 등에 대해 질문하세요.");
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

      console.log("\n처리 중...");
      try {
        const embedding = await embedQuery(trimmed);
        const docs = await searchRelevantDocs(embedding, { count: 5 });

        if (!docs || docs.length === 0) {
          console.log("\n관련 문서를 찾을 수 없습니다.\n");
        } else {
          const context = buildContext(docs);
          const answer = await generateRAGAnswer(trimmed, context);
          console.log(`\n${answer}\n`);
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
