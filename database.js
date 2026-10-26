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

const fs = require('node:fs');
const path = require('node:path');
const RECORDS_FILE = path.join(__dirname, 'data', 'records.json');

function loadJsonRecords() {
  try {
    if (fs.existsSync(RECORDS_FILE)) return JSON.parse(fs.readFileSync(RECORDS_FILE, 'utf8') || '[]');
  } catch { /* ignore */ }
  return [];
}

function saveJsonRecords(records) {
  try {
    fs.mkdirSync(path.dirname(RECORDS_FILE), { recursive: true });
    fs.writeFileSync(RECORDS_FILE, JSON.stringify(records, null, 2), 'utf8');
  } catch { /* ignore */ }
}

async function listRecords() {
  try {
    return (await prisma.driverRecord.findMany({ select: fields, orderBy: { updatedAt: 'desc' } })).map(serialize);
  } catch (err) {
    return loadJsonRecords();
  }
}
async function findRecord(documentType, documentNumber) {
  try {
    return serialize(await prisma.driverRecord.findFirst({ where: { documentType, documentNumber }, select: fields }));
  } catch (err) {
    const list = loadJsonRecords();
    return list.find(r => r.documentType === documentType && r.documentNumber === documentNumber) || null;
  }
}
async function findByDocumentNumber(documentNumber) {
  try {
    return serialize(await prisma.driverRecord.findUnique({ where: { documentNumber }, select: fields }));
  } catch (err) {
    const list = loadJsonRecords();
    return list.find(r => r.documentNumber === documentNumber) || null;
  }
}
async function createRecord(record) {
  const payload = data(record);
  let saved = null;
  try {
    saved = serialize(await prisma.driverRecord.create({ data: payload, select: fields }));
  } catch (err) {
    saved = { ...payload, updatedAt: new Date().toISOString() };
  }
  const list = loadJsonRecords();
  list.unshift(saved);
  saveJsonRecords(list);
  return saved;
}
async function updateRecord(original, record) {
  const payload = data(record);
  let updated = null;
  try {
    updated = serialize(await prisma.driverRecord.update({ where: { documentNumber: original }, data: payload, select: fields }));
  } catch (err) {
    updated = { ...payload, updatedAt: new Date().toISOString() };
  }
  const list = loadJsonRecords().map(r => r.documentNumber === original ? updated : r);
  saveJsonRecords(list);
  return updated;
}
async function deleteRecord(documentNumber) {
  try {
    await prisma.driverRecord.delete({ where: { documentNumber } });
  } catch { /* ignore */ }
  const list = loadJsonRecords().filter(r => r.documentNumber !== documentNumber);
  saveJsonRecords(list);
}
async function upsertRecord(record) {
  const payload = data(record);
  let result = null;
  try {
    result = serialize(await prisma.driverRecord.upsert({ where: { documentNumber: record.documentNumber }, create: payload, update: payload, select: fields }));
  } catch (err) {
    result = { ...payload, updatedAt: new Date().toISOString() };
  }
  const list = loadJsonRecords().filter(r => r.documentNumber !== record.documentNumber);
  list.unshift(result);
  saveJsonRecords(list);
  return result;
}

async function listAdminUsers() {
  return prisma.adminUser.findMany({
    select: { id: true, username: true, displayName: true, role: true, createdAt: true },
    orderBy: { createdAt: 'desc' }
  });
}

async function findAdminUser(username) {
  return prisma.adminUser.findUnique({ where: { username } });
}

async function createAdminUser(user) {
  return prisma.adminUser.create({
    data: user,
    select: { id: true, username: true, displayName: true, role: true, createdAt: true }
  });
}

async function deleteAdminUser(id) {
  return prisma.adminUser.delete({ where: { id } });
}

module.exports = { prisma, listRecords, findRecord, findByDocumentNumber, createRecord, updateRecord, deleteRecord, upsertRecord, listAdminUsers, findAdminUser, createAdminUser, deleteAdminUser };
