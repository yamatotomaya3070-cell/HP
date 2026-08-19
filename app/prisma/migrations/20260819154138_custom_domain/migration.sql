-- AlterTable
ALTER TABLE "generated_sites" ADD COLUMN     "custom_domain" TEXT,
ADD COLUMN     "domain_verified_at" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "generated_sites_custom_domain_key" ON "generated_sites"("custom_domain");

