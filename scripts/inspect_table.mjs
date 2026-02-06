import "dotenv/config";
import { supabase } from "../lib/clients.mjs";
import { TABLE_NAME } from "../lib/schema.mjs";

async function inspectTable() {
  console.log(`\n${TABLE_NAME} 테이블 구조 확인\n`);

  try {
    const { data, error } = await supabase.from(TABLE_NAME).select("*").limit(1);

    if (error || !data || data.length === 0) {
      console.error(`테이블 '${TABLE_NAME}'을 찾을 수 없습니다.`);
      if (error) console.error(error.message);
      process.exit(1);
    }

    const sample = data[0];
    const columns = Object.keys(sample);

    console.log("컬럼 목록:");
    columns.forEach((col) => {
      const value = sample[col];
      console.log(`  ${col} (${typeof value}): ${String(value).substring(0, 50)}`);
    });

    const { count } = await supabase.from(TABLE_NAME).select("*", { count: "exact", head: true });
    console.log(`\n총 행 수: ${count?.toLocaleString()}개\n`);
  } catch (err) {
    console.error("오류:", err.message);
    process.exit(1);
  }
}

inspectTable();
