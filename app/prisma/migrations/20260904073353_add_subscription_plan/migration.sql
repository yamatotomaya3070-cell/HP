-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('standard', 'pro');

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN     "plan" "SubscriptionPlan" NOT NULL DEFAULT 'standard';
