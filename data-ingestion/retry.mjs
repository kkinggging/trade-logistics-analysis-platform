#!/usr/bin/env node

/**
 * 抓取适配器共用的轻量可靠性工具。
 * 只使用 Node.js 内置能力：超时、指数退避、原子写入和可读错误信息。
 */
import fs from 'node:fs/promises';

const DEFAULTS = {
  attempts: 3,
  timeoutMs: 30_000,
  baseDelayMs: 800,
  maxDelayMs: 8_000,
};

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function asPositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function retryOptions(options = {}) {
  return {
    attempts: asPositiveInteger(options.attempts, DEFAULTS.attempts),
    timeoutMs: asPositiveInteger(options.timeoutMs, DEFAULTS.timeoutMs),
    baseDelayMs: asPositiveInteger(options.baseDelayMs, DEFAULTS.baseDelayMs),
    maxDelayMs: asPositiveInteger(options.maxDelayMs, DEFAULTS.maxDelayMs),
  };
}

function describeError(error) {
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') return '请求超时';
  return error instanceof Error ? error.message : String(error);
}

/**
 * 对一次异步操作执行有限次重试。操作本身应在失败时抛出异常。
 * 返回最后一次成功结果；全部失败时抛出带尝试次数的错误。
 */
export async function withRetry(operation, options = {}) {
  const resolved = retryOptions(options);
  let lastError;
  for (let attempt = 1; attempt <= resolved.attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt < resolved.attempts) {
        const delay = Math.min(resolved.maxDelayMs, resolved.baseDelayMs * 2 ** (attempt - 1));
        await sleep(delay);
      }
    }
  }
  const detail = describeError(lastError);
  throw new Error(`重试 ${resolved.attempts} 次后仍失败：${detail}`);
}

/**
 * 带超时和重试的 GET。响应体只在成功返回后由调用方读取，因此不会复用已消费的 Response。
 */
export async function fetchWithRetry(url, options = {}, retry = {}) {
  const resolved = retryOptions(retry);
  return withRetry(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), resolved.timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}：${response.statusText}`);
      return response;
    } finally {
      clearTimeout(timer);
    }
  }, resolved);
}

export async function writeFileAtomic(file, contents) {
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  try {
    await fs.writeFile(temporary, contents, 'utf8');
    await fs.rename(temporary, file);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

export function retrySummary(options = {}) {
  const resolved = retryOptions(options);
  return {
    attempts: resolved.attempts,
    timeout_ms: resolved.timeoutMs,
    backoff_ms: resolved.baseDelayMs,
    max_backoff_ms: resolved.maxDelayMs,
  };
}
