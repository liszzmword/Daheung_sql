import "dotenv/config";
import { supabase, EMBED_DIM } from "../lib/clients.mjs";

async function checkFunctions() {
  console.log("\nSupabase RPC 함수 확인\n");

  // match_documents
  try {
    const testEmbedding = new Array(EMBED_DIM).fill(0);
    const { error } = await supabase.rpc("match_documents", {
      query_embedding: testEmbedding,
      match_threshold: 0.5,
      match_count: 1,
    });
    console.log(error ? `  match_documents: 실패 (${error.message})` : "  match_documents: 정상");
  } catch (err) {
    console.log(`  match_documents: 실패 (${err.message})`);
  }

  // exec_sql
  try {
    const { error } = await supabase.rpc("exec_sql", { query: "SELECT 1 as test" });
    console.log(error ? `  exec_sql: 실패 (${error.message})` : "  exec_sql: 정상");
  } catch (err) {
    console.log(`  exec_sql: 실패 (${err.message})`);
  }

  console.log();
}

checkFunctions();
