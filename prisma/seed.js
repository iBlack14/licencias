const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const file = path.join(__dirname, '..', 'data', 'records.json');
  if (!fs.existsSync(file)) return;
  const records = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const record of records) {
    if (!record.documentNumber) {
      console.warn('Registro omitido durante la importación: falta documentNumber.');
      continue;
    }
    const { updatedAt, ...data } = record;
    await prisma.driverRecord.upsert({
      where: { documentNumber: record.documentNumber },
      create: data,
      update: data
    });
  }
}

main().finally(() => prisma.$disconnect());

