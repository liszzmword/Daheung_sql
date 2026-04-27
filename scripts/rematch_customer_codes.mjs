/**
 * customer_code가 NULL인 sales_clean / purchases / sales_diary row를
 * 강화된 lookupCustomerCode()로 재매칭
 *
 * 사용법:
 *   node scripts/rematch_customer_codes.mjs              # 전체 (sales_clean + purchases + sales_diary)
 *   node scripts/rematch_customer_codes.mjs --table sales_clean
 *   node scripts/rematch_customer_codes.mjs --dry-run    # 변경 없이 매칭 결과만 출력
 *
 * 사전조건: backfill_normalized_names.mjs 선실행 (customers.normalized_name 채워져 있어야 함)
 */
import "dotenv/config";
import { supabase } from "../lib/clients.mjs";
import { buildCustomerLookupMap, lookupCustomerCode } from "../lib/customers.mjs";

const TABLES = [
  { name: "sales_clean", nameCol: "customer_name" },
  { name: "purchases", nameCol: "customer_name" },
  { name: "sales_diary", nameCol: "company_name" },
];

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const tableArgIdx = args.indexOf("--table");
const onlyTable = tableArgIdx >= 0 ? args[tableArgIdx + 1] : null;

async function rematchTable(tableName, nameCol, lookupMap) {
  console.log(`\n[${tableName}] 미할당 row 재매칭 시작`);

  const PAGE = 1000;
  let from = 0;
  let totalScanned = 0;
  let totalMatched = 0;
  let totalUpdated = 0;

  while (true) {
    const { data, error } = await supabase
      .from(tableName)
      .select(`id, ${nameCol}`)
      .is("customer_code", null)
      .order("id")
      .range(from, from + PAGE - 1);

    if (error) {
      console.error(`  조회 오류: ${error.message}`);
      return;
    }
    if (!data || data.length === 0) break;

    totalScanned += data.length;

    const updates = [];
    for (const row of data) {
      const name = row[nameCol];
      if (!name) continue;
      const result = lookupCustomerCode(name, lookupMap);
      if (result.matched) {
        totalMatched++;
        updates.push({ id: row.id, customer_code: result.customer_code });
      }
    }

    if (!dryRun && updates.length > 0) {
      for (const u of updates) {
        const { error: upErr } = await supabase
          .from(tableName)
          .update({ customer_code: u.customer_code })
          .eq("id", u.id);
        if (upErr) {
          console.error(`  id=${u.id} 업데이트 오류: ${upErr.message}`);
        } else {
          totalUpdated++;
        }
      }
    }

    console.log(`  ${totalScanned}건 스캔 / ${totalMatched}건 매칭${dryRun ? "" : ` / ${totalUpdated}건 적용`}`);

    if (data.length < PAGE) break;
    from += PAGE;
  }

  console.log(`[${tableName}] 완료: 스캔 ${totalScanned} / 매칭 ${totalMatched}${dryRun ? " (dry-run)" : ` / 적용 ${totalUpdated}`}`);
}

async function main() {
  console.log("거래처 룩업맵 빌드 중...");
  const lookupMap = await buildCustomerLookupMap();
  console.log(`  ${lookupMap.size}개 정규화 거래처 로드됨`);

  if (lookupMap.size === 0) {
    console.error("customers 테이블이 비어있습니다. 먼저 거래처 마스터를 업로드하세요.");
    process.exit(1);
  }

  const targets = onlyTable
    ? TABLES.filter((t) => t.name === onlyTable)
    : TABLES;

  if (targets.length === 0) {
    console.error(`알 수 없는 테이블: ${onlyTable}`);
    process.exit(1);
  }

  for (const t of targets) {
    await rematchTable(t.name, t.nameCol, lookupMap);
  }

  console.log(dryRun ? "\n(dry-run 모드 - 실제 변경 없음)" : "\n✅ 모든 작업 완료");
}

main().catch((err) => {
  console.error("실행 중 오류:", err);
  process.exit(1);
});
