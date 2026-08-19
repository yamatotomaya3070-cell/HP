-- CreateEnum
CREATE TYPE "FacilityStatus" AS ENUM ('imported', 'site_generated', 'email_sent', 'replied', 'free_edit_1', 'free_edit_2', 'free_edit_3', 'card_registered', 'trialing', 'published', 'subscribed', 'canceled', 'resubscribed', 'suppressed', 'hot_lead');

-- CreateEnum
CREATE TYPE "EmailCollectStatus" AS ENUM ('ok', 'no_email_listed', 'error', 'unknown');

-- CreateEnum
CREATE TYPE "SitePublishState" AS ENUM ('draft', 'preview', 'published', 'static');

-- CreateEnum
CREATE TYPE "SiteVersionOrigin" AS ENUM ('import', 'ai_email', 'ai_editor', 'manual', 'restore');

-- CreateEnum
CREATE TYPE "EditRequestChannel" AS ENUM ('email', 'editor');

-- CreateEnum
CREATE TYPE "EditRequestStatus" AS ENUM ('received', 'parsed', 'structured', 'validated', 'applied', 'rejected', 'failed');

-- CreateEnum
CREATE TYPE "EmailDirection" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "TrialState" AS ENUM ('active', 'converted', 'canceled', 'expired');

-- CreateEnum
CREATE TYPE "SubscriptionState" AS ENUM ('trialing', 'active', 'past_due', 'canceled');

-- CreateEnum
CREATE TYPE "PaymentKind" AS ENUM ('publish_5000', 'subscription');

-- CreateEnum
CREATE TYPE "PaymentState" AS ENUM ('pending', 'succeeded', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "LeadEventType" AS ENUM ('imported', 'site_generated', 'email_sent', 'email_opened', 'email_replied', 'ai_edit', 'photo_registered', 'info_updated', 'card_registered', 'published', 'subscribed', 'canceled', 'resubscribed', 'suppressed', 'status_changed');

-- CreateEnum
CREATE TYPE "SuppressionReason" AS ENUM ('unsubscribe', 'complaint', 'bounce', 'manual');

-- CreateTable
CREATE TABLE "facilities" (
    "id" TEXT NOT NULL,
    "facility_number" TEXT,
    "name" TEXT NOT NULL,
    "corp_name" TEXT,
    "address" TEXT,
    "prefecture" TEXT,
    "tel" TEXT,
    "fax" TEXT,
    "url" TEXT,
    "email" TEXT,
    "email_status" "EmailCollectStatus" NOT NULL DEFAULT 'unknown',
    "source_url" TEXT,
    "last_checked_at" TIMESTAMP(3),
    "dedup_key" TEXT NOT NULL,
    "status" "FacilityStatus" NOT NULL DEFAULT 'imported',
    "import_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facility_imports" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "prefecture" TEXT,
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "inserted_count" INTEGER NOT NULL DEFAULT 0,
    "updated_count" INTEGER NOT NULL DEFAULT 0,
    "skipped_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facility_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_sites" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "publish_state" "SitePublishState" NOT NULL DEFAULT 'draft',
    "current_version_id" TEXT,
    "screenshot_path" TEXT,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generated_sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_versions" (
    "id" TEXT NOT NULL,
    "site_id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "origin" "SiteVersionOrigin" NOT NULL DEFAULT 'import',
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "edit_requests" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "channel" "EditRequestChannel" NOT NULL,
    "raw_input" TEXT NOT NULL,
    "parsed" JSONB,
    "structured" JSONB,
    "status" "EditRequestStatus" NOT NULL DEFAULT 'received',
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "edit_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_threads" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "reply_token" TEXT NOT NULL,
    "direction" "EmailDirection" NOT NULL,
    "subject" TEXT,
    "body" TEXT,
    "message_id" TEXT,
    "campaign_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefecture" TEXT,
    "stage" INTEGER NOT NULL DEFAULT 0,
    "is_test" BOOLEAN NOT NULL DEFAULT false,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trials" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "state" "TrialState" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "stripe_customer_id" TEXT,
    "stripe_subscription_id" TEXT,
    "state" "SubscriptionState" NOT NULL DEFAULT 'trialing',
    "next_billing_at" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "kind" "PaymentKind" NOT NULL,
    "amount" INTEGER NOT NULL,
    "state" "PaymentState" NOT NULL DEFAULT 'pending',
    "stripe_event_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_events" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "type" "LeadEventType" NOT NULL,
    "meta" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppression_list" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "reason" "SuppressionReason" NOT NULL,
    "facility_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppression_list_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT,
    "action" TEXT NOT NULL,
    "actor" TEXT,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "facilities_dedup_key_idx" ON "facilities"("dedup_key");

-- CreateIndex
CREATE INDEX "facilities_prefecture_idx" ON "facilities"("prefecture");

-- CreateIndex
CREATE INDEX "facilities_status_idx" ON "facilities"("status");

-- CreateIndex
CREATE UNIQUE INDEX "facilities_facility_number_key" ON "facilities"("facility_number");

-- CreateIndex
CREATE UNIQUE INDEX "generated_sites_slug_key" ON "generated_sites"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "generated_sites_current_version_id_key" ON "generated_sites"("current_version_id");

-- CreateIndex
CREATE INDEX "generated_sites_facility_id_idx" ON "generated_sites"("facility_id");

-- CreateIndex
CREATE INDEX "site_versions_site_id_idx" ON "site_versions"("site_id");

-- CreateIndex
CREATE INDEX "site_versions_facility_id_idx" ON "site_versions"("facility_id");

-- CreateIndex
CREATE INDEX "edit_requests_facility_id_idx" ON "edit_requests"("facility_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_threads_reply_token_key" ON "email_threads"("reply_token");

-- CreateIndex
CREATE INDEX "email_threads_facility_id_idx" ON "email_threads"("facility_id");

-- CreateIndex
CREATE INDEX "trials_facility_id_idx" ON "trials"("facility_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_facility_id_key" ON "subscriptions"("facility_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_key" ON "subscriptions"("stripe_subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_stripe_event_id_key" ON "payments"("stripe_event_id");

-- CreateIndex
CREATE INDEX "payments_facility_id_idx" ON "payments"("facility_id");

-- CreateIndex
CREATE INDEX "lead_events_facility_id_idx" ON "lead_events"("facility_id");

-- CreateIndex
CREATE INDEX "lead_events_type_idx" ON "lead_events"("type");

-- CreateIndex
CREATE UNIQUE INDEX "suppression_list_email_key" ON "suppression_list"("email");

-- CreateIndex
CREATE INDEX "audit_logs_facility_id_idx" ON "audit_logs"("facility_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- AddForeignKey
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "facility_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_sites" ADD CONSTRAINT "generated_sites_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_sites" ADD CONSTRAINT "generated_sites_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "site_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_versions" ADD CONSTRAINT "site_versions_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "generated_sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_versions" ADD CONSTRAINT "site_versions_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "edit_requests" ADD CONSTRAINT "edit_requests_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_threads" ADD CONSTRAINT "email_threads_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "email_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trials" ADD CONSTRAINT "trials_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_events" ADD CONSTRAINT "lead_events_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
