-- AlterEnum
ALTER TYPE "EditRequestChannel" ADD VALUE 'line';

-- CreateTable
CREATE TABLE "line_users" (
    "id" TEXT NOT NULL,
    "line_user_id" TEXT NOT NULL,
    "facility_id" TEXT,
    "step" TEXT NOT NULL DEFAULT 'start',
    "draft" JSONB,
    "display_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "line_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "line_users_line_user_id_key" ON "line_users"("line_user_id");

-- CreateIndex
CREATE INDEX "line_users_facility_id_idx" ON "line_users"("facility_id");

-- AddForeignKey
ALTER TABLE "line_users" ADD CONSTRAINT "line_users_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
