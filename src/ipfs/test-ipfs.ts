/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { IpfsService } from './ipfs.service';
import { ConfigService } from '@nestjs/config';
import * as path from 'path';

async function test() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Por favor, informe o caminho do arquivo:');
    console.error(
      'Exemplo: node dist/src/ipfs/test-ipfs.js <caminho_do_arquivo>',
    );
    process.exit(1);
  }

  // O ConfigService lerá automaticamente as variáveis de ambiente
  // do processo (injetadas via flag --env-file do Node ou carregadas no sistema)
  const configService = new ConfigService();
  const service = new IpfsService(configService);
  const absolutePath = path.resolve(filePath);

  console.log(`\n📦 Enviando arquivo para o IPFS: ${absolutePath}`);

  try {
    const hash = await service.uploadFile(absolutePath);
    console.log('\n================ ENVIADO COM SUCESSO ================');
    console.log(`Hash IPFS: ${hash}`);
    console.log(`URL Pública: ${service.getPublicUrl(hash)}`);
    console.log('=====================================================\n');
  } catch (error: any) {
    console.error(
      '❌ Erro durante o upload para IPFS:',
      error.response?.data || error.message,
    );
  }
}

void test();
