// providers/provider.interface.ts
export interface AiExtractionResult {
  // Campos da nota fiscal
  invoiceNumber: string | null;
  nfNumber: string | null;
  productName: string | null;
  quantity: number | null;
  unit: string | null;
  co2Emitted: number | null;
  supplier: string | null;
  supplierCnpj: string | null;
  buyer: string | null;
  buyerCnpj: string | null;
  totalValue: number | null;
  issueDate: string | null;
  ncmCode: string | null;
  cfop: string | null;
  confidence: number;
  error?: string;
}

export interface IAiProvider {
  name: string;
  extractFromText(text: string): Promise<AiExtractionResult>;
}

/**
 * Prompt para extração de NOTA FISCAL
 */
export function getExtractionPrompt(text: string): string {
  return `Você é um especialista em extração de dados de NOTAS FISCAIS brasileiras (NF-e).

**EXEMPLO DE NOTA FISCAL:**
"NOTA FISCAL Nº 000555
SÉRIE: 1
EMITENTE: COMÉRCIO VAREJISTA EXEMPLO LTDA
CNPJ: 98.765.432/0001-00
DESTINATÁRIO: BONECOS BRASIL INDÚSTRIA LTDA
CNPJ: 12.345.678/0001-90
PRODUTO: Boneco Articulado Aventura
QUANTIDADE: 500
UNIDADE: UN
VALOR TOTAL: R$ 12.500,00
DATA: 10/10/2023
NCM: 9503.00.00
CFOP: 5102"

**SAÍDA ESPERADA PARA O EXEMPLO:**
{
  "invoiceNumber": "000555",
  "nfNumber": "000555",
  "productName": "Boneco Articulado Aventura",
  "quantity": 500,
  "unit": "UN",
  "co2Emitted": null,
  "supplier": "COMÉRCIO VAREJISTA EXEMPLO LTDA",
  "supplierCnpj": "98765432000100",
  "buyer": "BONECOS BRASIL INDÚSTRIA LTDA",
  "buyerCnpj": "12345678000190",
  "totalValue": 12500.00,
  "issueDate": "2023-10-10",
  "ncmCode": "95030000",
  "cfop": "5102",
  "confidence": 95
}

**AGORA EXTRAIA DA NOTA FISCAL REAL ABAIXO.**

**REGRAS IMPORTANTES:**
1. CNPJ: extraia apenas números, ignore pontos, barras e traços
2. Valores: converta para número (ex: "R$ 1.250,50" → 1250.50)
3. Data: converta para formato YYYY-MM-DD (ex: "10/10/2023" → "2023-10-10")
4. NCM: remova pontos (ex: "9503.00.00" → "95030000")
5. Quantidade: extraia apenas o número
6. Se um campo não for encontrado, use null

**TEXTO DA NOTA FISCAL:**
${text.substring(0, 15000)}

**RESPOSTA:** Retorne APENAS um JSON válido, sem explicações adicionais.`;
}
