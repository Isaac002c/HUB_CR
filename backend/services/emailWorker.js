const emailService = require('./emailService');
const outboxModel = require('../models/emailOutboxModels');

let timer = null;
let running = false;

async function tick() {
  if (running) return [];
  running = true;
  try {
    await outboxModel.recoverStuck(Number(process.env.EMAIL_PROCESSING_TIMEOUT_MINUTES) || 10);
    return await emailService.processQueue(Number(process.env.EMAIL_BATCH_SIZE) || 10);
  } catch (error) {
    console.error('[email-worker]', String(error.message || error).replace(/[\r\n]/g, ' ').slice(0, 500));
    return [];
  } finally {
    running = false;
  }
}

function start() {
  if (timer || String(process.env.EMAIL_WORKER_ENABLED || 'true').toLowerCase() === 'false') return;
  const interval = Math.max(1000, Number(process.env.EMAIL_WORKER_INTERVAL_MS) || 10_000);
  timer = setInterval(tick, interval);
  timer.unref?.();
  setTimeout(tick, 250).unref?.();
  console.log(`[email-worker] ativo; intervalo=${interval}ms`);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { start, stop, tick };
