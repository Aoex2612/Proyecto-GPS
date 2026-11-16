/**
 * CLI del motor de integración continua (HU01 - T5)
 *
 * Responsable: Jesús Cañete García (JG)
 * Revisor asignado (matriz P4): Ángel López Sánchez (AS)
 *
 * Uso en el workflow:
 *   node src/pipeline/cli.js
 *
 * Variables de entorno:
 *   GITHUB_EVENT_NAME, GITHUB_EVENT_PATH, GITHUB_REPOSITORY, GITHUB_REF_NAME,
 *   GITHUB_HEAD_REF, GITHUB_BASE_REF, GITHUB_SHA, CI_REPORT_PATH,
 *   CI_TIMEOUT_MS, CI_TASK_TIMEOUT_MS, CI_ENGINE_FAIL_ON_ERROR.
 *
 * El CLI traduce el contexto de GitHub Actions al contrato del motor, ejecuta
 * las tareas de contrato y escribe `ci-report.json`. Los handlers de análisis y
 * publicación se inyectan desde el llamador, de modo que este punto de entrada
 * no realiza llamadas de red por sí mismo.
 */

const fs = require('fs/promises');
const path = require('path');
const { createGitHubClient } = require('../auth/github-client');
const { createAuthorshipHandler } = require('./authorship-handler');
const {
  LifecycleTask,
  buildLifecyclePlan,
  createContractHandlers,
  runLifecycle,
} = require('./ci-engine');

/**
 * Convierte un valor de entorno en número.
 * @param {*} value
 * @param {number|undefined} fallback
 * @returns {number|undefined}
 */
function parseNumber(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Convierte un valor de entorno en booleano.
 * @param {*} value
 * @param {boolean} fallback
 * @returns {boolean}
 */
function parseBoolean(value, fallback = true) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  return !['false', '0', 'no'].includes(String(value).toLowerCase());
}

/**
 * Lee el payload del evento de GitHub, si está disponible.
 * @param {object} env
 * @param {Function} readFileImpl
 * @returns {Promise<object|null>}
 */
async function loadEventPayload(env, readFileImpl) {
  if (!env.GITHUB_EVENT_PATH) {
    return null;
  }

  try {
    const raw = await readFileImpl(env.GITHUB_EVENT_PATH, 'utf8');
    const payload = JSON.parse(raw);
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

/**
 * Normaliza una referencia de rama eliminando el prefijo `refs/heads/`.
 * @param {*} value
 * @returns {string|null}
 */
function normalizeBranch(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return null;
  }
  return String(value)
    .trim()
    .replace(/^refs\/heads\//, '');
}

/**
 * Extrae del entorno y del payload los datos que necesita el motor.
 * @param {object} env
 * @param {object|null} payload
 * @returns {object}
 */
function resolveDeliveryContext(env = {}, payload = null) {
  const pullRequest = payload?.pull_request || null;
  const eventName =
    env.GITHUB_EVENT_NAME ||
    (pullRequest ? 'pull_request' : payload?.ref ? 'push' : 'pull_request');
  const eventAction =
    payload?.action || (eventName === 'push' ? 'push' : env.GITHUB_EVENT_ACTION || 'opened');

  const pushBranch =
    eventName === 'push' ? normalizeBranch(env.GITHUB_REF_NAME || payload?.ref) : null;
  const baseBranch =
    normalizeBranch(pullRequest?.base?.ref) ||
    normalizeBranch(env.GITHUB_BASE_REF) ||
    (eventName === 'push' ? pushBranch : null) ||
    'develop';
  const headBranch =
    normalizeBranch(pullRequest?.head?.ref) ||
    normalizeBranch(env.GITHUB_HEAD_REF) ||
    pushBranch ||
    null;

  const repository = env.GITHUB_REPOSITORY || payload?.repository?.full_name || null;

  let pullNumber = null;
  if (pullRequest?.number !== undefined && pullRequest?.number !== null) {
    pullNumber = Number(pullRequest.number);
  } else if (payload?.number !== undefined && payload?.number !== null) {
    pullNumber = Number(payload.number);
  } else if (env.GITHUB_EVENT_NUMBER) {
    pullNumber = Number(env.GITHUB_EVENT_NUMBER);
  }
  if (!Number.isFinite(pullNumber) || pullNumber <= 0) {
    pullNumber = null;
  }

  const commitSha = pullRequest?.head?.sha || payload?.after || env.GITHUB_SHA || null;

  return {
    eventName,
    eventAction,
    baseBranch,
    headBranch,
    repository,
    pullNumber,
    commitSha,
  };
}

/**
 * Construye el resumen en Markdown para el job summary de GitHub Actions.
 * @param {object} report
 * @returns {string}
 */
function buildSummaryMarkdown(report = {}) {
  const lifecycle = report.lifecycle || {};
  const summary = report.summary || {};
  const tasks = summary.tasks || {};
  const event = lifecycle.event || {};
  const authorship = report.authorship?.authorship;

  const rows = (report.phases || [])
    .filter((phase) => phase.automated || phase.status !== 'skipped')
    .map((phase) => `| \`${phase.id}\` | ${phase.status} | ${phase.tasks.length} |`)
    .join('\n');

  const lines = [
    '## Motor de integración continua (HU01-T5)',
    '',
    `- Evento: \`${event.name || 'desconocido'}.${event.action || '-'}\` → \`${
      event.branch || '-'
    }\``,
    `- Estado: **${summary.status || 'skipped'}**`,
    `- Tareas: ${tasks.passed || 0} correctas, ${tasks.warning || 0} con aviso, ${
      tasks.failed || 0
    } fallidas, ${tasks.skipped || 0} omitidas`,
    `- Duración: ${summary.durationMs ?? lifecycle.durationMs ?? 0} ms`,
    `- Grupo de concurrencia: \`${lifecycle.concurrencyGroup || '-'}\``,
  ];

  if (authorship && authorship.total > 0) {
    lines.push(
      `- Autoría: ${authorship.human} humanas, ${authorship.aiAssisted} asistidas por IA (` +
        `${authorship.percentage?.aiAssisted ?? 0}%), ${authorship.unknown} desconocidas → ` +
        `${report.authorship?.verdict?.status || 'sin veredicto'}`,
    );
  }

  lines.push(
    '',
    '| Fase | Estado | Tareas |',
    '| ---- | ------ | ------ |',
    rows || '| - | - | - |',
    '',
  );

  return lines.join('\n');
}

/**
 * Compone los handlers del motor: contrato + los inyectados por el llamador y,
 * opcionalmente, el análisis de autoría de HU01-T3 mediante la API de GitHub.
 *
 * @param {object} [options]
 * @param {object} [options.env]
 * @param {object} [options.handlers]
 * @param {Function} [options.createClient] - Fábrica de cliente inyectable.
 * @returns {object}
 */
function buildDefaultHandlers({ env = {}, handlers = {}, createClient = createGitHubClient } = {}) {
  const merged = { ...createContractHandlers(), ...handlers };

  if (merged[LifecycleTask.ANALYZE_AUTHORSHIP]) {
    return merged;
  }

  if (!parseBoolean(env.CI_ANALYZE_AUTHORSHIP, false)) {
    return merged;
  }

  if (!env.GITHUB_TOKEN) {
    merged[LifecycleTask.ANALYZE_AUTHORSHIP] = async () => {
      throw new Error('CI_ANALYZE_AUTHORSHIP está activo pero GITHUB_TOKEN no está configurado.');
    };
    return merged;
  }

  const client = createClient(env.GITHUB_TOKEN);
  merged[LifecycleTask.ANALYZE_AUTHORSHIP] = createAuthorshipHandler({
    client,
    thresholdAi: parseNumber(env.CI_AI_THRESHOLD, 50),
  });

  return merged;
}

/**
 * Ejecuta el motor y persiste el informe de la entrega.
 * @param {object} [options]
 * @param {object} [options.env]
 * @param {string} [options.cwd]
 * @param {object} [options.handlers]
 * @param {Function} [options.readFileImpl]
 * @param {Function} [options.writeFileImpl]
 * @param {Function} [options.appendFileImpl]
 * @param {Function} [options.createClient]
 * @param {Function} [options.now]
 * @returns {Promise<{report: object, plan: object, reportPath: string, exitCode: number, summaryMarkdown: string}>}
 */
async function runCli({
  env = process.env,
  cwd = process.cwd(),
  handlers = {},
  readFileImpl = fs.readFile,
  writeFileImpl = fs.writeFile,
  appendFileImpl = fs.appendFile,
  createClient,
  now,
} = {}) {
  const payload = await loadEventPayload(env, readFileImpl);
  const context = resolveDeliveryContext(env, payload);

  const plan = buildLifecyclePlan({
    eventName: context.eventName,
    eventAction: context.eventAction,
    baseBranch: context.baseBranch,
    headBranch: context.headBranch,
  });

  const report = await runLifecycle({
    ...context,
    plan,
    handlers: buildDefaultHandlers({
      env,
      handlers,
      createClient: createClient || createGitHubClient,
    }),
    timeoutMs: parseNumber(env.CI_TIMEOUT_MS, undefined),
    taskTimeoutMs: parseNumber(env.CI_TASK_TIMEOUT_MS, undefined),
    now,
  });

  const reportPath = path.resolve(cwd, env.CI_REPORT_PATH || 'ci-report.json');
  const summaryMarkdown = buildSummaryMarkdown(report);

  await writeFileImpl(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  if (env.GITHUB_STEP_SUMMARY) {
    await appendFileImpl(env.GITHUB_STEP_SUMMARY, `${summaryMarkdown}\n`, 'utf8');
  }

  const failOnError = parseBoolean(env.CI_ENGINE_FAIL_ON_ERROR, true);
  const exitCode = report.summary.status === 'failed' && failOnError ? 1 : 0;

  return { report, plan, reportPath, exitCode, summaryMarkdown };
}

/**
 * Punto de entrada del CLI.
 */
async function main() {
  try {
    const { report, reportPath, exitCode } = await runCli();
    // eslint-disable-next-line no-console
    console.log(
      `[ci] Estado: ${report.summary.status} | fases: ${report.summary.phases.executed}/${
        report.summary.phases.automated
      } | tareas: ${report.summary.tasks.total} (${reportPath})`,
    );
    if (report.lifecycle.reason) {
      // eslint-disable-next-line no-console
      console.log(`[ci] Motivo: ${report.lifecycle.reason}`);
    }
    process.exitCode = exitCode;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`[ci] Error: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  void main();
}

module.exports = {
  buildDefaultHandlers,
  buildSummaryMarkdown,
  loadEventPayload,
  parseBoolean,
  parseNumber,
  resolveDeliveryContext,
  runCli,
};
