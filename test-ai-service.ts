/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { AiService } from './src/ai/ai.service';
import * as fs from 'fs';
import * as path from 'path';

async function bootstrap() {
  console.log('Iniciando o contexto do NestJS...');
  // Cria a aplicação NestJS em modo de contexto (sem subir servidor HTTP)
  const app = await NestFactory.createApplicationContext(AppModule);

  // Obtém o serviço de IA do contexto
  const aiService = app.get(AiService);

  console.log('Serviço de IA instanciado com sucesso!');

  // Cria um arquivo temporário de teste
  const testFilePath = path.join(process.cwd(), 'temp_test_doc.txt');
  const dummyText = `
    NOTA FISCAL DE SERVIÇOS ELETRÔNICOS (NFS-e)
    Fornecedor: Distribuidora de Papéis Provini LTDA
    CNPJ: 99.888.777/0001-66

    Descrição dos Itens:
    - 50 pacotes de Papel Sulfite A4 Reciclado
    - Quantidade: 50.0
    - Unidade: un

    Informações Ambientais:
    - Pegada de Carbono Equivalente (CO2e) estimada pelo fabricante: 1.5 kg por unidade.
    - Total de CO2 emitido nesta remessa: 75.0 kg
  `;

  fs.writeFileSync(testFilePath, dummyText, 'utf-8');
  console.log(`Arquivo de teste temporário criado em: ${testFilePath}`);

  try {
    console.log('Chamando aiService.extractFromDocument...');
    const result = await aiService.extractFromDocument(
      '',
      testFilePath,
      'text/plain',
    );

    console.log('\n--- RESULTADO DA EXTRAÇÃO ---');
    console.log(JSON.stringify(result, null, 2));
    console.log('-----------------------------\n');
  } catch (error) {
    console.error('Erro durante o teste da IA:', error);
  } finally {
    // Remove o arquivo de teste temporário
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
      console.log('Arquivo temporário de teste removido.');
    }
    await app.close();
    console.log('Contexto do NestJS encerrado.');
  }
}

bootstrap();
