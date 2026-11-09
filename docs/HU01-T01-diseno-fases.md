# HU01-T1 — Diseño de las fases del desarrollo del código y la subida de cambios

| Campo                         | Valor                                                               |
| ----------------------------- | ------------------------------------------------------------------- |
| Historia de Usuario           | HU01 — Automatización del análisis del código                       |
| Tarea                         | HU01-T1                                                             |
| Responsable                   | Jesús Cañete García (JG)                                            |
| Revisora asignada (matriz P4) | Candela Marco Jiménez (CJ)                                          |
| Dependencias                  | Ninguna (Fase 1 del Sprint 1)                                       |
| Contrato implementado         | [`src/pipeline/phases.js`](../src/pipeline/phases.js)               |
| Pruebas                       | [`tests/pipeline/phases.test.js`](../tests/pipeline/phases.test.js) |

## 1. Objetivo

Definir, antes de implementar el motor de integración continua (HU01-T5), las
fases que recorre un cambio desde que el desarrollador escribe código hasta que
se integra en `develop`, y el punto exacto en el que se dispara el análisis
automático de autoría y calidad.

El diseño se materializa en dos artefactos:

1. Este documento, que explica el flujo y las decisiones.
2. El módulo `src/pipeline/phases.js`, que expone las fases y los eventos como
   un contrato inmutable y testeado que consumirá HU01-T5.

## 2. Alcance

**Incluido**

- Fases del ciclo de entrega y su orden.
- Eventos de GitHub que disparan el análisis.
- Contratos de entrada/salida entre HU01-T1 y el resto de tareas de HU01.
- Permisos, límites de tiempo y criterios de aceptación cubiertos.

**Excluido**

- La implementación del workflow y del motor de CI (HU01-T5).
- La extracción de metadatos (HU01-T3 / HU07-T2).
- La clasificación de autoría (HU07-T3) y la publicación de resultados (HU08-T3).

## 3. Fases del ciclo de entrega

El contrato define siete fases consecutivas. Solo se permite avanzar a la fase
inmediatamente siguiente; cualquier salto se considera inválido.

| #   | Fase (`id`)    | Nombre                            | Automática | Qué ocurre                                                                                      |
| --- | -------------- | --------------------------------- | ---------- | ----------------------------------------------------------------------------------------------- |
| 1   | `development`  | Desarrollo local                  | No         | El desarrollador implementa el cambio en su rama de tarea y registra la autoría en los commits. |
| 2   | `push`         | Subida de la rama                 | No         | La rama se publica en `origin` y queda disponible para revisión e integración.                  |
| 3   | `pull_request` | Apertura o actualización de la PR | Sí         | Se abre o actualiza una PR contra `develop`. Este evento dispara el análisis.                   |
| 4   | `analysis`     | Análisis automático               | Sí         | La Action extrae metadatos, clasifica la autoría y evalúa la calidad sin intervención manual.   |
| 5   | `reporting`    | Publicación de resultados         | Sí         | Se publica el comentario en la PR y se actualiza el Status Check.                               |
| 6   | `review`       | Revisión por pares                | No         | El revisor asignado en la matriz P4 valida el cambio y deja constancia de la supervisión.       |
| 7   | `merge`        | Integración                       | No         | La PR se integra en `develop`; al cierre del sprint, `develop` pasa a `main`.                   |

La rama de tarea sigue la convención del README:

```text
HU01-T01-diseno-fases-desarrollo-subida-cambios
```

## 4. Eventos de GitHub que disparan el análisis

El análisis se dispara cuando el cambio llega a una Pull Request, no en cada
`push` intermedio. Así se evita gastar cuota de la API y minutos de CI en
commits que todavía no están listos para revisión.

```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened, ready_for_review]
    branches: [develop, main]
  push:
    branches: [develop, main]
```

- `opened`: primera apertura de la PR.
- `synchronize`: nuevos commits subidos a una PR ya abierta.
- `reopened`: reapertura de una PR cerrada.
- `ready_for_review`: una PR en borrador pasa a lista para revisión.
- `push` a `develop`/`main`: validación posterior a la integración.

## 5. Contratos con el resto de tareas

| Tarea   | Qué consume de este diseño                                                             | Qué aporta                                    |
| ------- | -------------------------------------------------------------------------------------- | --------------------------------------------- |
| HU01-T2 | Identifica los procesos implicados en la subida (`git push`, apertura de PR, eventos). | Detalle de los comandos y eventos implicados. |
| HU01-T3 | Sabe en qué fase debe ejecutarse la detección por metadatos.                           | Módulo de extracción de metadatos.            |
| HU01-T5 | Usa `DELIVERY_PHASES` y `TRIGGER_EVENTS` para construir el workflow.                   | Motor de CI que recorre las fases.            |
| HU01-T6 | Sabe cuándo y dónde publicar los reportes de autoría.                                  | Formato y contenido del reporte.              |
| HU01-T7 | Verifica que el flujo completo cumple lo demandado.                                    | Validación extremo a extremo.                 |

### Contrato de datos mínimo

El motor de CI producirá, al finalizar la fase `analysis`, un objeto con esta
forma (los campos concretos se cierran en HU01-T3 y HU07):

```json
{
  "delivery": {
    "repository": "owner/repo",
    "pullRequest": 42,
    "baseBranch": "develop",
    "headBranch": "HU01-T01-diseno-fases-desarrollo-subida-cambios",
    "commitSha": "abc1234"
  },
  "authorship": {
    "human": 0,
    "aiAssisted": 0,
    "unknown": 0
  },
  "quality": {
    "status": "passed",
    "issues": []
  },
  "phase": "reporting"
}
```

## 6. Permisos y seguridad

El workflow necesitará permisos mínimos:

```yaml
permissions:
  contents: read
  pull-requests: write
  checks: write
```

- El token se recibe por el input `github-token` de la Action, nunca se escribe
  en el repositorio ni en los logs.
- No se ejecutan comandos arbitrarios con contenido de la PR.
- Los artefactos de análisis se publican como comentario y como `metrics.json`.

## 7. Tiempos y límites

- `timeout-minutes: 10` para el job completo, alineado con el criterio de
  aceptación de HU01 sobre límites de tiempo aceptables.
- `concurrency` por PR para cancelar ejecuciones obsoletas (se detalla en
  HU12) y no consumir cuota de más.
- El análisis debe completarse sin bloquear al desarrollador: el Status Check
  queda en `pending` mientras corre y en `success`/`failure` al terminar.

## 8. Criterios de aceptación de HU01 cubiertos por este diseño

| Criterio de HU01                                                                | Cómo lo cubre T1                                               |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| El análisis se inicia automáticamente al registrar una entrega o actualización. | Eventos `pull_request` y `push` definidos en `TRIGGER_EVENTS`. |
| La herramienta evalúa cambios y metadatos sin intervención manual.              | Fase `analysis` marcada como automática.                       |
| La ejecución finaliza dentro de límites aceptables.                             | `timeout-minutes` y fase `reporting` acotada.                  |
| El sistema notifica el estado del análisis.                                     | Fase `reporting` con comentario y Status Check.                |

## 9. Riesgos y mitigaciones

| Riesgo                                                       | Mitigación                                                |
| ------------------------------------------------------------ | --------------------------------------------------------- |
| Disparar el análisis en cada `push` consume cuota y minutos. | Se dispara en eventos de PR, no en cada push intermedio.  |
| PRs en borrador generan ruido.                               | Se incluye `ready_for_review` y se puede filtrar `draft`. |
| Ejecuciones antiguas pisan el resultado de la última.        | `concurrency` por PR (HU12).                              |
| Cambios en el contrato rompen a T5.                          | Contrato inmutable y cubierto por tests.                  |

## 10. Referencias

- [README del proyecto](../README.md) — GitFlow, DoD y estructura.
- [Plantilla de PR](../.github/pull_request_template.md).
- ClickUp — HU01: Automatización del análisis del código y matriz P4.
