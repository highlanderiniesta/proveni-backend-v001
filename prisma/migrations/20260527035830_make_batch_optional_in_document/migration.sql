-- DropForeignKey
ALTER TABLE "documents" DROP CONSTRAINT "documents_batchId_fkey";

-- AlterTable
ALTER TABLE "documents" ALTER COLUMN "batchId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
