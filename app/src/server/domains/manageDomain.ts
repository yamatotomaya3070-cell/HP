// 独自ドメイン公開の運用ロジック（(B)）。DB(GeneratedSite.customDomain) と DNS手順・Vercel接続を束ねる。
// Vercel 未設定でも「ドメイン登録＋DNS手順提示」までは動く（検証は手順設定後に refresh で確認）。

import { prisma } from "@/lib/db.js";
import { buildDnsInstruction, normalizeDomain, type DnsInstruction } from "./dnsInstructions.js";
import {
  readVercelConfig,
  addDomainToProject,
  getDomainStatus,
  type DomainStatus,
} from "./vercelDomains.js";

export interface RegisterDomainResult {
  facilityId: string;
  siteId: string;
  domain: string;
  instruction: DnsInstruction;
  /** Vercel 未設定なら undefined（DNS手順のみ提示）。 */
  vercel?: DomainStatus;
}

/** 事業所の公開サイトに独自ドメインを登録し、DNS手順（＋Vercel設定）を返す。 */
export async function registerFacilityDomain(input: {
  facilityId: string;
  domain: string;
}): Promise<RegisterDomainResult> {
  const domain = normalizeDomain(input.domain);
  if (!domain.includes(".")) {
    throw new Error(`ドメイン形式が不正です: ${input.domain}`);
  }

  const site = await prisma.generatedSite.findFirst({
    where: { facilityId: input.facilityId },
    orderBy: { createdAt: "asc" },
  });
  if (!site) throw new Error("この事業所のHPが未生成です（先に npm run generate）");

  // ドメイン変更時は検証状態をリセット（新しいドメインは未検証から始める）。
  await prisma.generatedSite.update({
    where: { id: site.id },
    data: { customDomain: domain, domainVerifiedAt: null },
  });
  await prisma.auditLog.create({
    data: {
      facilityId: input.facilityId,
      action: "domain.register",
      actor: "system",
      after: { siteId: site.id, domain },
    },
  });

  const instruction = buildDnsInstruction(domain);

  const cfg = readVercelConfig();
  const vercel = cfg ? await addDomainToProject(domain, cfg) : undefined;

  return { facilityId: input.facilityId, siteId: site.id, domain, instruction, vercel };
}

/** ドメインの検証状態を Vercel に問い合わせ、検証済みなら domainVerifiedAt を確定する。 */
export async function refreshDomainVerification(domainInput: string): Promise<{
  domain: string;
  verified: boolean;
  configured: boolean;
}> {
  const domain = normalizeDomain(domainInput);
  const cfg = readVercelConfig();
  if (!cfg) return { domain, verified: false, configured: false };

  const status = await getDomainStatus(domain, cfg);
  if (status.verified) {
    await prisma.generatedSite.updateMany({
      where: { customDomain: domain, domainVerifiedAt: null },
      data: { domainVerifiedAt: new Date() },
    });
  }
  return { domain, verified: status.verified, configured: true };
}
