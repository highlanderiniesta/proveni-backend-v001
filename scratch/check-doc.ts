import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const docs = await prisma.document.findMany({
    orderBy: { createdAt: 'desc' },
    take: 1,
  });

  if (docs.length === 0) {
    console.log('Nenhum documento encontrado.');
    return;
  }

  const doc = docs[0];
  console.log('=== DOCUMENTO ===');
  console.log('ID:', doc.id);
  console.log('Nome:', doc.filename);
  console.log('Status:', doc.processingStatus);
  console.log('Extracted Data:', JSON.stringify(doc.extractedData, null, 2));

  await prisma.$disconnect();
}

main();
