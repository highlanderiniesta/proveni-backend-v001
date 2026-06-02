import { OcrService } from './ocr.service';
import * as path from 'path';

async function test() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Por favor, informe o caminho do arquivo:');
    console.error(
      'Exemplo: npx ts-node src/ocr/test-ocr.ts <caminho_do_arquivo>',
    );
    process.exit(1);
  }

  const service = new OcrService();
  const absolutePath = path.resolve(filePath);

  console.log(`\n📄 Carregando arquivo: ${absolutePath}`);

  try {
    const result = await service.extractTextFromAnyFile(absolutePath, '');
    console.log('\n================ TEXTO EXTRAÍDO ================');
    console.log(result || '(Nenhum texto extraído)');
    console.log('================================================\n');
  } catch (error) {
    console.error('❌ Erro durante o processamento do arquivo:', error);
  }
}

void test();
