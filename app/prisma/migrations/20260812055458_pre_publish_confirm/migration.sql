-- AlterTable
ALTER TABLE "generated_sites" ADD COLUMN     "pre_publish_confirm" JSONB,
ADD COLUMN     "pre_publish_confirmed_at" TIMESTAMP(3);
