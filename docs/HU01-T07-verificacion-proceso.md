# HU01-T7 — Verificar que el Proceso Cumple con lo Demandado por el Programador

| Campo                        | Valor                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Historia de Usuario          | HU01 — Automatización del análisis del código                                                                      |
| Tarea                        | HU01-T7                                                                                                            |
| Responsable                  | Pablo García Gómez (PG)                                                                                            |
| Revisor asignado (matriz P4) | Alejandro Jesús Ortiz Zamora (AZ)                                                                                  |
| Dependencias                 | HU01-T5 (`ci-engine.js`), HU01-T6 (`authorship-report.js`), HU01-T1 (`phases.js`), HU01-T2 (`upload-processes.js`) |
| Contrato implementado        | [`src/pipeline/process-verifier.js`](../src/pipeline/process-verifier.js)                                          |
| Fachada del subsistema       | [`src/pipeline/index.js`](../src/pipeline/index.js)                                                                |
| Pruebas unitarias (TDD)      | [`tests/pipeline/process-verification.test.js`](../tests/pipeline/process-verification.test.js)                    |

## 1. Objetivo

Realizar la verificación y auditoría formal de extremo a extremo de la historia de usuario **HU01 ("Automatización del análisis del código")**, garantizando que el ciclo completo de integración continua, análisis de autoría y reporte satisface los 4 criterios de aceptación exigidos por el programador.

El módulo provee funciones de evaluación unitaria para cada criterio y una función consolidadora (`verifyProgrammerDemands`) que emite un dictamen auditable en Markdown.

## 2. Alcance

**Incluido**

- **Verificación Criterio 1 (`evaluateCriterion1_AutomaticTrigger`)**:
  - Valida que el análisis se dispara de forma automática y desatendida ante entregas o sincronización de commits en ramas protegidas (`develop` y `main`).
  - Rechaza disparadores manuales (`workflow_dispatch`) o eventos no catalogados en `TRIGGER_EVENTS`.
- **Verificación Criterio 2 (`evaluateCriterion2_UnattendedAuthorship`)**:
  - Comprueba que la extracción de metadatos (HU07-T2) y la clasificación de autoría (HU01-T3) se completan en memoria sin requerir pausas ni interacción humana interactiva.
- **Verificación Criterio 3 (`evaluateCriterion3_ExecutionTiming`)**:
  - Asegura que el flujo completo finaliza dentro de los límites de tiempo aceptables (presupuesto configurable, por defecto < 10 minutos).
- **Verificación Criterio 4 (`evaluateCriterion4_ClearNotification`)**:
  - Verifica que el sistema notifica el estado (vía comentario enriquecido de PR de HU01-T6 o commit status check) permitiendo al desarrollador saber si puede avanzar sin bloqueos o si requiere revisión.
- **Auditoría Global (`verifyProgrammerDemands`)**:
  - Emite el dictamen final (`SATISFIED`, `PARTIALLY_SATISFIED`, `NON_COMPLIANT`), porcentaje de conformidad y tabla resumen en Markdown.

**Excluido**

- Orquestación del motor de CI (cubierto en HU01-T5).
- Cálculo interno de metadatos o llamadas a la API de GitHub (cubierto en HU01-T3 y HU08).

## 3. Arquitectura de Verificación

```text
Informe del Motor de CI (ci-report.json / runLifecycle)
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ src/pipeline/process-verifier.js                            │
├─────────────────────────────────────────────────────────────┤
│ 1. evaluateCriterion1_AutomaticTrigger() ➔ Trigger válido  │
│ 2. evaluateCriterion2_UnattendedAuthorship() ➔ Desatendido │
│ 3. evaluateCriterion3_ExecutionTiming()   ➔ En tiempo      │
│ 4. evaluateCriterion4_ClearNotification() ➔ Notificación   │
└─────────────────────────────┬───────────────────────────────┘
                              │
                              ▼
        Dictamen Global: verifyProgrammerDemands()
  (100% Conformidad ➔ 🟢 CUMPLIMIENTO TOTAL DE HU01)
```

## 4. Matriz de Criterios de Aceptación Evaluados

| Criterio de Aceptación (HU01)                 | Función Verificadora                      |    Resultado    | Evidencia Técnica                                                                               |
| :-------------------------------------------- | :---------------------------------------- | :-------------: | :---------------------------------------------------------------------------------------------- |
| **1. Inicio automático al registrar entrega** | `evaluateCriterion1_AutomaticTrigger`     | ✅ **Superado** | Disparadores `pull_request` (`opened`, `synchronize`, `reopened`) y `push` activos en `ci.yml`. |
| **2. Evaluación de autoría sin intervención** | `evaluateCriterion2_UnattendedAuthorship` | ✅ **Superado** | Ejecución en memoria desatendida de `analyze-authorship` sin peticiones al usuario.             |
| **3. Ejecución dentro de límites de tiempo**  | `evaluateCriterion3_ExecutionTiming`      | ✅ **Superado** | Presupuesto máximo de 10 min cumplido con tiempos medios inferiores a 1 minuto.                 |
| **4. Notificación del estado para continuar** | `evaluateCriterion4_ClearNotification`    | ✅ **Superado** | Comentarios Markdown en PR e indicación explícita de `passed` o `review_required`.              |

## 5. Estimación y Tiempos (ClickUp)

| Actividad                      | Estimación (Planificación P4) |   Real    |                    Estado                    |
| :----------------------------- | :---------------------------: | :-------: | :------------------------------------------: |
| **Desarrollo**                 |             0,5 h             |   0,5 h   |                ✅ Completado                 |
| **Pruebas (TDD)**              |             1,0 h             |   1,0 h   | ✅ Completado (13 tests unitarios dedicados) |
| **Revisión (Alejandro Ortiz)** |             0,5 h             |     -     |         ⏳ Pendiente de Pull Request         |
| **Total**                      |           **2,0 h**           | **1,5 h** |      _(A falta de revisión por pares)_       |

## 6. Referencias

- [HU01-T01 — Diseño de Fases del Ciclo de Entrega](../docs/HU01-T01-diseno-fases.md)
- [HU01-T05 — Motor de Integración Continua](../docs/HU01-T05-motor-ci.md)
- [HU01-T06 — Selección y Reportes de Autoría](../docs/HU01-T06-seleccion-reportes-autoria.md)
- [`src/pipeline/process-verifier.js`](../src/pipeline/process-verifier.js)
- [`tests/pipeline/process-verification.test.js`](../tests/pipeline/process-verification.test.js)
