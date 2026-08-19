// Vercel Domains API アダプタ（(B) 独自ドメインをプロジェクトに紐付ける差込口）。
// VERCEL_API_TOKEN と VERCEL_PROJECT_ID があれば実接続、無ければ未設定（DNS手順のみ提示する運用に切替）。
// ※ 実トークン投入後に実接続を要確認。fetch 直叩き（追加SDK不要）。

const API = "https://api.vercel.com";

export class DomainApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "DomainApiError";
  }
}

export interface VercelDomainConfig {
  token: string;
  projectId: string;
  teamId?: string;
}

export interface DomainStatus {
  domain: string;
  /** DNS/SSL 検証が完了しているか。 */
  verified: boolean;
  /** 未検証時に必要な確認レコード（あれば）。 */
  verification?: { type: string; domain: string; value: string }[];
}

/** 環境から Vercel 設定を読む（未設定なら null）。 */
export function readVercelConfig(): VercelDomainConfig | null {
  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (!token || !projectId) return null;
  return { token, projectId, teamId: process.env.VERCEL_TEAM_ID };
}

function withTeam(url: string, cfg: VercelDomainConfig): string {
  return cfg.teamId ? `${url}${url.includes("?") ? "&" : "?"}teamId=${cfg.teamId}` : url;
}

async function call(path: string, cfg: VercelDomainConfig, init?: RequestInit): Promise<unknown> {
  const res = await fetch(withTeam(`${API}${path}`, cfg), {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = (body?.error as { message?: string } | undefined)?.message ?? res.statusText;
    throw new DomainApiError(`Vercel API エラー: ${msg}`, res.status);
  }
  return body;
}

/** ドメインをプロジェクトに追加する。 */
export async function addDomainToProject(domain: string, cfg: VercelDomainConfig): Promise<DomainStatus> {
  const body = (await call(`/v10/projects/${cfg.projectId}/domains`, cfg, {
    method: "POST",
    body: JSON.stringify({ name: domain }),
  })) as { verified?: boolean; verification?: DomainStatus["verification"] };
  return { domain, verified: Boolean(body.verified), verification: body.verification };
}

/** ドメインの現在の検証状態を取得する。 */
export async function getDomainStatus(domain: string, cfg: VercelDomainConfig): Promise<DomainStatus> {
  const body = (await call(`/v9/projects/${cfg.projectId}/domains/${domain}`, cfg)) as {
    verified?: boolean;
    verification?: DomainStatus["verification"];
  };
  return { domain, verified: Boolean(body.verified), verification: body.verification };
}
