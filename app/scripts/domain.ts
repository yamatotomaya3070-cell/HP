// 独自ドメイン公開の運用CLI（(B)）。
//   登録（DBにドメイン設定＋DNS手順提示。Vercel設定時はプロジェクトにも追加）:
//     npm run domain -- --facilityNumber 2910103973 --domain www.example-fukushi.jp
//   検証確認（DNS設定後、Vercelで検証済みか確認し domainVerifiedAt を確定）:
//     npm run domain -- --domain www.example-fukushi.jp --verify

import { prisma } from "@/lib/db.js";
import { registerFacilityDomain, refreshDomainVerification } from "@/server/domains/manageDomain.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function has(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const domain = arg("domain");
  if (!domain) throw new Error("--domain が必要です");

  if (has("verify")) {
    const r = await refreshDomainVerification(domain);
    if (!r.configured) {
      console.log("Vercel 未設定（VERCEL_API_TOKEN / VERCEL_PROJECT_ID）。DNS設定後、設定を入れて再実行してください。");
    } else {
      console.log(`${r.domain}: ${r.verified ? "検証済み（公開可能）" : "未検証（DNS反映待ち）"}`);
    }
    return;
  }

  const facilityNumber = arg("facilityNumber");
  if (!facilityNumber) throw new Error("登録には --facilityNumber が必要です");
  const facility = await prisma.facility.findUnique({
    where: { facilityNumber },
    select: { id: true, name: true },
  });
  if (!facility) throw new Error(`事業所番号が見つかりません: ${facilityNumber}`);

  const r = await registerFacilityDomain({ facilityId: facility.id, domain });
  console.log(`事業所: ${facility.name}`);
  console.log(`ドメイン: ${r.domain}`);
  console.log("──── 事業所に案内するDNS設定 ────");
  console.log(r.instruction.note);
  for (const rec of r.instruction.records) {
    console.log(`  種類: ${rec.type} / 名前: ${rec.name} / 値: ${rec.value}`);
  }
  if (r.vercel) {
    console.log(`Vercel: ${r.vercel.verified ? "検証済み" : "追加済み（DNS反映後に --verify で確認）"}`);
  } else {
    console.log("Vercel 未設定のため、プロジェクトへの追加はスキップ（DNS手順のみ提示）。");
  }
}

main()
  .catch((e) => {
    console.error("失敗:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
