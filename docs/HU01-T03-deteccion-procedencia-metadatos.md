# HU01-T3 — Sistema de Detección de Procedencia del Código mediante Metadatos

| Campo                        | Valor                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------- |
| Historia de Usuario          | HU01 — Automatización del análisis del código                                                     |
| Tarea                        | HU01-T3                                                                                           |
| Responsable                  | Ángel López Sánchez (AS)                                                                          |
| Revisor asignado (matriz P4) | Jesús Cañete García (JG)                                                                          |
| Dependencias                 | HU01-T1 (contrato de fases), HU07-T2 (`metadata-parser.js`), HU07-T3 (`authorship-classifier.js`) |
| Contrato implementado        | [`src/classifier/authorship-detector.js`](../src/classifier/authorship-detector.js)               |
| Fachada del subsistema       | [`src/classifier/index.js`](../src/classifier/index.js)                                           |
| Pruebas                      | [`tests/authorship-detector.test.js`](../tests/authorship-detector.test.js)                       |

## 1. Objetivo

Desarrollar el sistema automatizado de detección de procedencia del código que,
apoyándose en los metadatos de Git y de la API de GitHub generados durante el
desarrollo del proyecto, determine de manera fiable y auditable qué aportaciones
son de origen humano, cuáles han sido asistidas o generadas por herramientas de
Inteligencia Artificial y cuáles requieren revisión adicional (`UNKNOWN`).

El sistema consolida las reglas de extracción (HU07-T2) y clasificación (HU07-T3)
en un motor unificado de análisis de entregas que alimenta las fases `analysis` y
`reporting` definidas en HU01-T1.

## 2. Alcance

**Incluido**

- Orquestación completa del flujo de análisis de autoría a partir de commits (crudos de la API de GitHub o pre-normalizados).
- Normalización automática de identidades, trailers, marcas textuales y parches.
- Cálculo de velocidad temporal entre commits consecutivos para detectar adiciones sobrehumanas.
- Clasificación commit a commit con trazabilidad del dictamen (regla y motivo de auditoría).
- Agregación cuantitativa de aportaciones y líneas añadidas computables (excluyendo dependencias y lockfiles).
- Evaluación frente al umbral configurable de IA (`thresholdAi`, por defecto 50%).
- Dictamen global del estado de autoría (`passed` o `review_required`) con justificación explícita.
- Generación de estructura compatible con el contrato `authorship` de HU01-T1 y el publicador `pr-notifier` de HU08-T3.

**Excluido**

- Implementación del pipeline/workflow de GitHub Actions que invoca la Action (HU01-T5).
- Análisis de calidad y complejidad de código con SonarCloud (HU01-T4).
- Selección de formatos y renderizado final de los comentarios en la Pull Request (HU01-T6 y HU08-T3).

## 3. Arquitectura y flujo del sistema

```text
Entrada: Commits (GitHub API) + Umbral IA + Metadatos Delivery
                        │
                        ▼
    ┌────────────────────────────────────────┐
    │ 1. Extracción de metadatos (HU07-T2)   │  src/git/metadata-parser.js
    │    Normaliza autor, committer, diffs,  │
    │    fechas, ficheros y trailers Git     │
    └───────────────────┬────────────────────┘
                        │
                        ▼
    ┌────────────────────────────────────────┐
    │ 2. Heurística temporal (HU07-T3)       │  computeVelocityStats()
    │    Calcula elapsedMinutes y líneas     │
    │    añadidas computables entre commits  │
    └───────────────────┬────────────────────┘
                        │
                        ▼
    ┌────────────────────────────────────────┐
    │ 3. Clasificación unitaria (HU07-T3)    │  classifyContribution()
    │    Aplica reglas de Nivel 1 y Nivel 2  │
    │    (metadatos, textual, velocidad)     │
    └───────────────────┬────────────────────┘
                        │
                        ▼
    ┌────────────────────────────────────────┐
    │ 4. Agregación y umbrales (HU01-T3)     │  detectAuthorship()
    │    Suma aportaciones y líneas, calcula │
    │    porcentajes y evalúa thresholdAi    │
    └───────────────────┬────────────────────┘
                        │
                        ▼
Salida: Objeto normalizado según contrato HU01-T1 / HU01-T6
{
  delivery: { repository, pullRequest, ... },
  authorship: { human, aiAssisted, unknown, total, percentage, lines },
  verdict: { status, exceedsThreshold, reasons },
  contributions: [ ... ]
}
```

## 4. Contrato de datos generado

El resultado devuelto por `detectAuthorship(options)` cumple estrictamente la
especificación del contrato de datos de HU01-T1:

```json
{
  "delivery": {
    "repository": "equipo-uma/proyecto-gps",
    "pullRequest": 42,
    "baseBranch": "develop",
    "headBranch": "HU01-T03-desarrollar-sistema",
    "commitSha": "abc1234"
  },
  "authorship": {
    "human": 3,
    "aiAssisted": 1,
    "unknown": 0,
    "total": 4,
    "percentage": {
      "human": 75.0,
      "aiAssisted": 25.0,
      "unknown": 0.0
    },
    "lines": {
      "human": 120,
      "aiAssisted": 35,
      "unknown": 0,
      "total": 155
    }
  },
  "verdict": {
    "status": "passed",
    "exceedsThreshold": false,
    "reasons": []
  },
  "thresholdAi": 50,
  "identities": [ ... ],
  "contributions": [
    {
      "sha": "abc1234",
      "origin": "human",
      "rule": "no-ai-evidence",
      "reason": "Identidades válidas y sin metadatos, firmas ni velocidad anómala de IA."
    }
  ]
}
```

## 5. Integración con el resto de tareas

| Tarea que interactúa | Relación con HU01-T3                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| **HU07-T2** (CJ/AZ)  | Aporta `parseCommitMetadata` para estandarizar los datos brutos de la API de GitHub.                  |
| **HU07-T3** (JS/CJ)  | Aporta `computeVelocityStats` y `classifyContribution` con los criterios de Nivel 1 y 2.              |
| **HU01-T1** (JG/CJ)  | Define el contrato del objeto `authorship` y la fase `analysis` donde opera este sistema.             |
| **HU01-T5** (JG)     | Consume `detectAuthorship` en el orquestador principal de la GitHub Action.                           |
| **HU01-T6** (PG/GG)  | Consume el resultado de `detectAuthorship` para seleccionar datos y redactar los reportes.            |
| **HU08-T3** (JS/FA)  | Consume las propiedades `authorship.human`, `aiAssisted`, `unknown` y `thresholdAi` en `pr-notifier`. |

## 6. Estimación y tiempos (ClickUp)

| Actividad  | Estimación | Real                            |
| ---------- | ---------- | ------------------------------- |
| Desarrollo | 4,0 h      | 4,0 h                           |
| Pruebas    | 2,0 h      | 2,0 h                           |
| Revisión   | 1,0 h      | -                               |
| **Total**  | **7,0 h**  | **6,0 h** (a falta de revisión) |

## 7. Criterios de aceptación cubiertos

| Criterio de la HU01                                     | Cómo lo satisface la implementación de HU01-T3                                                                                                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Evaluación automática sin intervención manual**       | `detectAuthorship` procesa los metadatos de Git de forma completamente desatendida mediante reglas formales y heurísticas auditables.                                           |
| **Notificación clara del estado sin bloqueos espurios** | Emite un dictamen estructurado (`status`: `passed` / `review_required`) diferenciando código humano, asistido y desconocido con justificación explícita de cada regla activada. |
| **Límites de tiempo y eficiencia**                      | La detección y agregación en memoria se ejecuta en milisegundos sin llamadas externas adicionales ni bloqueos I/O.                                                              |

## 8. Referencias

- [HU01-T1 — Diseño de las fases](../docs/HU01-T01-diseno-fases.md)
- [HU07-T1 — Criterios de distinción de autoría](../docs/criterios-clasificacion-autoria.md)
- [`src/classifier/authorship-detector.js`](../src/classifier/authorship-detector.js)
- [`tests/authorship-detector.test.js`](../tests/authorship-detector.test.js)
