import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function testAPI() {
  console.log("\n🧪 Gemini API 응답 구조 테스트\n");

  try {
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: ["Hello, what is 1+1?"],
    });

    console.log("📦 전체 응답 객체:\n");
    console.log(JSON.stringify(result, null, 2));

    console.log("\n" + "=".repeat(80) + "\n");

    // 여러 가능성 테스트
    console.log("🔍 텍스트 추출 시도:\n");

    if (result.text) {
      console.log("✅ result.text:", result.text);
    }
    if (typeof result.text === "function") {
      console.log("✅ result.text():", result.text());
    }
    if (result.response) {
      console.log("✅ result.response 존재");
      if (result.response.text) {
        console.log("   result.response.text:", result.response.text);
      }
      if (typeof result.response.text === "function") {
        console.log("   result.response.text():", result.response.text());
      }
    }
    if (result.content) {
      console.log("✅ result.content:", result.content);
    }
    if (result.candidates) {
      console.log(
        "✅ result.candidates[0]:",
        JSON.stringify(result.candidates[0], null, 2)
      );
    }
  } catch (error) {
    console.error("❌ 오류:", error.message);
  }
}

testAPI();
