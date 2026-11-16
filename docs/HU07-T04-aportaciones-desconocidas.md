# HU07-T4 — Marcar como desconocidas las aportaciones no identificables

| Campo                        | Valor                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| Historia de Usuario          | HU07 — Determinación fiable del origen del trabajo                                  |
| Tarea                        | HU07-T4                                                                             |
| Responsable                  | Alejandro Jesús Ortiz Zamora (AZ)                                                   |
| Revisor asignado (matriz P4) | Jorge Torres Sánchez (JS)                                                           |
| Dependencias                 | HU07-T1 (criterios de autoría), HU07-T3 (`authorship-classifier.js`)                |
| Implementación               | [`src/classifier/unknown-review.js`](../src/classifier/unknown-review.js)           |
| Integración                  | [`src/classifier/authorship-detector.js`](../src/classifier/authorship-detector.js) |
| Pruebas                      | [`tests/unknown-review.test.js`](../tests/unknown-review.test.js)                   |

## 1. Objetivo

Aplicar el principio de **no penalización errónea** de HU07: cuando la procedencia
de una aportación no puede determinarse con seguridad, no se etiqueta como IA ni
como humana. Se marca como `UNKNOWN` y se deriva a una **cola de revisión manual**
con una ficha auditable que explica el motivo, la severidad y la acción esperada.

Esta tarea cierra la interfaz de incertidumbre definida en
[`docs/criterios-clasificacion-autoria.md`](./criterios-clasificacion-autoria.md) §6
y prepara los datos que consumirá HU07-T5 al persistir la clasificación.

## 2. Alcance

**Incluido**

- Catálogo centralizado de motivos de incertidumbre con severidad y acción de revisión.
- Ficha auditable por aportación desconocida (`review`).
- Cola de revisión manual y resumen agregado (`unknownReview`) en el informe de autoría.
- Detección de identidades ambiguas: nombres genéricos, cuentas eliminadas y
  correos de marcador de posición.
- Integración con el dictamen global (`review_required`).

**Excluido**

- Persistencia de la clasificación y de la cola de revisión (HU07-T5).
- Interfaz de usuario para resolver la revisión manual.
- Reclasificación automática de aportaciones ya auditadas por una persona.

## 3. Motivos de incertidumbre

| Regla                 | Cuándo se activa                                                                 | Severidad | Acción de revisión       |
| --------------------- | -------------------------------------------------------------------------------- | --------- | ------------------------ |
| `invalid-identity`    | El autor o el committer no tienen nombre y correo válidos.                       | Alta      | `verify-commit-identity` |
| `ambiguous-identity`  | La identidad es válida pero genérica o compartida (p. ej. `unknown@…`, `ghost`). | Alta      | `verify-author-identity` |
| `velocity-anomaly`    | Ritmo sobrehumano de adición **sin** confirmación textual o de metadatos de IA.  | Media     | `request-manual-review`  |
| _Regla no catalogada_ | Cualquier regla futura sin acción definida (respaldo seguro).                    | Media     | `request-manual-review`  |

La regla `ambiguous-identity` se evalúa **después** de las evidencias de IA. Si
existe un trailer, marcador o firma textual explícita, la aportación se clasifica
como `AI_ASSISTED`, porque esa evidencia es concluyente y no depende de la
identidad.

### 3.1. Patrones considerados ambiguos

- **Nombre**: `unknown`, `none`, `null`, `n/a`, `anonymous`, `anónimo`, `ghost`.
- **Login**: `ghost` (cuenta eliminada de GitHub), `unknown`, `anonymous`.
- **Correo**: marcadores de posición (`unknown@…`, `root@…`) y servicios locales
  (`@localhost`, `@example.invalid`).

Los correos `noreply` de GitHub con identificador de usuario
(`123456+usuario@users.noreply.github.com`) **no** se consideran ambiguos: siguen
siendo atribuibles a una persona.

## 4. Flujo de tratamiento

```text
Commit (HU07-T2)
      │
      ▼
classifyContribution() (HU07-T3)
      │
      ├── HUMAN / AI_ASSISTED ──► sin revisión manual
      │
      └── UNKNOWN
             │
             ▼
      buildUnknownRecord()  ──► { regla, motivo, severidad, acción }
             │
             ▼
      buildUnknownReview()  ──► cola + resumen para el informe
             │
             ▼
      verdict.status = review_required
```

## 5. Contrato de datos

Cada contribución del informe incorpora su dictamen y, si procede, la ficha de
revisión:

```json
{
  "sha": "abc1234",
  "origin": "unknown",
  "rule": "ambiguous-identity",
  "reason": "El autor o el committer usan una identidad genérica o compartida…",
  "classification": {
    "origin": "unknown",
    "rule": "ambiguous-identity",
    "reason": "El autor o el committer usan una identidad genérica o compartida…"
  },
  "review": {
    "sha": "abc1234",
    "origin": "unknown",
    "rule": "ambiguous-identity",
    "reason": "El autor o el committer usan una identidad genérica o compartida…",
    "severity": "high",
    "action": "verify-author-identity",
    "requiresManualReview": true,
    "author": { "name": "Unknown", "email": "unknown@example.com", "login": "unknown" },
    "date": "2026-11-14T10:00:00Z",
    "additions": 20
  }
}
```

El informe agrega además el bloque `unknownReview`:

```json
{
  "unknownReview": {
    "total": 1,
    "requiresManualReview": true,
    "byRule": { "ambiguous-identity": 1 },
    "bySeverity": { "high": 1, "medium": 0, "low": 0 },
    "items": ["…fichas de revisión…"],
    "message": "1 aportación(es) con procedencia desconocida requieren revisión manual antes de emitir un dictamen definitivo."
  }
}
```

Ambos bloques son **aditivos**: no alteran el contrato `authorship` / `verdict`
definido en HU01-T1.

## 6. Integración con el resto de tareas

| Tarea que interactúa | Relación con HU07-T4                                                              |
| -------------------- | --------------------------------------------------------------------------------- |
| **HU07-T3** (JS/CJ)  | Aporta `classifyContribution` y las reglas base; T4 añade `ambiguous-identity`.   |
| **HU07-T5** (JS/FA)  | Persiste `unknownReview` y las fichas `review` para los análisis posteriores.     |
| **HU01-T6** (PG/GG)  | Puede incluir el resumen de la cola en el reporte de la Pull Request.             |
| **HU08-T3** (JS/FA)  | Usa `authorship.unknown`; la cola detalla qué aportaciones explican ese contador. |

## 7. Estimación y tiempos (ClickUp)

| Actividad  | Estimación | Real                             |
| ---------- | ---------- | -------------------------------- |
| Desarrollo | 0,5 h      | 0,5 h                            |
| Pruebas    | 0,25 h     | 0,25 h                           |
| Revisión   | 0,25 h     | -                                |
| **Total**  | **1,0 h**  | **0,75 h** (a falta de revisión) |

## 8. Criterios de aceptación cubiertos

| Criterio de la HU07                                          | Cómo lo satisface HU07-T4                                                                                              |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| **Clasificación exacta sin penalizar erróneamente al autor** | Toda duda razonable se deriva a `UNKNOWN` con motivo auditable, sin etiquetarla como IA.                               |
| **Tratamiento explícito de la incertidumbre**                | `UNKNOWN_RULES` define severidad y acción para cada motivo, y `buildUnknownReview` genera la cola de revisión manual.  |
| **Trazabilidad de la decisión**                              | Cada ficha conserva SHA, autor, fecha, líneas añadidas, regla y motivo, y el dictamen global pasa a `review_required`. |

## 9. Referencias

- [HU07-T1 — Criterios para distinguir aportaciones humanas y automatizadas](./criterios-clasificacion-autoria.md)
- [HU01-T3 — Detección de procedencia mediante metadatos](./HU01-T03-deteccion-procedencia-metadatos.md)
- [`src/classifier/unknown-review.js`](../src/classifier/unknown-review.js)
- [`tests/unknown-review.test.js`](../tests/unknown-review.test.js)
