# HU01-T6 — Selección y Reportes de la Autoría

| Campo                        | Valor                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------- |
| Historia de Usuario          | HU01 — Automatización del análisis del código                                               |
| Tarea                        | HU01-T6                                                                                     |
| Responsable                  | Pablo García Gómez (PG)                                                                     |
| Revisor asignado (matriz P4) | Germán Peláez Gallardo (GG)                                                                 |
| Dependencias                 | HU01-T3 (`authorship-detector.js`), HU01-T1 (contrato de fases), HU08-T3 (`pr-notifier.js`) |
| Contrato implementado        | [`src/reporter/authorship-report.js`](../src/reporter/authorship-report.js)                 |
| Fachada del subsistema       | [`src/reporter/index.js`](../src/reporter/index.js)                                         |
| Pruebas unitarias (TDD)      | [`tests/authorship-report.test.js`](../tests/authorship-report.test.js)                     |

## 1. Objetivo

Implementar el subsistema de selección, agregación y generación de reportes de autoría del código. Este componente consume el resultado cuantitativo y cualitativo producido por el detector de procedencia de metadatos (HU01-T3) para:

1. Permitir la selección, filtrado y auditoría granular de aportaciones según su origen (`human`, `ai-assisted`, `unknown`), autor o regla aplicada.
2. Calcular desgloses agregados por cada colaborador individual.
3. Generar informes enriquecidos en formato Markdown estructurado, legibles para humanos y compatibles con la publicación en comentarios de Pull Requests (HU08-T3).
4. Emitir resúmenes concisos para logs de ejecución de GitHub Actions (`core.info`) y facilitar la verificación del flujo completo en HU01-T7.

## 2. Alcance

**Incluido**

- **Filtrado y selección (`filterContributions`)**: Selección de aportaciones por origen, autor (nombre/email insensible a mayúsculas) y reglas de auditoría de IA.
- **Métricas individuales por colaborador (`groupByAuthor`)**: Agrupación de aportaciones por desarrollador calculando commits totales, humanos, de IA y desconocidos, junto con líneas añadidas y porcentajes de asistencia.
- **Detección de alertas de auditoría (`getAuditAlerts`)**: Identificación automática de superación de umbrales tolerados de IA, aportaciones no verificadas (`UNKNOWN`) o código asistido dentro de norma.
- **Renderizado Markdown para Pull Requests (`formatMarkdownReport`)**:
  - Encabezado contextual (repositorio, número de PR, ramas de entrega).
  - Badge visual de dictamen (`🟢 APROBADO` vs `🟡 REVISIÓN REQUERIDA`).
  - Tabla cuantitativa comparativa (commits y líneas, porcentajes por origen).
  - Sección de contraste frente al umbral máximo tolerado (`thresholdAi`).
  - Tabla de desglose por colaborador individual.
  - Tabla detallada de aportaciones auditadas (SHA, autor, etiqueta de origen, regla activada y motivo).
  - Justificaciones explícitas del dictamen.
- **Resumen para consola y flujos CI (`formatConsoleSummary`)**: Cadena de una línea optimizada para los logs del runner.
- **Integración con publicación (`buildEnrichedReport`)**: Generación de objeto listo para `notifyPullRequest` con la marca de actualización `<!-- ai-authorship-report -->`.

**Excluido**

- Extracción de metadatos de Git de bajo nivel (cubierto en HU07-T2 / `metadata-parser.js`).
- Reglas de clasificación unitaria de procedencia (cubierto en HU07-T3 / `authorship-classifier.js`).
- Detección cuantitativa y agregación base (cubierto en HU01-T3 / `authorship-detector.js`).
- Realización de llamadas directas a la API REST de GitHub con Octokit (cubierto en HU08-T2/T3).

## 3. Arquitectura y Flujo de Trabajo

```text
Entrada: Objeto normalizado de detectAuthorship (HU01-T3)
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. Selección y Filtrado                                     │
│    filterContributions(contributions, criteria)             │
│    Permite aislar aportaciones por autor, origen o regla    │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Desglose y Agregación por Colaborador                    │
│    groupByAuthor(contributions)                             │
│    Calcula métricas individuales (% humano vs % IA)        │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Identificación de Alertas de Auditoría                   │
│    getAuditAlerts(analysisResult)                           │
│    Detecta umbrales excedidos y aportaciones UNKNOWN        │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Formateo y Renderizado de Reportes                       │
│    - formatMarkdownReport() ➔ Tabla completa para PR        │
│    - formatConsoleSummary() ➔ Resumen en una línea CI       │
│    - buildEnrichedReport()  ➔ Integración con pr-notifier   │
└─────────────────────────────────────────────────────────────┘
```

## 4. API Pública del Módulo

El archivo [`src/reporter/authorship-report.js`](../src/reporter/authorship-report.js) exporta las siguientes funciones:

### `filterContributions(contributions, criteria)`

Filtra una lista de aportaciones según criterios combinables:

```javascript
const aiOnly = filterContributions(contributions, { origin: 'ai-assisted' });
const byAuthor = filterContributions(contributions, { author: 'Pablo García' });
```

### `groupByAuthor(contributions)`

Devuelve un array con las métricas calculadas por cada colaborador:

```javascript
[
  {
    name: 'Pablo García',
    email: 'pablo@example.com',
    totalCommits: 2,
    humanCommits: 1,
    aiCommits: 1,
    unknownCommits: 0,
    totalLines: 160,
    humanLines: 120,
    aiLines: 40,
    aiPercentage: 50.0,
    humanPercentage: 50.0,
  },
];
```

### `formatMarkdownReport(analysisResult, options)`

Genera el informe enriquecido en Markdown. Si la entrega no tiene aportaciones, emite una nota limpia sin tablas vacías. Soporta opciones `{ includeDetails, includeAuthorBreakdown }`.

### `buildEnrichedReport(analysisResult, targetContext)`

Construye el payload completo para pasar a `notifyPullRequest`:

```javascript
const payload = buildEnrichedReport(result, {
  owner: 'Aocx2612',
  repo: 'Proyecto-GPS',
  pullNumber: 16,
});
// payload.body contiene el Markdown con <!-- ai-authorship-report -->
```

## 5. Integración con el resto del proyecto

| Tarea que interactúa | Relación con HU01-T6                                                                               |
| :------------------- | :------------------------------------------------------------------------------------------------- |
| **HU01-T1** (JG)     | Implementa la fase `reporting` del contrato de fases `DELIVERY_PHASES`.                            |
| **HU01-T3** (AS)     | Consume la estructura de salida de `detectAuthorship`.                                             |
| **HU08-T3** (JS)     | Suministra el cuerpo enriquecido (`report.body`) para `notifyPullRequest` en comentarios de PR.    |
| **HU01-T7** (PG)     | Utiliza los reportes generados para auditar que el sistema cumple con lo demandado por el usuario. |

## 6. Estimación y Tiempos (ClickUp)

| Actividad                    | Estimación (Planificación P4) |   Real    |                    Estado                    |
| :--------------------------- | :---------------------------: | :-------: | :------------------------------------------: |
| **Desarrollo**               |             1,5 h             |   1,5 h   |                ✅ Completado                 |
| **Pruebas (TDD)**            |             1,0 h             |   1,0 h   | ✅ Completado (24 tests unitarios dedicados) |
| **Revisión (Germán Peláez)** |             0,5 h             |     -     |         ⏳ Pendiente de Pull Request         |
| **Total**                    |           **3,0 h**           | **2,5 h** |      _(A falta de revisión por pares)_       |

## 7. Criterios de Aceptación Cubiertos

- [x] **Generación de reportes claros y comprensibles:** Tablas Markdown con resumen de aportaciones humanas vs IA y líneas de código.
- [x] **Auditoría granular:** Desglose por colaborador y listado explícito de commits con justificación de reglas activadas.
- [x] **Transparencia en umbrales:** Comparación visual entre el umbral tolerado y el porcentaje detectado.
- [x] **Compatibilidad y no duplicidad:** Inclusión de la marca invisible para actualizar comentarios existentes en Pull Requests.
- [x] **Cumplimiento estricto de estándares:** 100% pruebas unitarias pasando con Jest, linter ESLint sin fallos y formato Prettier.
