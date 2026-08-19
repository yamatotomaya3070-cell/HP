# 実装計画書

作成日: 2026-07-30
関連: `docs/current-system-analysis.md`

就労継続支援B型事業所向け「AIホームページ自動作成サービス」の段階実装計画。

---

## 1. 技術スタック（推奨）

グリーンフィールドのため新規選定。福祉事業者向けの軽量HP・営業・AI編集・課金を1アプリで扱うため、フルスタック TypeScript を推奨。

| レイヤ | 推奨 | 理由 / 代替 |
|------|------|------|
| フレームワーク | **Next.js 15 (App Router) + TypeScript** | 公開HP(SSG/ISR)・管理画面・API(route handlers)・Webhookを1つで。代替: Remix |
| DB | **PostgreSQL** | 仕様のリレーショナルなテーブル群に最適。JSONBで構造化HPデータを保持。ローカルは Docker / 本番は Neon or Supabase |
| ORM / マイグレーション | **Prisma** | 仕様12「DB変更はマイグレーションで」を満たす。型安全 |
| 認証（事業所） | **マジックリンク**（自前・署名付き期限トークン）| 仕様: パスワード不要・期限付き。管理者は別途 Basic/管理者認証 |
| 決済 | **Stripe**（Checkout + Billing + Customer Portal）| カード自社非保存。トライアル・サブスク・一回払い・Webhook署名検証を標準サポート。JP対応 |
| メール送信 | **Resend** もしくは **SendGrid** | 個別送信・SPF/DKIM/DMARC・バウンス/苦情Webhook |
| メール受信(Webhook) | 送信元に合わせる（SendGrid Inbound Parse / Resend Inbound / Postmark / Cloudflare Email Routing）| 事業所別 Reply-To を受信しWebhook化 |
| AI | **Anthropic Claude API**（`claude-sonnet-5` 既定、複雑編集は `claude-opus-5`）| 構造化編集（JSON出力）・営業文面。ホワイトリスト検証を必ず挟む |
| スクリーンショット | **Playwright**（Chromium headless）| 非公開プレビューを撮影しメール本文に埋め込む |
| バリデーション | **Zod** | 系境界（取込・Webhook・AI出力・フォーム）で必須 |
| テスト | **Vitest**（単体/結合）＋ **Playwright**（E2E）| 仕様11のテスト項目に対応 |
| ジョブ/キュー | まずは同期＋DBステータス管理、規模拡大時に **BullMQ/Redis** or ホスティングのCron | 段階配信・生成/スクショのレート制御 |

> **要確認（ユーザー判断が必要な事項）:** ホスティング先・決済プロバイダ・メール送受信プロバイダは費用と契約が伴うため、Phase 実装が該当領域に入る前に確定する。Phase1〜2 は上記が未確定でも進行可能（DB・取込・テンプレ）。

## 2. ディレクトリ構成（追加方式・既存収集資産は不可侵）

```
HP/
├─ WAM_NET_就労継続支援B型_収集/   ← 触らない（読み取り入力のみ）
├─ ひだまりワーク奈良の就労支援サイト.png ← design reference
├─ docs/                          ← 本計画・調査レポート
└─ app/                           ← 新規アプリ（Next.jsルート。以下すべて新規）
   ├─ prisma/schema.prisma
   ├─ src/app/                    (公開HP・事業所編集画面・管理画面・API)
   ├─ src/lib/                    (db, ai, mail, payments, screenshot, tokens)
   ├─ src/server/                 (import, generate, edit-engine, campaigns)
   ├─ scripts/                    (取込CLI 等)
   └─ tests/
```

## 3. データモデル（Prisma / 仕様4.準拠）

仕様4.の全テーブルを新規作成（既存DBが無いため重複はなし）。

- `facilities` — 事業所情報（`facilityNumber` unique、状態 enum、都道府県、情報取得元URL、最終確認日、各項目の「確認済みフラグ」）
- `facility_imports` — Excel/JSON取込履歴（ファイル名・件数・新規/重複/エラー内訳）
- `generated_sites` — 生成HP（`facilityId`、公開状態: draft/preview/published/static、公開URL slug）
- `site_versions` — 変更履歴（構造化データJSONのスナップショット、作成元: import/ai_email/ai_editor、restore可）
- `edit_requests` — AI編集指示（入力原文・抽出指示・構造化diff・検証結果・適用可否）
- `email_threads` — メール履歴（事業所別 replyToken、方向 in/out、messageId）
- `email_campaigns` — 営業メール（対象・段階・テスト送信フラグ・送信数）
- `trials` — 14日無料体験（開始/終了日時・状態）
- `subscriptions` — 月額契約（stripeSubscriptionId・状態・次回請求日）
- `payments` — 決済（種別 publish_5000/subscription・stripeEventId unique で冪等・状態）
- `lead_events` — 行動ログ（open/reply/edit/photo/card/publish/subscribe/cancel/resubscribe）
- `suppression_list` — 配信停止・受信拒否（横断・email unique）
- `audit_logs` — 重要操作履歴（誰が・何を・before/after）

補助: 事業所状態 enum（仕様5.）＝ imported / site_generated / email_sent / replied / free_edit_1..3 / card_registered / trialing / published / subscribed / canceled / resubscribed / suppressed / hot_lead。状態遷移は必ず `lead_events`＋`audit_logs` に記録。

**共通テンプレートと事業所データの分離（仕様 STEP6 の核）:** HPは「不可変の共通テンプレート（コンポーネント）」＋「事業所ごとの構造化データJSON（`site_versions.data`）」＋「許可されたレイアウト設定（ホワイトリスト）」の3層。AIは構造化データと許可設定のみ変更し、テンプレコードは書き換えない。

## 4. フェーズ計画（仕様10.準拠。各Phase末に動作確認）

### Phase 1 — 基盤・取込（今回着手）
- Next.js + TS + Prisma + Postgres スキャフォールド、`.env.example`、マイグレーション基盤
- スキーマ実装（上記全テーブル）
- **取込**: `results/<県>/<県>_emails.json`（および CSV/xlsx）を読み込み `facilities` へ upsert
- **重複判定**: 第一キー `facilityNumber`、補助キー 正規化(法人名+事業所名+電話+所在地+メール)。二重登録防止
- 状態管理（imported 初期状態）＋取込履歴＋事業所一覧（最小の管理API/CLI）
- テスト: 取込・重複・スキーマ

### Phase 2 — HP生成
- 共通テンプレート（design reference PNG 準拠、緑/オレンジ、セマンティックHTML・アクセシブル）
- 事業所別 生成（構造化データ→テンプレ描画）。**未確認情報は「要確認」or 非表示**、送迎/昼食/工賃/営業時間を根拠なく生成しない
- 非公開プレビュー（noindex・推測不可 slug）
- Playwright スクリーンショット生成

### Phase 3 — 営業メール・受信・3回無料編集
- 個別送信（CC/BCC禁止）・事業所別 Reply-To/識別トークン・配信停止リンク・テスト送信
- メール受信Webhook（署名検証）→ 事業所紐付け → 指示抽出 → AI構造化 → ホワイトリスト検証 → **下書きへ反映** → スクショ → 残回数付き自動返信（最大3回）

### Phase 4 — マジックリンク・AI編集画面
- 期限付きマジックリンク・事業所専用トークン
- 左AIチャット/右プレビュー、細/中/大の変更、ホワイトリスト、変更履歴・復元

### Phase 5 — カード登録・14日トライアル
- Stripe Checkout（カード自社非保存）・支払い0円/14日/終了日/次回請求日/解約の明示
- カウントダウン・自動課金・3日前/前日/当日通知・決済Webhook（署名・冪等）・解約/再契約

### Phase 6 — 正式公開（5,000円）
- 事前確認（名称・法人・所在地・電話・掲載内容・写真許可・問い合わせ・URL・規約・PP）
- 5,000円決済成功時のみ公開。**解約後も静的公開継続**（AI編集のみ停止）。独自ドメイン等は別プラン管理

### Phase 7 — 管理画面・スコアリング
- 都道府県別KPI（生成/送信/返信/編集/カード/公開/契約/解約/再契約/配信停止）
- 行動計測・本命スコア（返信・編集・カード・公開を重視、開封のみは除外）
- 都道府県別 段階配信（300→1,000→県単位）・エラー/決済失敗一覧

## 5. 横断的な必須要件（全Phase）
- セキュリティ（仕様9.）: トークン期限・推測不可・Webhook署名・サニタイズ・アップロード制限・ホワイトリスト・公開前確認・監査ログ・管理者権限・PII最小・カード非保存・事業所間分離
- メール安全設計（仕様8.）: 個別送信・配信停止・受信拒否横断停止・バウンス管理・SPF/DKIM/DMARC・段階増量・履歴保存・AI事実誤り防止・テスト送信
- コーディング規約（ユーザーグローバル規則）: 不変性・小さいファイル(<800行)・明示的エラー処理（握りつぶし禁止→管理画面へ記録）・境界バリデーション・秘密情報は環境変数

## 6. テスト計画（仕様11.）
取込正常/重複防止/事業所別生成/未確認情報の非事実表示/返信の正しい紐付け/3回超過不可/テンプレ非破壊/履歴復元/トライアル終了日計算/解約後非課金/Webhook冪等/5000円前は非公開/解約後も公開継続/解約後AI編集不可/再契約で再開/配信停止者へ非送信/他事業所編集不可。各Phaseで対応テストを追加し 80% 目標。

## 7. 進め方のルール（仕様12.）
既存（収集資産）を削除・改変しない／推測だけで実装しない／外部サービス追加前に構成確認／DB変更はマイグレーション／秘密はコード直書き禁止／Phaseごとに動作確認／エラーは管理画面へ記録／AI生成は公開前に人手確認。
