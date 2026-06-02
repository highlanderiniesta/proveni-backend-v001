import { ethers } from 'ethers';

async function test() {
  const provider = new ethers.JsonRpcProvider(
    'https://sepolia.infura.io/v3/91063da68ccd4424854febd5fe397a14',
  );

  try {
    const network = await provider.getNetwork();
    console.log('✅ Rede:', network.name);
    console.log('Chain ID:', Number(network.chainId));

    const block = await provider.getBlockNumber();
    console.log('Block atual:', block);

    // Testar contrato
    const contractAddress = '0x788b4253a7a4Af41cCfD05EEf7089752EC29f028';
    const code = await provider.getCode(contractAddress);
    console.log('Contrato existe?', code !== '0x');

    if (code !== '0x') {
      console.log('✅ Contrato encontrado!');
    } else {
      console.log('❌ Contrato não encontrado no endereço especificado');
    }
  } catch (error: any) {
    console.error('❌ Erro:', error.message);
  }
}

test();
