// prisma/seed-clean-users-only.ts
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Iniciando seed LIMPO - Apenas usuários...');
  console.log('='.repeat(60));

  // ============================================================
  // 1. LIMPAR TODOS OS DADOS RELACIONADOS
  // ============================================================
  console.log('\n🗑️ Removendo todos os dados existentes...');

  // Ordem correta para evitar violação de chaves estrangeiras
  await prisma.syncLog.deleteMany();
  await prisma.dashboardView.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.metric.deleteMany();
  await prisma.batchSupplier.deleteMany();
  await prisma.document.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.companySupplier.deleteMany();
  await prisma.user.deleteMany();
  await prisma.company.deleteMany();
  await prisma.complianceRule.deleteMany();

  console.log('  ✅ Todos os dados removidos com sucesso');

  // ============================================================
  // 2. CRIAR EMPRESAS MÍNIMAS (opcional - para usuários que precisam)
  // ============================================================
  console.log('\n🏢 Criando empresas base...');

  // Empresa para MANAGER/CLIENT
  const clientCompany = await prisma.company.create({
    data: {
      name: 'Empresa Cliente Exemplo',
      cnpj: '12.345.678/0001-90',
      email: 'contato@cliente.com.br',
      phone: '(11) 99999-8888',
      companyType: 'CLIENT',
      plan: 'PROFESSIONAL',
      status: 'ACTIVE',
    },
  });

  // Empresa para PROVENI (Operadora)
  const proveniCompany = await prisma.company.create({
    data: {
      name: 'PROVENI Tecnologia',
      cnpj: '00.000.000/0001-00',
      email: 'operacoes@proveni.com',
      phone: '(11) 99999-7777',
      companyType: 'CLIENT',
      plan: 'ENTERPRISE',
      status: 'ACTIVE',
    },
  });

  // Empresa para SUPPLIER (Fornecedor padrão)
  const supplierCompany = await prisma.company.create({
    data: {
      name: 'Fornecedor Exemplo Ltda',
      cnpj: '98.765.432/0001-10',
      email: 'vendas@fornecedor.com.br',
      phone: '(11) 88888-7777',
      companyType: 'SUPPLIER',
      plan: 'BASIC',
      status: 'ACTIVE',
    },
  });

  console.log(`  ✅ Empresa Cliente: ${clientCompany.name}`);
  console.log(`  ✅ Empresa PROVENI: ${proveniCompany.name}`);
  console.log(`  ✅ Empresa Fornecedor: ${supplierCompany.name}`);

  // ============================================================
  // 3. CRIAR USUÁRIOS
  // ============================================================
  console.log('\n👤 Criando usuários...');

  const hashedPassword = await bcrypt.hash('123456', 10);

  // Usuários por empresa
  const users = [
    // ADMIN (PROVENI)
    {
      name: 'Admin Master',
      email: 'admin@proveni.com',
      role: Role.ADMIN,
      companyId: proveniCompany.id,
    },
    {
      name: 'Admin Suporte',
      email: 'suporte@proveni.com',
      role: Role.ADMIN,
      companyId: proveniCompany.id,
    },

    // SPECIALIST (PROVENI)
    {
      name: 'Dr. Ricardo Mendes',
      email: 'ricardo@proveni.com',
      role: Role.SPECIALIST,
      companyId: proveniCompany.id,
    },
    {
      name: 'Dra. Patrícia Lima',
      email: 'patricia@proveni.com',
      role: Role.SPECIALIST,
      companyId: proveniCompany.id,
    },

    // OPERATOR (PROVENI)
    {
      name: 'Ana Ferreira',
      email: 'ana@proveni.com',
      role: Role.OPERATOR,
      companyId: proveniCompany.id,
    },
    {
      name: 'Lucas Mendes',
      email: 'lucas@proveni.com',
      role: Role.OPERATOR,
      companyId: proveniCompany.id,
    },
    {
      name: 'Carla Souza',
      email: 'carla@proveni.com',
      role: Role.OPERATOR,
      companyId: proveniCompany.id,
    },

    // MANAGER (Cliente)
    {
      name: 'Carlos Silva',
      email: 'carlos@cliente.com.br',
      role: Role.MANAGER,
      companyId: clientCompany.id,
    },
    {
      name: 'Marina Oliveira',
      email: 'marina@cliente.com.br',
      role: Role.MANAGER,
      companyId: clientCompany.id,
    },
    {
      name: 'Roberto Almeida',
      email: 'roberto@cliente.com.br',
      role: Role.MANAGER,
      companyId: clientCompany.id,
    },

    // SUPPLIER (Fornecedor)
    {
      name: 'João Souza',
      email: 'joao@fornecedor.com.br',
      role: Role.SUPPLIER,
      companyId: supplierCompany.id,
    },
    {
      name: 'Maria Santos',
      email: 'maria@fornecedor.com.br',
      role: Role.SUPPLIER,
      companyId: supplierCompany.id,
    },
    {
      name: 'Pedro Oliveira',
      email: 'pedro@fornecedor.com.br',
      role: Role.SUPPLIER,
      companyId: supplierCompany.id,
    },
    {
      name: 'Ana Costa',
      email: 'ana@fornecedor.com.br',
      role: Role.SUPPLIER,
      companyId: supplierCompany.id,
    },
    {
      name: 'Rafael Lima',
      email: 'rafael@fornecedor.com.br',
      role: Role.SUPPLIER,
      companyId: supplierCompany.id,
    },
  ];

  for (const user of users) {
    await prisma.user.create({
      data: {
        name: user.name,
        email: user.email,
        passwordHash: hashedPassword,
        role: user.role,
        companyId: user.companyId,
        isActive: true,
      },
    });
    console.log(`  ✅ ${user.role}: ${user.name} - ${user.email}`);
  }

  // ============================================================
  // 4. CRIAR RELAÇÕES ENTRE EMPRESAS (para testes)
  // ============================================================
  console.log('\n🔗 Criando relações entre empresas...');

  await prisma.companySupplier.createMany({
    data: [
      {
        companyId: clientCompany.id,
        supplierId: supplierCompany.id,
        status: 'ACTIVE',
        invitedAt: new Date(),
        acceptedAt: new Date(),
      },
    ],
  });
  console.log('  ✅ Fornecedor vinculado ao cliente');

  // ============================================================
  // 5. RESUMO FINAL
  // ============================================================
  console.log('\n' + '='.repeat(60));
  console.log('📊 RESUMO DA EXECUÇÃO:');
  console.log('='.repeat(60));
  console.log(`🏢 Empresas: ${await prisma.company.count()}`);
  console.log(`👤 Usuários: ${await prisma.user.count()}`);
  console.log(`🔗 Relações empresa-fornecedor: ${await prisma.companySupplier.count()}`);
  console.log(`📄 Documentos: ${await prisma.document.count()}`);
  console.log(`📦 Lotes: ${await prisma.batch.count()}`);
  console.log('='.repeat(60));

  // Listar usuários por role
  console.log('\n📋 USUÁRIOS POR PERFIL:');
  console.log('='.repeat(60));

  const admins = await prisma.user.findMany({ where: { role: Role.ADMIN } });
  console.log(`\n👑 ADMIN (${admins.length}):`);
  admins.forEach(u => console.log(`   - ${u.email} / 123456`));

  const specialists = await prisma.user.findMany({ where: { role: Role.SPECIALIST } });
  console.log(`\n🔬 SPECIALIST (${specialists.length}):`);
  specialists.forEach(u => console.log(`   - ${u.email} / 123456`));

  const operators = await prisma.user.findMany({ where: { role: Role.OPERATOR } });
  console.log(`\n⚙️ OPERATOR (${operators.length}):`);
  operators.forEach(u => console.log(`   - ${u.email} / 123456`));

  const managers = await prisma.user.findMany({ where: { role: Role.MANAGER } });
  console.log(`\n👔 MANAGER (${managers.length}):`);
  managers.forEach(u => console.log(`   - ${u.email} / 123456`));

  const suppliers = await prisma.user.findMany({ where: { role: Role.SUPPLIER } });
  console.log(`\n🏭 SUPPLIER (${suppliers.length}):`);
  suppliers.forEach(u => console.log(`   - ${u.email} / 123456`));

  console.log('\n' + '='.repeat(60));
  console.log('✅ Seed LIMPO concluído com sucesso!');
  console.log('📌 Banco de dados está vazio (apenas usuários e empresas base)');
  console.log('='.repeat(60));
}

main()
  .catch((e) => {
    console.error('❌ Erro durante o seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
