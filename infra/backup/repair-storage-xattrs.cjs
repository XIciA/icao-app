#!/usr/bin/env node

'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline');
const xattr = require('fs-xattr');

const mode = process.argv[2] || 'check';
const storageRoot = path.resolve(process.env.STORAGE_ROOT || '/var/lib/storage/stub/stub');
const cacheControlAttr = 'user.supabase.cache-control';
const contentTypeAttr = 'user.supabase.content-type';

if (!['apply', 'check'].includes(mode)) {
  console.error('Usage: repair-storage-xattrs.cjs [check|apply]');
  process.exit(2);
}

function resolveObjectPath(record) {
  for (const field of ['bucketId', 'name', 'version']) {
    if (typeof record[field] !== 'string' || record[field].length === 0) {
      throw new Error(`Invalid ${field} in storage object manifest.`);
    }
  }

  const candidate = path.resolve(storageRoot, record.bucketId, record.name, record.version);
  if (!candidate.startsWith(`${storageRoot}${path.sep}`)) {
    throw new Error('Storage object path escapes the configured root.');
  }
  return candidate;
}

async function readAttr(filePath, attribute) {
  try {
    return (await xattr.get(filePath, attribute)).toString();
  } catch (error) {
    if (error && ['ENODATA', 'ENOATTR'].includes(error.code)) {
      return undefined;
    }
    throw error;
  }
}

async function verifyOrRepair(record) {
  const filePath = resolveObjectPath(record);
  const stat = await fs.stat(filePath);
  const expectedSize = Number(record.size);
  if (!stat.isFile() || !Number.isSafeInteger(expectedSize) || stat.size !== expectedSize) {
    throw new Error('Storage object size does not match database metadata.');
  }

  const expectedCacheControl = record.cacheControl || 'no-cache';
  const expectedContentType = record.mimetype || 'application/octet-stream';
  let actualCacheControl = await readAttr(filePath, cacheControlAttr);
  let actualContentType = await readAttr(filePath, contentTypeAttr);
  const mismatched =
    actualCacheControl !== expectedCacheControl || actualContentType !== expectedContentType;

  if (mismatched && mode === 'apply') {
    await Promise.all([
      xattr.set(filePath, cacheControlAttr, expectedCacheControl),
      xattr.set(filePath, contentTypeAttr, expectedContentType),
    ]);
    actualCacheControl = await readAttr(filePath, cacheControlAttr);
    actualContentType = await readAttr(filePath, contentTypeAttr);
    if (actualCacheControl !== expectedCacheControl || actualContentType !== expectedContentType) {
      throw new Error('Storage object extended attributes failed post-write verification.');
    }
  }

  return mismatched;
}

async function main() {
  const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  let total = 0;
  let mismatched = 0;
  let failed = 0;

  for await (const line of input) {
    if (!line.trim()) continue;
    total += 1;
    try {
      if (await verifyOrRepair(JSON.parse(line))) {
        mismatched += 1;
      }
    } catch (error) {
      failed += 1;
      console.error(`Storage metadata repair failed at manifest row ${total}: ${error.message}`);
    }
  }

  console.log(`storage xattr ${mode}: total=${total} mismatched=${mismatched} failed=${failed}`);
  if (total === 0 || failed > 0 || (mode === 'check' && mismatched > 0)) {
    process.exitCode = 1;
  }
}

void main();
