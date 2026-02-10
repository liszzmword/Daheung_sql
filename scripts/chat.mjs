import "dotenv/config";
import readline from "readline";
import { embedQuery } from "../lib/embedding.mjs";
import { searchRelevantDocs, buildContext, generateRAGAnswer } from "../lib/rag.mjs";

/** 대화형 RAG 챗봇 */
async function startChat() {
  console.log("\n세일즈 RAG 챗봇");
  console.log("비즈니스 규칙, 데이터 정의 등에 대해 질문하세요.");
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

      console.log("\n처리 중...");
      try {
        const embedding = await embedQuery(trimmed);
        const docs = await searchRelevantDocs(embedding, { count: 5 });

        // 이력에 사용자 질문 추가
        history.push({ role: "user", content: trimmed });

        if (!docs || docs.length === 0) {
          console.log("\n관련 문서를 찾을 수 없습니다.\n");
          history.push({ role: "assistant", content: "관련 문서를 찾을 수 없습니다." });
        } else {
          const context = buildContext(docs);
          const answer = await generateRAGAnswer(trimmed, context, history.slice(0, -1));
          console.log(`\n${answer}\n`);
          history.push({ role: "assistant", content: answer });
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
