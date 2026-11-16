# HU01-T5 — Motor de integración continua

| Campo                        | Valor                                                                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Historia de Usuario          | HU01 — Automatización del análisis del código                                                                                            |
| Tarea                        | HU01-T5                                                                                                                                  |
| Responsable                  | Jesús Cañete García (JG)                                                                                                                 |
| Revisor asignado (matriz P4) | Ángel López Sánchez (AS)                                                                                                                 |
| Dependencias                 | HU01-T1, HU01-T2, HU01-T3, HU01-T4, HU08-T3                                                                                              |
| Contrato implementado        | [`src/pipeline/ci-engine.js`](../src/pipeline/ci-engine.js)                                                                              |
| Punto de entrada CI          | [`src/pipeline/cli.js`](../src/pipeline/cli.js)                                                                                          |
| Fachada del pipeline         | [`src/pipeline/index.js`](../src/pipeline/index.js)                                                                                      |
| Pruebas                      | [`tests/pipeline/ci-engine.test.js`](../tests/pipeline/ci-engine.test.js), [`tests/pipeline/cli.test.js`](../tests/pipeline/cli.test.js) |
| Workflow                     | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)                                                                                |

## 1. Objetivo

Implementar el motor de integración continua que automatiza las tareas del ciclo
de vida del software definidas en HU01-T1 y catalogadas en HU01-T2. El motor
recorre las fases automáticas (`pull_request`, `analysis` y `reporting`),
ejecuta las tareas de cada fase, aísla los fallos para no dejar al desarrollador
sin notificación y deja un informe auditable (`ci-report.json`).

El diseño separa dos responsabilidades:

1. **Orquestación** (`ci-engine.js`): planifica fases, valida triggers, ejecuta
   handlers, aplica timeouts y agrega el resultado.
2. **Adaptadores** (`handlers` inyectados): conectan los subsistemas de autoría
   (HU01-T3), calidad (HU01-T4) y publicación (HU08-T3) con el orquestador. El
   motor no realiza llamadas de red por sí mismo.

## 2. Alcance

**Incluido**

- Plan de ejecución construido a partir de `DELIVERY_PHASES` y `TRIGGER_EVENTS`.
- Validación del evento de GitHub antes de ejecutar cualquier tarea.
- Comprobación de coherencia entre `UPLOAD_PROCESSES` y `TRIGGER_EVENTS`.
- Catálogo inmutable de tareas con fase, orden, bloqueo y timeout.
- Ejecución secuencial de las fases automáticas y de sus handlers.
- Aislamiento de fallos: un error bloqueante detiene su fase, pero `reporting`
  se intenta siempre.
- Presupuesto global de tiempo, timeout por tarea y cancelación por señal.
- Informe serializable con delivery, fases, tareas, autoría, calidad y resumen.
- CLI para GitHub Actions que escribe el informe y el job summary.
- Job `lifecycle` en el workflow y artefacto `ci-lifecycle-report`.

**Excluido**

- Implementación de la extracción de metadatos y del clasificador (HU01-T3).
- Implementación del análisis de calidad (HU01-T4).
- Renderizado y publicación del comentario en la PR (HU01-T6 / HU08-T3); el
  motor solo invoca el handler inyectado.
- Configuración de reglas de protección de ramas (HU05).

## 3. Arquitectura y flujo

```text
Evento de GitHub (pull_request / push)
   │
   ▼
src/pipeline/cli.js
   │  lee GITHUB_EVENT_PATH y el entorno
   ▼
buildLifecyclePlan()
   │  ├── TRIGGER_EVENTS: ¿el evento dispara el análisis?
   │  ├── UPLOAD_PROCESSES: ¿el catálogo es coherente?
   │  └── DELIVERY_PHASES: fases manuales omitidas, automáticas pendientes
   ▼
runLifecycle()
   │
   ├── pull_request  ─ verify-trigger → assemble-delivery
   ├── analysis      ─ analyze-authorship → analyze-quality
   └── reporting     ─ publish-report → publish-status
   │
   ▼
ci-report.json + job summary + Status Check del workflow
```

Cada handler recibe `{ delivery, plan, event, outputs, logger, signal }`. Los
resultados se acumulan en `outputs`, de modo que una tarea posterior puede
consumir el resultado de la anterior sin acoplar los módulos entre sí.

## 4. Catálogo de tareas

| #   | Tarea (`id`)         | Fase           | Bloqueante | Timeout | Responsabilidad                               |
| --- | -------------------- | -------------- | ---------- | ------- | --------------------------------------------- |
| 1   | `verify-trigger`     | `pull_request` | Sí         | 30 s    | Validar evento y coherencia del contrato.     |
| 2   | `assemble-delivery`  | `pull_request` | Sí         | 30 s    | Consolidar `delivery` (repo, PR, ramas, SHA). |
| 3   | `analyze-authorship` | `analysis`     | No         | 120 s   | Ejecutar HU01-T3 y adjuntar `authorship`.     |
| 4   | `analyze-quality`    | `analysis`     | Sí         | 120 s   | Ejecutar HU01-T4 y aplicar el Quality Gate.   |
| 5   | `publish-report`     | `reporting`    | No         | 60 s    | Publicar el comentario de resultados.         |
| 6   | `publish-status`     | `reporting`    | No         | 60 s    | Actualizar el Status Check de la entrega.     |

Reglas del catálogo:

- `blocking: true` significa que un fallo detiene las tareas restantes de esa
  fase y marca el pipeline como `failed`.
- `blocking: false` degrada el fallo a `warning`: se registra el error, se sigue
  con la fase y el resto de fases se ejecuta.
- Una tarea sin handler registrado queda `skipped`, nunca rompe el pipeline.
  Así el motor puede desplegarse antes de que todos los subsistemas estén
  conectados.

## 5. Planificación y disparadores

`buildLifecyclePlan()` acepta `eventName`, `eventAction`, `baseBranch` y
`headBranch`, y devuelve un plan con las siete fases del contrato:

- `development`, `push`, `review` y `merge` → `skipped` con motivo
  `Fase manual`.
- `pull_request`, `analysis` y `reporting` → `pending` con sus tareas.

Cada fase incluye además `processes`, la lista de procesos de subida que
HU01-T2 cataloga para ella (por ejemplo, `ci-trigger` en `pull_request`), de
modo que el informe permite cruzar las tareas del motor con el catálogo de
procesos.

El plan solo es válido si se cumplen tres condiciones:

1. El evento está en `TRIGGER_EVENTS`:

   | Evento         | Acciones aceptadas                                      | Ramas             |
   | -------------- | ------------------------------------------------------- | ----------------- |
   | `pull_request` | `opened`, `synchronize`, `reopened`, `ready_for_review` | `develop`, `main` |
   | `push`         | —                                                       | `develop`, `main` |

2. `validateAgainstTriggerEvents()` confirma que el catálogo de HU01-T2 no se ha
   desviado del contrato de HU01-T1.
3. Las fases automáticas son consecutivas según `isValidTransition()`.

Si el plan no es válido, el motor no invoca ningún handler, devuelve
`lifecycle.valid = false` con el motivo y el resumen queda en `skipped`. El CLI
sale con código `0` para no romper PRs cerrados o eventos no soportados.

## 6. Ejecución, estados y límites

### 6.1 Orden y aislamiento

Las fases se ejecutan en el orden del contrato. Dentro de una fase, las tareas
se ejecutan por `order`. Un fallo bloqueante marca la tarea como `failed`,
omite las tareas posteriores de esa fase con el motivo
`Una tarea bloqueante anterior falló` y continúa con la fase siguiente. Esto
garantiza que `reporting` se intenta incluso si el análisis falla.

### 6.2 Estados

| Estado    | Significado                                                               |
| --------- | ------------------------------------------------------------------------- |
| `pending` | Tarea o fase planificada y aún no ejecutada.                              |
| `passed`  | Handler completado correctamente.                                         |
| `warning` | Fallo en una tarea no bloqueante; el pipeline continúa.                   |
| `failed`  | Fallo en una tarea bloqueante o presupuesto global agotado.               |
| `skipped` | Fase manual, evento no permitido, handler ausente, cancelación o timeout. |

El estado global (`summary.status`) se calcula así: `failed` si hay alguna tarea
fallida o se agotó el presupuesto; `warning` si solo hay avisos; `passed` si al
menos una tarea terminó correctamente; `skipped` en caso contrario.

### 6.3 Tiempos y concurrencia

- Presupuesto global por defecto: **10 minutos** (`CI_TIMEOUT_MS`).
- Timeout por tarea: el del catálogo o `CI_TASK_TIMEOUT_MS` (2 minutos).
- El timeout efectivo de cada tarea es el mínimo entre su timeout y el tiempo
  restante del presupuesto.
- `lifecycle.timedOut` indica que se agotó el presupuesto global; el resto de
  tareas se omiten y el resultado es `failed`.
- `lifecycle.concurrencyGroup` expone la clave de concurrencia
  (`ci-<owner>-<repo>-pr-<número>` o `ci-<owner>-<repo>-<sha>`), que el workflow
  usa para cancelar ejecuciones obsoletas.

## 7. Contrato de salida

`runLifecycle()` devuelve un objeto serializable compatible con el contrato de
HU01-T1:

```json
{
  "delivery": {
    "repository": "equipo-uma/proyecto-gps",
    "pullRequest": 42,
    "baseBranch": "develop",
    "headBranch": "HU01-T05-motor-integracion-continua",
    "commitSha": "abc1234"
  },
  "phase": "reporting",
  "lifecycle": {
    "event": { "name": "pull_request", "action": "opened", "branch": "develop" },
    "valid": true,
    "reason": null,
    "contract": { "valid": true, "missingEvents": [], "extraEvents": [] },
    "transitions": { "valid": true, "invalid": [] },
    "concurrencyGroup": "ci-equipo-uma-proyecto-gps-pr-42",
    "startedAt": "2026-11-16T10:00:00.000Z",
    "timeoutMs": 600000,
    "taskTimeoutMs": 120000,
    "durationMs": 842,
    "timedOut": false,
    "aborted": false
  },
  "phases": [],
  "authorship": null,
  "quality": {
    "status": "skipped",
    "issues": [],
    "reasons": ["Análisis de calidad no ejecutado por el motor de CI."]
  },
  "summary": {
    "status": "passed",
    "tasks": { "total": 6, "passed": 2, "warning": 0, "failed": 0, "skipped": 4 },
    "phases": { "total": 7, "automated": 3, "executed": 3, "failed": 0, "skipped": 4 },
    "durationMs": 842
  }
}
```

`phases` conserva el detalle de cada fase y de cada tarea, incluyendo
`startedAt`, `finishedAt`, `durationMs`, `status`, `reason` y `error`. El informe
completo se publica como `ci-report.json`.

## 8. Integración en el workflow

El workflow `.github/workflows/ci.yml` mantiene los jobs existentes y añade el
gate del ciclo de vida:

| Job         | Fase del contrato | Qué ejecuta                                              |
| ----------- | ----------------- | -------------------------------------------------------- |
| `validate`  | `analysis`        | `npm ci`, ESLint y tests unitarios.                      |
| `quality`   | `analysis`        | Tests con cobertura, SonarCloud y `quality-report.json`. |
| `lifecycle` | `reporting`       | Motor de CI, validación de triggers y `ci-report.json`.  |

Características del workflow:

- `concurrency` por PR o rama con `cancel-in-progress: true`.
- `timeout-minutes: 10` en los tres jobs.
- El gate `lifecycle` se ejecuta después de `validate` y `quality`, y sigue
  funcionando aunque `quality` se omita en PRs de fork.
- El informe se publica como artefacto `ci-lifecycle-report`.
- El resumen se añade al **job summary** mediante `GITHUB_STEP_SUMMARY`.
- Permisos mínimos: `contents: read`, `pull-requests: write`, `checks: write`.

## 9. Integración con el resto de tareas

| Tarea   | Relación con el motor                                                     |
| ------- | ------------------------------------------------------------------------- |
| HU01-T1 | Aporta `DELIVERY_PHASES`, `TRIGGER_EVENTS` e `isValidTransition`.         |
| HU01-T2 | Aporta `UPLOAD_PROCESSES` y `validateAgainstTriggerEvents`.               |
| HU01-T3 | Se conecta como handler de `analyze-authorship` y devuelve `authorship`.  |
| HU01-T4 | Se conecta como handler de `analyze-quality` y devuelve `quality`.        |
| HU01-T6 | Consume el informe para generar el resumen Markdown de la entrega.        |
| HU08-T3 | Se conecta como handler de `publish-report` mediante `notifyPullRequest`. |
| HU08-T5 | Aporta los reintentos y el control de cuota de las publicaciones.         |

Ejemplo de conexión de handlers:

```js
const { LifecycleTask, createContractHandlers, runLifecycle } = require('./src/pipeline');
const { detectAuthorship } = require('./src/classifier');
const { analyzeQuality } = require('./src/quality');

const report = await runLifecycle({
  repository: 'equipo-uma/proyecto-gps',
  pullNumber: 42,
  headBranch: 'HU01-T05-motor-integracion-continua',
  handlers: {
    ...createContractHandlers(),
    [LifecycleTask.ANALYZE_AUTHORSHIP]: () => detectAuthorship({ commits, delivery }),
    [LifecycleTask.ANALYZE_QUALITY]: () => analyzeQuality({ enabled: true, token, projectKey }),
  },
});
```

## 10. Seguridad

- El motor no ejecuta comandos con contenido de la PR ni llama a la API por sí
  mismo: solo invoca handlers registrados explícitamente.
- Los tokens se reciben en el entorno o en los inputs de la Action y nunca se
  incluyen en el informe.
- Los mensajes de error se limitan a `message` y `code`; no se serializan stacks
  ni cabeceras de autenticación.
- Los permisos del job `lifecycle` se acotan a lectura de contenido y escritura
  de PRs/checks.
- El informe es un artefacto de solo lectura para auditoría.

## 11. Criterios de aceptación de HU01 cubiertos

| Criterio de HU01                                                                | Cómo lo cubre T5                                                                     |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| El análisis se inicia automáticamente al registrar una entrega o actualización. | `resolveTrigger()` valida los eventos de `TRIGGER_EVENTS` y el workflow los dispara. |
| La herramienta evalúa cambios y metadatos sin intervención manual.              | El motor ejecuta `analyze-authorship` y `analyze-quality` con handlers inyectados.   |
| La ejecución finaliza dentro de límites de tiempo aceptables.                   | Presupuesto global de 10 min, timeout por tarea y `timeout-minutes` en el job.       |
| El sistema notifica el estado del análisis.                                     | Fase `reporting`, job summary, artefacto y Status Check del workflow.                |

## 12. TDD y evidencias

Se escribieron primero las pruebas y después la implementación:

| Suite               | Qué cubre                                                                            |
| ------------------- | ------------------------------------------------------------------------------------ |
| `ci-engine.test.js` | Catálogo inmutable, plan, triggers, orden, fallos, timeouts, cancelación y handlers. |
| `cli.test.js`       | Contexto de GitHub, parseo, escritura del informe, códigos de salida y job summary.  |

Comandos de verificación:

```bash
npm test
npm run lint
node src/pipeline/cli.js
```

## 13. Reproducción local

El CLI puede ejecutarse sin GitHub Actions. Sin `GITHUB_EVENT_PATH` usa valores
por defecto (`pull_request.opened` contra `develop`):

```bash
GITHUB_REPOSITORY=equipo-uma/proyecto-gps \
GITHUB_EVENT_NAME=pull_request \
GITHUB_REF_NAME=HU01-T05-motor-integracion-continua \
GITHUB_SHA=abc1234 \
node src/pipeline/cli.js

cat ci-report.json
```

En PowerShell:

```powershell
$env:GITHUB_REPOSITORY = 'equipo-uma/proyecto-gps'
$env:GITHUB_EVENT_NAME = 'pull_request'
$env:GITHUB_REF_NAME = 'HU01-T05-motor-integracion-continua'
$env:GITHUB_SHA = 'abc1234'
node src/pipeline/cli.js
Get-Content ci-report.json
```

Variables admitidas: `GITHUB_EVENT_NAME`, `GITHUB_EVENT_PATH`,
`GITHUB_REPOSITORY`, `GITHUB_REF_NAME`, `GITHUB_HEAD_REF`, `GITHUB_BASE_REF`,
`GITHUB_SHA`, `CI_REPORT_PATH`, `CI_TIMEOUT_MS`, `CI_TASK_TIMEOUT_MS` y
`CI_ENGINE_FAIL_ON_ERROR`.

## 14. Modos de fallo

| Situación                                 | Resultado                                                         |
| ----------------------------------------- | ----------------------------------------------------------------- |
| Evento no contemplado o rama no permitida | Plan inválido, sin handlers, resumen `skipped`, CLI código `0`.   |
| Catálogo de procesos incoherente con T1   | Plan inválido con `missingEvents`/`extraEvents` en el informe.    |
| Handler de una tarea no bloqueante falla  | Tarea `warning`, pipeline continúa y resumen `warning`.           |
| Handler de una tarea bloqueante falla     | Tarea `failed`, resto de la fase omitido, `reporting` se intenta. |
| `reporting` falla                         | Tareas en `warning`/`failed`; el estado global refleja el fallo.  |
| Timeout por tarea                         | Tarea `warning`/`failed` con `code: TASK_TIMEOUT`.                |
| Presupuesto global agotado                | `timedOut: true`, tareas restantes omitidas y resumen `failed`.   |
| Handler ausente                           | Tarea `skipped` con motivo; no rompe el pipeline.                 |
| Señal de cancelación ya abortada          | Sin handlers, `aborted: true`, resumen `skipped`.                 |

## 15. Riesgos y mitigaciones

| Riesgo                                                | Mitigación                                                                   |
| ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| Un handler lento consume el presupuesto del job.      | Timeout por tarea y timeout efectivo acotado por el presupuesto global.      |
| Un fallo de análisis deja la PR sin notificación.     | `reporting` se ejecuta aunque `analysis` falle.                              |
| PRs de fork sin secretos.                             | El job `quality` se omite y el gate `lifecycle` sigue evaluando.             |
| Ejecuciones antiguas pisan el resultado de la última. | `concurrency` por PR/rama con `cancel-in-progress`.                          |
| El contrato de T1 cambia y rompe a T5.                | Plan inválido con motivo explícito y tests de coherencia con T2.             |
| Se publican informes duplicados en la PR.             | El handler de HU08-T3 reutiliza el marcador `<!-- ai-authorship-report -->`. |

## 16. Estimación (ClickUp)

| Actividad  | Estimación | Real  |
| ---------- | ---------- | ----- |
| Desarrollo | 2,0 h      | 2,0 h |
| Pruebas    | 1,5 h      | 1,5 h |
| Revisión   | 0,5 h      | -     |

## 17. Referencias

- [HU01-T1 — Diseño de fases](./HU01-T01-diseno-fases.md)
- [HU01-T2 — Procesos de subida](./HU01-T02-procesos-subida.md)
- [HU01-T3 — Detección de procedencia](./HU01-T03-deteccion-procedencia-metadatos.md)
- [HU01-T4 — Calidad con SonarCloud](./HU01-T04-sonarqube-calidad.md)
- [README del proyecto](../README.md)
- ClickUp — HU01-T5: Usar motor de integración continua para automatizar tareas
  relacionadas con el ciclo de vida de software.
