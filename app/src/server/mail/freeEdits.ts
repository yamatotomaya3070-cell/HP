// 無料編集の回数管理（仕様: メールでの無料編集は最大3回）。
// 適用済みのメール編集(EditRequest channel=email, status=applied)を数える。

import { prisma } from "@/lib/db.js";

export const MAX_FREE_EMAIL_EDITS = 3;

/** これまでに適用されたメール編集の回数。 */
export async function appliedEmailEditCount(facilityId: string): Promise<number> {
  return prisma.editRequest.count({
    where: { facilityId, channel: "email", status: "applied" },
  });
}

/** あと何回無料でメール編集できるか（0以上）。 */
export async function remainingFreeEdits(facilityId: string): Promise<number> {
  const used = await appliedEmailEditCount(facilityId);
  return Math.max(0, MAX_FREE_EMAIL_EDITS - used);
}
