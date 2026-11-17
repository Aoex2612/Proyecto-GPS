# HU07-T5 — Guardar la clasificación para usarla en los análisis

| Campo                        | Valor                                                                                                 |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| Historia de Usuario          | HU07 — Determinación fiable del origen del trabajo                                                    |
| Tarea                        | HU07-T5                                                                                               |
| Responsable                  | Alejandro Jesús Ortiz Zamora (AZ)                                                                     |
| Revisor asignado (matriz P4) | Jesús Cañete García (JG)                                                                              |
| Dependencias                 | HU07-T3 (`authorship-classifier.js`), HU07-T4 (`unknown-review.js`)                                   |
| Implementación               | [`src/persistence/classification-store.js`](../src/persistence/classification-store.js)               |
| Fachada del subsistema       | [`src/persistence/index.js`](../src/persistence/index.js)                                             |
| Pruebas                      | [`tests/persistence/classification-store.test.js`](../tests/persistence/classification-store.test.js) |

## 1. Objetivo

Persistir el informe de autoría en un fichero `metrics.json` con un esquema
versionado, de forma que los análisis posteriores puedan reutilizar la
clasificación ya calculada sin volver a procesar los commits.

Esta tarea cierra el circuito abierto por HU07-T3 (clasificación) y HU07-T4
(tratamiento de la incertidumbre), y materializa el artefacto `metrics.json`
contemplado en el contrato de HU01-T1.

## 2. Alcance

**Incluido**

- Normalización del informe de autoría a un registro versionado y serializable.
- Escritura del registro en `metrics.json` con JSON legible (2 espacios) y salto final.
- Lectura y validación del registro guardado.
- Tratamiento tolerante de fichero ausente y errores descriptivos ante JSON o esquema inválidos.
- Conservación opcional del bloque `unknownReview` generado por HU07-T4.

**Excluido**

- Invocación del guardado desde el orquestador de la Action (HU01-T5).
- Histórico acumulado de ejecuciones y comparación entre análisis (HU06).
- Publicación del fichero como artefacto de GitHub Actions (HU01-T6/HU01-T5).
- Reclasificación o auditoría manual de las aportaciones desconocidas.

## 3. Esquema de `metrics.json`

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-11-16T10:00:00.000Z",
  "delivery": {
    "repository": "Aoex2612/Proyecto-GPS",
    "pullRequest": 17,
    "baseBranch": "develop",
    "headBranch": "HU07-T05-guardar-clasificacion",
    "commitSha": "abc1234"
  },
  "authorship": {
    "human": 2,
    "aiAssisted": 1,
    "unknown": 1,
    "total": 4,
    "percentage": { "human": 50, "aiAssisted": 25, "unknown": 25 },
    "lines": { "human": 80, "aiAssisted": 20, "unknown": 10, "total": 110 }
  },
  "verdict": {
    "status": "review_required",
    "exceedsThreshold": false,
    "reasons": ["1 aportación desconocida requiere revisión manual."]
  },
  "thresholdAi": 50,
  "identities": [],
  "contributions": [],
  "unknownReview": {
    "total": 1,
    "requiresManualReview": true,
    "items": []
  }
}
```

- `schemaVersion` permite evolucionar el formato sin romper lectores antiguos.
- `generatedAt` es la fecha ISO 8601 del guardado.
- `unknownReview` se guarda si está presente y vale `null` en caso contrario.

## 4. API

| Función                                              | Descripción                                                                       |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| `buildClassificationRecord(report, { generatedAt })` | Normaliza el informe y devuelve el registro versionado. No muta la entrada.       |
| `serializeClassificationRecord(record)`              | Serializa el registro como JSON indentado con salto de línea final.               |
| `validateClassificationRecord(record)`               | Devuelve `{ valid, errors }` con la versión, los bloques y los tipos comprobados. |
| `saveClassification(report, options)`                | Guarda el registro en `metrics.json` y devuelve `{ record, reportPath }`.         |
| `loadClassification(options)`                        | Lee y valida el registro; devuelve `null` si el fichero no existe.                |

Opciones comunes:

- `filePath`: nombre o ruta del fichero (por defecto `metrics.json`).
- `cwd`: directorio base (por defecto `process.cwd()`).
- `writeFileImpl` / `readFileImpl`: funciones de E/S inyectables para pruebas.
- `generatedAt`: fecha de generación inyectable para pruebas reproducibles.

## 5. Flujo de uso

```text
detectAuthorship()  (HU01-T3 / HU07-T3 / HU07-T4)
        │
        ▼
buildClassificationRecord()  ──► registro versionado
        │
        ▼
saveClassification()  ──► metrics.json
        │
        ▼
loadClassification()  ──► análisis posteriores
```

## 6. Manejo de errores

| Situación                                       | Comportamiento                                 |
| ----------------------------------------------- | ---------------------------------------------- |
| El informe no es un objeto                      | `TypeError` en `buildClassificationRecord`.    |
| `generatedAt` no es una fecha válida            | `TypeError`.                                   |
| El fichero no existe al leer                    | Devuelve `null`.                               |
| El fichero no contiene JSON válido              | `Error` con el motivo del parser.              |
| Versión de esquema desconocida                  | `Error` que indica la versión esperada.        |
| Faltan bloques obligatorios o tipos incorrectos | `Error` con la lista de errores de validación. |
| Fallo de escritura (permisos, disco)            | Se propaga el error original.                  |

## 7. Integración con el resto de tareas

| Tarea que interactúa | Relación con HU07-T5                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| **HU07-T3** (JS/CJ)  | Produce el informe base (`delivery`, `authorship`, `verdict`, `thresholdAi`, identidades y contribuciones). |
| **HU07-T4** (AZ/JS)  | Aporta `unknownReview`, que se persiste tal cual cuando existe.                                             |
| **HU01-T1** (JG/CJ)  | Define `metrics.json` como artefacto del análisis.                                                          |
| **HU01-T5** (JG)     | Invocará `saveClassification` al cerrar la fase `analysis`.                                                 |
| **HU01-T6** (PG/GG)  | Puede leer el registro para construir el reporte de la PR.                                                  |
| **HU06**             | Reutilizará los registros guardados para el histórico y las métricas.                                       |

## 8. Estimación y tiempos (ClickUp)

| Actividad  | Estimación | Real                            |
| ---------- | ---------- | ------------------------------- |
| Desarrollo | 1,75 h     | 1,75 h                          |
| Pruebas    | 0,75 h     | 0,75 h                          |
| Revisión   | 0,5 h      | -                               |
| **Total**  | **3,0 h**  | **2,5 h** (a falta de revisión) |

## 9. Criterios de aceptación cubiertos

| Criterio                                                        | Cómo lo satisface HU07-T5                                                                          |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **La clasificación queda disponible para análisis posteriores** | `saveClassification` escribe `metrics.json` y `loadClassification` lo recupera y valida.           |
| **Trazabilidad y evolución del formato**                        | El registro incluye `schemaVersion` y `generatedAt`, y la lectura rechaza versiones no soportadas. |
| **Compatibilidad con la incertidumbre de T4**                   | `unknownReview` se conserva cuando existe, sin romper la lectura cuando no está presente.          |
| **Errores controlados**                                         | Fichero ausente devuelve `null`; JSON o esquema inválidos generan errores descriptivos.            |

## 10. Referencias

- [HU07-T3 — Clasificación de cada aportación según su origen](./criterios-clasificacion-autoria.md)
- [HU07-T4 — Tratamiento de aportaciones desconocidas](./HU07-T04-aportaciones-desconocidas.md)
- [HU01-T1 — Diseño de las fases del ciclo de entrega](./HU01-T01-diseno-fases.md)
- [`src/persistence/classification-store.js`](../src/persistence/classification-store.js)
- [`tests/persistence/classification-store.test.js`](../tests/persistence/classification-store.test.js)
