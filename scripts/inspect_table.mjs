import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function inspectTable() {
  console.log("\n🔍 Supabase 테이블 목록 및 구조 확인\n");
  console.log("=".repeat(80) + "\n");

  try {
    // 0. 먼저 모든 테이블 목록 가져오기
    console.log("📋 사용 가능한 테이블 목록:\n");

    const { data: tables, error: tablesError } = await supabase
      .from("information_schema.tables")
      .select("table_name")
      .eq("table_schema", "public");

    if (!tablesError && tables) {
      tables.forEach((t, idx) => {
        console.log(`  ${idx + 1}. ${t.table_name}`);
      });
      console.log();
    }

    // 여러 가능한 테이블명 시도
    const possibleNames = ["sales-clean", "sales_clean", "salesclean", "sales"];
    let tableName = null;
    let data = null;

    for (const name of possibleNames) {
      const { data: testData, error: testError } = await supabase
        .from(name)
        .select("*")
        .limit(1);

      if (!testError && testData && testData.length > 0) {
        tableName = name;
        data = testData;
        break;
      }
    }

    if (!tableName) {
      console.error("❌ sales 관련 테이블을 찾을 수 없습니다.");
      console.log("\n💡 위 목록에서 올바른 테이블명을 확인해주세요.");
      process.exit(1);
    }

    console.log(`✅ 테이블 발견: '${tableName}'\n`);
    console.log("=".repeat(80) + "\n");

    // 2. 컬럼 정보 추출
    const sample = data[0];
    const columns = Object.keys(sample);

    console.log("📊 컬럼 정보:\n");
    console.log("┌" + "─".repeat(30) + "┬" + "─".repeat(20) + "┬" + "─".repeat(40) + "┐");
    console.log("│ 컬럼명" + " ".repeat(24) + "│ 타입" + " ".repeat(16) + "│ 샘플 값" + " ".repeat(33) + "│");
    console.log("├" + "─".repeat(30) + "┼" + "─".repeat(20) + "┼" + "─".repeat(40) + "┤");

    columns.forEach((col) => {
      const value = sample[col];
      const type = typeof value;
      const displayValue = String(value).substring(0, 38);

      const colPad = col.padEnd(30);
      const typePad = type.padEnd(20);
      const valPad = displayValue.padEnd(40);

      console.log(`│ ${colPad}│ ${typePad}│ ${valPad}│`);
    });

    console.log("└" + "─".repeat(30) + "┴" + "─".repeat(20) + "┴" + "─".repeat(40) + "┘");

    // 3. 전체 행 수 확인
    const { count, error: countError } = await supabase
      .from(tableName)
      .select("*", { count: "exact", head: true });

    if (!countError) {
      console.log(`\n📈 총 행 수: ${count?.toLocaleString()}개`);
    }

    // 4. 샘플 데이터 전체 출력
    console.log("\n\n📄 샘플 데이터 (전체):\n");
    console.log(JSON.stringify(sample, null, 2));

    console.log("\n" + "=".repeat(80) + "\n");
    console.log("✅ 테이블 구조 확인 완료!");

  } catch (err) {
    console.error("❌ 예상치 못한 오류:", err.message);
    process.exit(1);
  }
}

inspectTable();
