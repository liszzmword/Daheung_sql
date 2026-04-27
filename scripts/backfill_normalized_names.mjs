/**
 * customers 테이블의 normalized_name 컬럼을 1회 backfill
 *
 * 사용법:
 *   node scripts/backfill_normalized_names.mjs
 *
 * 사전조건: Supabase에서 ALTER TABLE customers ADD COLUMN normalized_name TEXT 완료
 */
import "dotenv/config";
import { supabase } from "../lib/clients.mjs";
import { normalizeName } from "../lib/customers.mjs";

async function main() {
  console.log("거래처 normalized_name backfill 시작...");

  const { data, error } = await supabase
    .from("customers")
    .select("customer_code, company_name");

  if (error) {
    console.error("거래처 조회 실패:", error.message);
    process.exit(1);
  }

  if (!data || data.length === 0) {
    console.log("customers 테이블이 비어있습니다.");
    return;
  }

  console.log(`총 ${data.length}건 처리 중...`);

  const updates = data
    .map((c) => ({
      customer_code: c.customer_code,
      company_name: c.company_name,
      normalized_name: normalizeName(c.company_name),
    }))
    .filter((c) => c.normalized_name !== "");

  const BATCH = 500;
  let updated = 0;
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    const { error: upErr } = await supabase
      .from("customers")
      .upsert(batch, { onConflict: "customer_code", ignoreDuplicates: false });
    if (upErr) {
      console.error(`배치 ${i} 업데이트 실패:`, upErr.message);
      process.exit(1);
    }
    updated += batch.length;
    console.log(`  ${updated}/${updates.length} 완료`);
  }

  console.log(`\n✅ ${updated}건 정규화 완료`);

  const samples = updates.slice(0, 10);
  console.log("\n샘플 (앞 10건):");
  for (const s of samples) {
    console.log(`  ${s.company_name.padEnd(30)} → ${s.normalized_name}`);
  }
}

main().catch((err) => {
  console.error("실행 중 오류:", err);
  process.exit(1);
});
