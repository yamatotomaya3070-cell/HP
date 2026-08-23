-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "facility_id" TEXT,
    "content_type" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "media_assets_facility_id_idx" ON "media_assets"("facility_id");
