#!/usr/bin/env node

/**
 * 航运指数适配器离线回归测试：不访问网络、不修改仓库文件。
 * 覆盖 fixture 生成、CCFI/SCFI 环比补算，以及失败时保留旧输出。
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const adapter = path.join(here, 'fetch-shipping-index-dashboard.mjs');
const fixtureDir = path.join(here, 'fixtures', 'shipping-index');

function run(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [adapter, ...args], { cwd: here, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => resolve({ code: 1, stdout, stderr: `${stderr}${error.message}` }));
    child.on('exit', (code) => resolve({ code: code || 0, stdout, stderr }));
  });
}

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

async function main() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'shipping-index-test-'));
  try {
    const output = path.join(tempDir, 'external_shipping_indices.json');
    const success = await run(['--input-dir', fixtureDir, '--output', output]);
    assert.equal(success.code, 0, success.stderr || success.stdout);
    const generated = JSON.parse(await fs.readFile(output, 'utf8'));
    assert.equal(generated.schema_version, '1.1');
    assert.deepEqual(Object.keys(generated.series).sort(), ['BDI', 'BRENT', 'BSI', 'CCFI', 'NYMEX', 'SCFI']);
    assert.ok(Math.abs(generated.series.CCFI.latest.changeRatePct - (-1.3703599428249633)) < 1e-10);
    assert.ok(Math.abs(generated.series.SCFI.latest.changeRatePct - 1.6210464825169086) < 1e-10);
    for (const series of Object.values(generated.series)) {
      assert.equal(series.observationCount, series.points.length);
      assert.ok(series.points.every((point) => /^\d{4}-\d{2}-\d{2}$/.test(point.date) && Number.isFinite(point.value)));
    }

    const before = await fs.readFile(output);
    const beforeHash = sha256(before);
    const failed = await run(['--input-dir', path.join(tempDir, 'missing-input'), '--output', output]);
    assert.notEqual(failed.code, 0);
    const afterHash = sha256(await fs.readFile(output));
    assert.equal(afterHash, beforeHash, '失败抓取不得覆盖最近一次成功快照');
    console.log('[shipping-index-test] PASS：fixture 生成、环比补算、失败保留旧快照');
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(`[shipping-index-test] FAIL：${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
