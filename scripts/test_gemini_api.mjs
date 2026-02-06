import "dotenv/config";
import { ai, GEN_MODEL } from "../lib/clients.mjs";

async function testAPI() {
  console.log(`\nGemini API 테스트 (모델: ${GEN_MODEL})\n`);

  try {
    const result = await ai.models.generateContent({
      model: GEN_MODEL,
      contents: ["Hello, what is 1+1?"],
    });

    console.log("응답:", result.text);
    console.log("\n테스트 성공\n");
  } catch (error) {
    console.error("오류:", error.message);
  }
}

testAPI();
