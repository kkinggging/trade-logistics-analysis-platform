#!/usr/bin/env node

/**
 * 统一同步入口：依次抓取全部公开数据源。
 * 调度器只需要调用本文件；任一来源失败都会返回非零状态，
 * 各适配器采用临时文件 + 原子替换，因此不会用半成品覆盖最近成功数据。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withRetry, writeFileAtomic } from './retry.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const shouldBuild = process.argv.includes('--build');
const dataDir = path.join(here, '..', 'frontend', 'public', 'data');
const scheduleConfigFile = path.join(here, 'sync-schedule.json');
const lockFile = path.join(dataDir, '.sync-all.lock');
const tasks = [
  ['steel-dashboard-public', '市场看板', 'fetch-steel-dashboard.mjs', 'external_steel_dashboard.json'],
  ['steel-export-dashboard-public', '海关出口', 'fetch-steel-export-dashboard.mjs', 'external_steel_export.json'],
  ['forex-dashboard-public', '外汇看板', 'fetch-forex-dashboard.mjs', 'external_forex.json'],
  ['taric-quota-dashboard-public', 'EU/UK 关税配额', 'fetch-taric-quota.mjs', 'external_taric_quota.json'],
  ['shipping-index-dashboard-public', '航运指数', 'fetch-shipping-index-dashboard.mjs', 'external_shipping_indices.json'],
  ['trade-remedy-dashboard-public', '贸易救济案件', 'fetch-trade-remedy-dashboard.mjs', 'external_trade_remedy.json'],
  ['mysteel-fast-news', '我的钢铁快讯', 'fetch-mysteel-fast-news.mjs', 'external_fast_news.json'],
];

function runOnce(label, script) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(here, script)], { stdio: 'inherit' });
    child.on('error', (error) => { console.error(`[sync-all] ${label} 启动失败：${error.message}`); resolve(1); });
    child.on('exit', (code) => resolve(code || 0));
  });
}

async function run(label, script, retry) {
  try {
    await withRetry(async (attempt) => {
      if (attempt > 1) console.log(`[sync-all] ${label}进行第 ${attempt} 次任务重试`);
      const code = await runOnce(label, script);
      if (code !== 0) throw new Error(`子任务退出码 ${code}`);
    }, retry);
    return 0;
  } catch (error) {
    console.error(`[sync-all] ${label}失败，保留该来源最近一次成功文件：${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

function buildDemo() {
  return new Promise((resolve) => {
    const frontend = path.join(here, '..', 'frontend');
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const child = spawn(npm, ['run', 'build'], { cwd: frontend, stdio: 'inherit' });
    child.on('error', (error) => { console.error(`[sync-all] 成品构建启动失败：${error.message}`); resolve(1); });
    child.on('exit', (code) => { if (code !== 0) console.error('[sync-all] 成品构建失败，offline-demo 仍是上一版构建'); resolve(code || 0); });
  });
}

function latestQuote(quotes, includes) {
  return quotes.filter((quote) => quote.indicator_code?.includes(includes)).sort((a, b) => `${a.date}${a.publish_time}`.localeCompare(`${b.date}${b.publish_time}`)).at(-1);
}

async function appendBriefHistory() {
  try {
    const [quotes, risks, policies, exportSnapshot, forex, quota, syncStatus] = await Promise.all([
      fs.readFile(path.join(dataDir, 'market_quotes.json'), 'utf8').then(JSON.parse),
      fs.readFile(path.join(dataDir, 'risk_signals.json'), 'utf8').then(JSON.parse),
      fs.readFile(path.join(dataDir, 'policy_events.json'), 'utf8').then(JSON.parse),
      fs.readFile(path.join(dataDir, 'external_steel_export.json'), 'utf8').then(JSON.parse).catch(() => null),
      fs.readFile(path.join(dataDir, 'external_forex.json'), 'utf8').then(JSON.parse).catch(() => null),
      fs.readFile(path.join(dataDir, 'external_taric_quota.json'), 'utf8').then(JSON.parse).catch(() => null),
      fs.readFile(path.join(dataDir, 'data_sync_status.json'), 'utf8').then(JSON.parse).catch(() => null),
    ]);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const steel = latestQuote(quotes, 'STEEL_');
    const freight = latestQuote(quotes, 'FREIGHT');
    const activeRisks = risks.filter((risk) => risk.review_status !== 'dismissed' && risk.level !== 'normal').sort((a, b) => b.score - a.score).slice(0, 3);
    const eu = quota?.eu || quota?.latest;
    const top = exportSnapshot?.default_view?.partner?.[0];
    const actions = [];
    if (activeRisks.length) actions.push(`风险信号 ${activeRisks.length} 条：先完成人工核验，再推进相关订单动作。`);
    if (steel) actions.push(`钢价 ${Number(steel.value).toFixed(2)} ${steel.unit}：成交前复核成本与汇率，不套用固定加价比例。`);
    if (freight?.baseline && freight.value > freight.baseline) actions.push(`运费较基线 ${((freight.value / freight.baseline - 1) * 100).toFixed(1)}%：报价同步复核运费有效期与运输方案。`);
    if (forex?.risk) actions.push(`签约币种按 EUR/CNY 历史收益风险评分比较，最终按账期回测和客户接受度复核。`);
    if (eu?.summary?.remaining_pct != null) actions.push(`EU 配额剩余 ${Number(eu.summary.remaining_pct).toFixed(1)}%：报价前核验具体 Code 余额。`);
    if (top) actions.push(`出口伙伴 Top1 为 ${top.name || top.label}（${Number(top.qty_t).toLocaleString('zh-CN', { maximumFractionDigits: 0 })} 吨），新增市场先做客户与合规核验。`);
    const degraded = Object.values(syncStatus?.sources || {}).some((source) => source.state !== 'fresh');
    const summary = activeRisks.length ? `本期有 ${activeRisks.length} 条未关闭风险信号，销售动作以风险与合规闸门为先。${degraded ? '本期部分外部数据沿用上次成功快照，执行前复核来源状态。' : ''}` : `当前未发现未关闭的高优先级风险信号，销售动作按行情、成本、汇率和客户条件综合核定。${degraded ? '本期部分外部数据沿用上次成功快照，执行前复核来源状态。' : ''}`;
    const historyFile = path.join(dataDir, 'brief_history.json');
    let history = [];
    try { history = JSON.parse(await fs.readFile(historyFile, 'utf8')); } catch { history = []; }
    const entry = { date: today, generated_at: new Date().toISOString(), data_state: degraded ? 'partial' : 'fresh', summary, actions: actions.slice(0, 6), evidence: [steel && `${steel.indicator_name}: ${steel.value} ${steel.unit}`, freight && `${freight.indicator_name}: ${freight.value} ${freight.unit}`, top && `出口伙伴 Top1: ${top.name || top.label}`, eu && `EU剩余比例: ${eu.summary?.remaining_pct ?? '—'}%`].filter(Boolean) };
    history = [entry, ...history.filter((item) => item.date !== today)].slice(0, 90);
    await writeFileAtomic(historyFile, `${JSON.stringify(history, null, 2)}\n`);
    console.log(`[sync-all] 已归档晨报 ${today}`);
  } catch (error) {
    console.error(`[sync-all] 晨报归档失败：${error instanceof Error ? error.message : String(error)}`);
  }
}

const attemptedAt = new Date().toISOString();
const scheduleConfig = JSON.parse(await fs.readFile(scheduleConfigFile, 'utf8'));

async function acquireLock() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    const handle = await fs.open(lockFile, 'wx');
    await handle.writeFile(`${JSON.stringify({ pid: process.pid, started_at: attemptedAt })}\n`);
    await handle.close();
    return true;
  } catch (error) {
    if (error?.code === 'EEXIST') {
      const lockAge = Date.now() - (await fs.stat(lockFile).then((stat) => stat.mtimeMs).catch(() => Date.now()));
      if (lockAge > Number(scheduleConfig.lock_stale_after_ms || 12 * 60 * 60 * 1000)) {
        await fs.rm(lockFile, { force: true });
        console.warn(`[sync-all] 发现超过安全期限的遗留锁，已清理并重新尝试同步`);
        return acquireLock();
      }
      console.error(`[sync-all] 已有同步任务运行（${lockFile}），本次跳过，避免并发覆盖快照`);
      return false;
    }
    throw error;
  }
}

async function releaseLock() {
  await fs.rm(lockFile, { force: true }).catch(() => undefined);
}

let priorStatuses = {};
try {
  const prior = JSON.parse(await fs.readFile(path.join(dataDir, 'data_sync_status.json'), 'utf8'));
  priorStatuses = prior.sources || {};
} catch { priorStatuses = {}; }
const statuses = {};
for (const [sourceId, label, , file] of tasks) {
  try {
    const data = JSON.parse(await fs.readFile(path.join(dataDir, file), 'utf8'));
    const priorStatus = priorStatuses[sourceId];
    statuses[sourceId] = { source_id: sourceId, state: 'fallback', attempted_at: attemptedAt, success_at: priorStatus?.success_at || data.source?.captured_at || null, snapshot_captured_at: data.source?.captured_at || null, coverage_end: data.source?.coverage_end || null };
  } catch {
    statuses[sourceId] = { source_id: sourceId, state: 'unavailable', attempted_at: attemptedAt, success_at: null, snapshot_captured_at: null, coverage_end: null };
  }
}

async function persistStatus() {
  const statusFile = path.join(dataDir, 'data_sync_status.json');
  await writeFileAtomic(statusFile, `${JSON.stringify({ schema_version: '1.1', generated_at: new Date().toISOString(), schedule: scheduleConfig.schedule_label, scheduler: scheduleConfig.scheduler, sources: statuses }, null, 2)}\n`);
}

let failed = 0;
const locked = await acquireLock();
if (!locked) {
  process.exitCode = 2;
} else {
  try {
    await persistStatus();
    for (const [sourceId, label, script, file] of tasks) {
      const code = await run(label, script, scheduleConfig.task_retry);
      failed += code;
      if (code === 0) {
        try {
          const data = JSON.parse(await fs.readFile(path.join(dataDir, file), 'utf8'));
          statuses[sourceId] = { source_id: sourceId, state: 'fresh', attempted_at: attemptedAt, success_at: new Date().toISOString(), snapshot_captured_at: data.source?.captured_at || null, coverage_end: data.source?.coverage_end || null, retry: scheduleConfig.task_retry };
        } catch (error) {
          failed += 1;
          statuses[sourceId] = { ...statuses[sourceId], state: 'fallback', error: `抓取成功但快照不可读：${error instanceof Error ? error.message : String(error)}` };
        }
      } else if (statuses[sourceId].state !== 'unavailable') {
        statuses[sourceId] = { ...statuses[sourceId], error: '本次抓取失败，继续使用上一次成功快照' };
      } else {
        statuses[sourceId] = { ...statuses[sourceId], error: '本次抓取失败，当前没有可用历史快照' };
      }
      await persistStatus();
    }
    await appendBriefHistory();
    if (shouldBuild) failed += await buildDemo();
    if (failed) { console.error(`[sync-all] 完成但有 ${failed} 个来源或构建步骤失败；失败来源保留最近成功快照`); process.exitCode = 1; }
    else console.log(`[sync-all] 全部来源同步完成${shouldBuild ? '，成品包已刷新' : ''}`);
  } finally {
    await releaseLock();
  }
}
