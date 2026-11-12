# HU01-T2 — Identificar los procesos implicados en la subida

| Campo                 | Valor                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------- |
| Historia de Usuario   | HU01 — Automatización del análisis del código                                           |
| Tarea                 | HU01-T2                                                                                 |
| Responsable           | Ángel López Sánchez (AS)                                                                |
| Revisor asignado      | Jorge Torres Sánchez (JS)                                                               |
| Dependencias          | HU01-T1 — Diseño de las fases del desarrollo del código y la subida de cambios          |
| Contrato implementado | [`src/pipeline/upload-processes.js`](../src/pipeline/upload-processes.js)               |
| Pruebas               | [`tests/pipeline/upload-processes.test.js`](../tests/pipeline/upload-processes.test.js) |

## 1. Objetivo

Identificar y catalogar los procesos que intervienen cuando un desarrollador sube
su código al repositorio remoto y abre o actualiza una Pull Request. Esta tarea
complementa el contrato de fases de HU01-T1 aportando el **detalle de los
comandos Git, eventos de GitHub y acciones automáticas de CI** en las fases
`development`, `push` y `pull_request`.

## 2. Alcance

**Incluido**

- Identificación de comandos Git locales previos y durante la subida (`git add`, `git commit`, `git push`).
- Identificación de eventos de GitHub generados en la PR (`opened`, `synchronize`, `reopened`, `ready_for_review`, y `push` tras merge).
- Identificación de la acción automática de CI que desencadena el análisis.
- Validación de coherencia contra `TRIGGER_EVENTS` de T1.
- Funciones mínimas y necesarias de consulta para el motor de CI (`HU01-T5`).

**Excluido**

- Implementación del workflow o motor de integración continua (HU01-T5).
- Extracción y análisis de metadatos de autoría (HU01-T3 / HU07-T2).
- Notificación o publicación de resultados en la PR (HU08-T3).

## 3. Procesos identificados

### 3.1 Fase: `development` — Preparación local

| #   | Proceso      | Tipo          | Comando      | Obligatorio | Descripción                                                                                           |
| --- | ------------ | ------------- | ------------ | ----------- | ----------------------------------------------------------------------------------------------------- |
| 1   | `git-add`    | `git_command` | `git add`    | Sí          | Prepara los ficheros modificados en el staging area antes de confirmarlos.                            |
| 2   | `git-commit` | `git_command` | `git commit` | Sí          | Registra los cambios con metadatos de autoría (autor, fecha, mensaje y trailers como Co-authored-by). |

### 3.2 Fase: `push` — Publicación en remoto

| #   | Proceso             | Tipo           | Comando / Evento                  | Obligatorio | Descripción                                                           |
| --- | ------------------- | -------------- | --------------------------------- | ----------- | --------------------------------------------------------------------- |
| 3   | `git-push`          | `git_command`  | `git push origin <rama-de-tarea>` | Sí          | Publica la rama en `origin`, haciéndola disponible para revisión.     |
| 4   | `push-to-protected` | `github_event` | `push` a develop/main             | No          | Validación posterior tras un merge o integración en ramas protegidas. |

### 3.3 Fase: `pull_request` — Eventos de GitHub y trigger de CI

| #   | Proceso               | Tipo           | Evento                          | Obligatorio | Descripción                                                              |
| --- | --------------------- | -------------- | ------------------------------- | ----------- | ------------------------------------------------------------------------ |
| 5   | `pr-open`             | `github_event` | `pull_request.opened`           | Sí          | Se abre una nueva PR contra `develop`. Dispara el análisis por 1ª vez.   |
| 6   | `pr-synchronize`      | `github_event` | `pull_request.synchronize`      | No          | Nuevos commits subidos a la PR. Vuelve a disparar el análisis.           |
| 7   | `pr-reopen`           | `github_event` | `pull_request.reopened`         | No          | Reapertura de una PR previamente cerrada.                                |
| 8   | `pr-ready-for-review` | `github_event` | `pull_request.ready_for_review` | No          | Una PR en borrador pasa a lista para revisión.                           |
| 9   | `ci-trigger`          | `ci_action`    | _(disparado por 5-8)_           | Sí          | Workflow de CI (HU01-T5) que orquesta lint, tests y análisis automático. |

### 3.4 Diagrama de flujo

```text
┌────────────────────────────────────────┐
│ 1. development (local)                 │
│    ├── git add                         │
│    └── git commit (metadatos autoría)  │
└──────────────────┬─────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────┐
│ 2. push (remoto)                       │
│    └── git push origin <rama-tarea>    │
└──────────────────┬─────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────┐
│ 3. pull_request (GitHub)               │
│    ├── opened / synchronize / ...      │
│    └── ci-trigger ───▶ CI Pipeline     │
└──────────────────┬─────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────┐
│ 4. analysis (automático, HU01-T5)      │
└────────────────────────────────────────┘
```

## 4. Coherencia con el contrato de T1

La función `validateAgainstTriggerEvents()` comprueba en tiempo de ejecución que
los eventos de tipo `pull_request` catalogados en `UPLOAD_PROCESSES` coinciden
exactamente con `TRIGGER_EVENTS.pull_request` definidos en `src/pipeline/phases.js`.

> **Nota de alcance sobre `push-to-protected`**: La validación automatizada cubre los tipos de evento de Pull Request que disparan el análisis en la entrega. El proceso `push-to-protected` corresponde a la fase `push` posterior a la integración en ramas protegidas (`develop`/`main`) y se documenta en el catálogo sin subtipos asociados, por lo que queda fuera del alcance de `validateAgainstTriggerEvents()`.

## 5. Contrato con HU01-T5

HU01-T5 consumirá:

- `UPLOAD_PROCESSES` y `getProcessesByPhase()` para configurar y ordenar las etapas del workflow de CI.
- `getUploadSummary()` para disponer de una estructura agrupada por fases (`phase`, `processes`).
- `validateAgainstTriggerEvents()` para validación de triggers en los tests del motor de CI.

## 6. Estimación y tiempos

| Actividad  | Estimación | Real   |
| ---------- | ---------- | ------ |
| Desarrollo | 0,5 h      | 0,5 h  |
| Pruebas    | 0,25 h     | 0,25 h |
| Revisión   | 0,25 h     | -      |

## 7. Criterios de aceptación cubiertos

| Criterio de HU01                                                                | Cómo lo cubre T2                                                                  |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| El análisis se inicia automáticamente al registrar una entrega o actualización. | Cataloga los eventos disparadores (`pr-open`, `pr-synchronize`, `ci-trigger`).    |
| La herramienta evalúa cambios y metadatos sin intervención manual.              | Enlaza `git-commit` como fuente de metadatos y `ci-trigger` como acción autónoma. |

## 8. Referencias

- [HU01-T1 — Diseño de fases](./HU01-T01-diseno-fases.md)
- [README del proyecto](../README.md)
- [`src/pipeline/phases.js`](../src/pipeline/phases.js)
