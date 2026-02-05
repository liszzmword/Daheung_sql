import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkFunctions() {
  console.log("\n🔍 Supabase 함수 확인\n");
  console.log("=".repeat(80) + "\n");

  // 1. match_documents 함수 확인
  console.log("1️⃣  match_documents 함수 확인...");
  try {
    const testEmbedding = new Array(1536).fill(0);
    const { data, error } = await supabase.rpc("match_documents", {
      query_embedding: testEmbedding,
      match_threshold: 0.5,
      match_count: 1,
    });

    if (error) {
      console.log("   ❌ match_documents 함수 없음");
      console.log(`   오류: ${error.message}\n`);
    } else {
      console.log("   ✅ match_documents 함수 존재\n");
    }
  } catch (err) {
    console.log("   ❌ match_documents 함수 없음");
    console.log(`   오류: ${err.message}\n`);
  }

  // 2. exec_sql 함수 확인
  console.log("2️⃣  exec_sql 함수 확인...");
  try {
    const { data, error } = await supabase.rpc("exec_sql", {
      query: "SELECT 1 as test",
    });

    if (error) {
      console.log("   ❌ exec_sql 함수 없음");
      console.log(`   오류: ${error.message}\n`);
    } else {
      console.log("   ✅ exec_sql 함수 존재\n");
    }
  } catch (err) {
    console.log("   ❌ exec_sql 함수 없음");
    console.log(`   오류: ${err.message}\n`);
  }

  console.log("=".repeat(80));
  console.log("\n💡 함수가 없으면 Supabase SQL Editor에서 생성하세요.\n");
}

checkFunctions();
