# 絆 HP サービス — アプリ (Phase 1)

就労継続支援B型事業所向け AIホームページ自動作成サービスの本体アプリ。
Next.js + PostgreSQL + Prisma。設計は `../docs/implementation-plan.md` を参照。

> WAM NET 収集資産（`../WAM_NET_就労継続支援B型_収集/`）は**読み取り専用の入力**。改変しない。

## Phase 1 でできること

- 全テーブルのDBスキーマ（`prisma/schema.prisma`）
- 収集済みデータ（JSON / CSV）の取込と**重複判定（二重登録防止）**
- 事業所一覧・都道府県別/ステータス別集計

## セットアップ

```bash
# 1. 依存インストール（済みなら不要）
npm install

# 2. 環境変数
cp .env.example .env   # 済み。必要に応じて値を編集

# 3. 開発用 Postgres を起動（要 Docker Desktop）
npm run db:up

# 4. スキーマをDBへ適用（初回マイグレーション作成）
npm run prisma:migrate -- --name init
```

> **Docker が無い場合**: Docker Desktop for Windows をインストールするか、
> Neon / Supabase 等のクラウド Postgres の接続文字列を `.env` の `DATABASE_URL` に設定してください。
> DBが用意できれば手順4以降はそのまま動きます。

## 取込（Excel/CSV/JSON → DB）

```bash
# 全47都道府県の収集済みデータをまとめて取込（メール付きJSON）
npm run import -- "../WAM_NET_就労継続支援B型_収集/results"

# 1県だけ
npm run import -- "../WAM_NET_就労継続支援B型_収集/results/奈良県/奈良県_emails.json"

# 全国オープンデータCSV（メール列なし）
npm run import -- "../WAM_NET_就労継続支援B型_収集/data/source_csv/csvdownload046.csv"
```

再取込しても**二重登録されません**（事業所番号／正規化複合キー／メールで既存判定）。

## 集計

```bash
npm run facilities:list   # 都道府県別・ステータス別の件数
```

## テスト

```bash
npm test
```

Phase 1 のテスト（正規化・重複判定・取込ソース読込）は DB 不要で実行できます。

## 実データでの検証結果（DB非依存パイプライン）

`results/` 全件（20,783行）に対し read→normalize→dedupe を実行:

| 指標 | 値 |
|------|----|
| 生レコード | 20,783 |
| 重複統合後(ユニーク) | 19,278 |
| 除去した重複 | 1,505 |
| メール取得済み | 16,189 |
| 都道府県判定 | 47/47 |

## ディレクトリ

```
app/
├─ prisma/schema.prisma          全テーブル定義
├─ src/lib/                       db(Prisma), prefectures
├─ src/server/import/             normalize / dedup / readSources / importFacilities
├─ src/server/facilities/         listFacilities（集計）
├─ scripts/                       import.ts / list-facilities.ts（CLI）
└─ tests/                         normalize / dedup / readSources
```
