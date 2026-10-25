const { PrismaClient } = require('@prisma/client');

const prisma = global.__licenciasPrisma || new PrismaClient();
if (process.env.NODE_ENV !== 'production') global.__licenciasPrisma = prisma;

const fields = {
  documentType: true,
  documentNumber: true,
  lastNames: true,
  firstNames: true,
  licenseClass: true,
  licenseNumber: true,
  licenseType: true,
  status: true,
  issuedAt: true,
  expiresAt: true,
  restrictions: true,
  issuer: true,
  points: true,
  source: true,
  updatedAt: true
};

function serialize(record) {
  return record ? { ...record, updatedAt: record.updatedAt.toISOString() } : null;
}

function data(record) {
  return {
    documentType: record.documentType,
    documentNumber: record.documentNumber,
    lastNames: record.lastNames,
    firstNames: record.firstNames,
    licenseClass: record.licenseClass,
    licenseNumber: record.licenseNumber,
    licenseType: record.licenseType,
    status: record.status,
    issuedAt: record.issuedAt,
    expiresAt: record.expiresAt,
    restrictions: record.restrictions,
    issuer: record.issuer,
    points: record.points,
    source: record.source
  };
}

async function listRecords() {
  return (await prisma.driverRecord.findMany({ select: fields, orderBy: { updatedAt: 'desc' } })).map(serialize);
}
async function findRecord(documentType, documentNumber) {
  return serialize(await prisma.driverRecord.findFirst({ where: { documentType, documentNumber }, select: fields }));
}
async function findByDocumentNumber(documentNumber) {
  return serialize(await prisma.driverRecord.findUnique({ where: { documentNumber }, select: fields }));
}
async function createRecord(record) {
  return serialize(await prisma.driverRecord.create({ data: data(record), select: fields }));
}
async function updateRecord(original, record) {
  return serialize(await prisma.driverRecord.update({ where: { documentNumber: original }, data: data(record), select: fields }));
}
async function deleteRecord(documentNumber) {
  await prisma.driverRecord.delete({ where: { documentNumber } });
}
async function upsertRecord(record) {
  const payload = data(record);
  return serialize(await prisma.driverRecord.upsert({ where: { documentNumber: record.documentNumber }, create: payload, update: payload, select: fields }));
}

module.exports = { prisma, listRecords, findRecord, findByDocumentNumber, createRecord, updateRecord, deleteRecord, upsertRecord };

