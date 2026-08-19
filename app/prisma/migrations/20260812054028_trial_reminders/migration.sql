-- CreateEnum
CREATE TYPE "TrialReminderMilestone" AS ENUM ('d3', 'd1', 'd0');

-- CreateTable
CREATE TABLE "trial_reminders" (
    "id" TEXT NOT NULL,
    "trial_id" TEXT NOT NULL,
    "facility_id" TEXT NOT NULL,
    "milestone" "TrialReminderMilestone" NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trial_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trial_reminders_facility_id_idx" ON "trial_reminders"("facility_id");

-- CreateIndex
CREATE UNIQUE INDEX "trial_reminders_trial_id_milestone_key" ON "trial_reminders"("trial_id", "milestone");

-- AddForeignKey
ALTER TABLE "trial_reminders" ADD CONSTRAINT "trial_reminders_trial_id_fkey" FOREIGN KEY ("trial_id") REFERENCES "trials"("id") ON DELETE CASCADE ON UPDATE CASCADE;
