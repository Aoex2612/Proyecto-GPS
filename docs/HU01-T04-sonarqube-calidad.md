# HU01-T4 — Calidad y complejidad con SonarCloud

| Campo                        | Valor                                                     |
| ---------------------------- | --------------------------------------------------------- |
| Historia de Usuario          | HU01 — Automatización del análisis del código             |
| Tarea                        | HU01-T4                                                   |
| Responsable                  | Germán Peláez Gallardo (GG)                               |
| Revisor asignado (matriz P4) | Félix Jiménez Almanza (FA)                                |
| Dependencias                 | HU01-T1 (contrato de fases y objeto `quality`)            |
| Contrato consumido           | [`src/pipeline/phases.js`](../src/pipeline/phases.js)     |
| Implementación               | [`src/quality/`](../src/quality/)                         |
| Pruebas                      | [`tests/quality/`](../tests/quality/)                     |
| Configuración de SonarCloud  | [`sonar-project.properties`](../sonar-project.properties) |
| Integración CI               | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) |

## 1. Objetivo

Incorporar SonarCloud al pipeline de integración continua para medir la
complejidad y la calidad del código en cada entrega, y traducir sus resultados
al objeto `quality` definido por HU01-T1. El análisis debe ejecutarse de forma
automática, no bloquear al desarrollador y dejar evidencia auditable de las
métricas obtenidas.

## 2. Alcance

**Incluido**

- Ejecución de SonarCloud sobre `src/` en cada PR y push a `develop`/`main`.
- Consumo de la cobertura generada por Jest (`coverage/lcov.info`).
- Extracción del Quality Gate, complejidad, cobertura, duplicación, deuda
  técnica, ratings e issues abiertos.
- Normalización al contrato `quality` de HU01-T1.
- Umbrales configurables y decisión `passed` / `warning` / `failed` / `skipped`.
- Generación de `quality-report.json` como artefacto de auditoría.
- Pruebas unitarias con `fetch` simulado y documentación de reproducción local.

**Excluido**

- La ejecución de las pruebas unitarias: siguen siendo responsabilidad de Jest.
  SonarCloud solo consume el informe de cobertura.
- La orquestación completa del pipeline (HU01-T5).
- La publicación del comentario en la PR y del Status Check (HU08-T3/T4).
- La configuración de las reglas de protección de ramas (HU05).

## 3. Arquitectura y flujo

```text
Push / PR
   │
   ▼
[validate] npm ci → eslint → jest --coverage
   │
   ▼
[quality] npm ci → jest --coverage → SonarCloud Scan
   │                                      │
   │                                      ▼
   │                             API de SonarCloud
   │                             (quality gate + measures + issues)
   │                                      │
   ▼                                      ▼
src/quality/cli.js ──────────────► quality-report.json
   │
   ▼
Artefacto de Actions + salida del análisis
```

El módulo se compone de tres piezas:

| Módulo                 | Responsabilidad                                                     |
| ---------------------- | ------------------------------------------------------------------- |
| `sonar-client.js`      | Llamadas HTTP de solo lectura, autenticación, timeout y reintentos. |
| `quality-evaluator.js` | Normalización de medidas, aplicación de umbrales y estado final.    |
| `index.js`             | Fachada `analyzeQuality(config)` tolerante a fallos.                |
| `cli.js`               | Lectura del entorno, escritura del reporte y código de salida.      |

## 4. Métricas extraídas

| Métrica de Sonar           | Clave normalizada       | Uso                             |
| -------------------------- | ----------------------- | ------------------------------- |
| `quality_gate`             | `qualityGate`           | Estado global del proyecto.     |
| `complexity`               | `complexity`            | Complejidad ciclomática.        |
| `cognitive_complexity`     | `cognitiveComplexity`   | Complejidad cognitiva.          |
| `coverage`                 | `coverage`              | Cobertura global de pruebas.    |
| `line_coverage`            | `lineCoverage`          | Cobertura de líneas.            |
| `branch_coverage`          | `branchCoverage`        | Cobertura de ramas.             |
| `duplicated_lines_density` | `duplication`           | Porcentaje de duplicación.      |
| `code_smells`              | `codeSmells`            | Número de code smells.          |
| `bugs`                     | `bugs`                  | Número de bugs.                 |
| `vulnerabilities`          | `vulnerabilities`       | Número de vulnerabilidades.     |
| `security_hotspots`        | `securityHotspots`      | Puntos calientes de seguridad.  |
| `sqale_index`              | `technicalDebtMinutes`  | Deuda técnica en minutos.       |
| `sqale_rating`             | `maintainabilityRating` | Rating de mantenibilidad.       |
| `reliability_rating`       | `reliabilityRating`     | Rating de fiabilidad.           |
| `security_rating`          | `securityRating`        | Rating de seguridad.            |
| `ncloc`                    | `ncloc`                 | Líneas de código no comentadas. |
| `files`                    | `files`                 | Número de ficheros analizados.  |

Los issues abiertos se normalizan con `key`, `rule`, `severity`, `type`,
`component`, `line`, `message`, `effort` y `status`.

## 5. Umbrales y estados

Los umbrales se pueden configurar por inputs de la Action, variables de entorno
o valores por defecto. La precedencia es:

1. Inputs de la Action (`sonar-min-coverage`, `sonar-max-complexity`,
   `sonar-max-duplication`).
2. Variables de entorno (`SONAR_MIN_COVERAGE`, `SONAR_MAX_COMPLEXITY`,
   `SONAR_MAX_DUPLICATION`).
3. Valores por defecto: cobertura mínima `80`, complejidad sin límite,
   duplicación máxima `3`.

| Estado    | Cuándo se produce                                                        |
| --------- | ------------------------------------------------------------------------ |
| `passed`  | Quality Gate `OK` y todos los umbrales se cumplen.                       |
| `warning` | Quality Gate `WARN`, faltan métricas o el gate `ERROR` no es bloqueante. |
| `failed`  | Quality Gate `ERROR` bloqueante, umbral incumplido o error de consulta.  |
| `skipped` | Análisis deshabilitado, sin `SONAR_TOKEN` o sin `sonar-project-key`.     |

El detalle de cada decisión se guarda en `reasons`, de modo que el reporte
justifica por qué se ha bloqueado o advertido.

## 6. Configuración

### Inputs de la Action

| Input                         | Por defecto             | Descripción                                  |
| ----------------------------- | ----------------------- | -------------------------------------------- |
| `sonar-enabled`               | `false`                 | Activa el análisis de calidad.               |
| `sonar-token`                 | —                       | Token de SonarCloud (usar un secreto).       |
| `sonar-host-url`              | `https://sonarcloud.io` | URL del servidor Sonar.                      |
| `sonar-project-key`           | `owner_repo`            | Project key de SonarCloud.                   |
| `sonar-min-coverage`          | `80`                    | Cobertura mínima exigida (%).                |
| `sonar-max-complexity`        | vacío                   | Complejidad ciclomática máxima.              |
| `sonar-max-duplication`       | `3`                     | Duplicación máxima permitida (%).            |
| `sonar-quality-gate-required` | `true`                  | Si el Quality Gate `ERROR` bloquea.          |
| `fail-on-quality-gate`        | `true`                  | Si la Action falla cuando el análisis falla. |

### Variables de entorno del CLI

`SONAR_TOKEN`, `SONAR_HOST_URL`, `SONAR_PROJECT_KEY`, `SONAR_MIN_COVERAGE`,
`SONAR_MAX_COMPLEXITY`, `SONAR_MAX_DUPLICATION`,
`SONAR_QUALITY_GATE_REQUIRED`, `SONAR_FAIL_ON_QUALITY_GATE` y
`SONAR_REPORT_PATH`.

### `sonar-project.properties`

El fichero incluido en la raíz define el project key, la organización, las
fuentes, las pruebas, la ruta de cobertura y las exclusiones. Si la organización
de SonarCloud no es `aoex2612`, debe ajustarse antes del primer análisis.

## 7. Integración en CI

El job `quality` de `.github/workflows/ci.yml`:

1. Se ejecuta después de `validate` y solo en PRs del mismo repositorio o en
   push a `develop`/`main`.
2. Hace checkout con `fetch-depth: 0` para que Sonar pueda calcular el blame y
   las líneas nuevas.
3. Ejecuta `npm test` para generar `coverage/lcov.info`.
4. Expone `HAS_SONAR_TOKEN` a nivel de job (el contexto `secrets` no está
   disponible en `steps.if`).
5. Lanza `SonarSource/sonarqube-scan-action` con `SONAR_TOKEN` y
   `SONAR_HOST_URL=https://sonarcloud.io` solo si el secreto existe.
6. Ejecuta `node src/quality/cli.js` para generar `quality-report.json`.
7. Publica el informe como artefacto `quality-report`.

En PRs de fork no hay secretos disponibles: el job se omite y no se rompe el
pipeline. Si el repositorio no tiene configurado `SONAR_TOKEN`, los pasos de
Sonar se omiten y el job termina sin fallar.

## 8. Seguridad

- El token se recibe por secreto (`SONAR_TOKEN`) y nunca se escribe en el
  repositorio, en `sonar-project.properties` ni en los logs.
- El cliente envía el token en la cabecera `Authorization: Basic`, no en la URL.
- Los mensajes de error se redactan con `redactToken` para sustituir el token
  por `***`.
- El análisis es de solo lectura: no se ejecuta código de la PR ni se envían
  comandos a Sonar.
- Los permisos del job se limitan a `contents: read`, `pull-requests: write` y
  `checks: write`.

## 9. Modos de fallo

| Situación                               | Resultado                                      |
| --------------------------------------- | ---------------------------------------------- |
| Sin `SONAR_TOKEN`                       | `skipped`, con aviso, sin romper el pipeline.  |
| Sin `sonar-project-key`                 | `skipped`, con aviso.                          |
| Token inválido o sin permisos (401/403) | `failed` con mensaje de credenciales.          |
| Proyecto inexistente (404)              | `failed` con mensaje de recurso no encontrado. |
| Timeout de la API                       | `failed` con código `TIMEOUT`.                 |
| Respuesta JSON inválida                 | `failed` con código `INVALID_RESPONSE`.        |
| 429 o 5xx                               | Reintento y, si persiste, `failed`.            |
| Quality Gate `ERROR`                    | `failed` si es obligatorio; `warning` si no.   |
| Cobertura/complejidad/duplicación fuera | `failed` con el motivo concreto en `reasons`.  |
| Métricas no disponibles                 | `warning` indicando qué falta.                 |

## 10. Criterios de aceptación

| Criterio                                                    | Evidencia                                                |
| ----------------------------------------------------------- | -------------------------------------------------------- |
| El análisis se ejecuta automáticamente en cada PR/push.     | Job `quality` del workflow.                              |
| Se miden complejidad y calidad.                             | Métricas de la sección 4 en `quality-report.json`.       |
| Se consume la cobertura de las pruebas.                     | `sonar.javascript.lcov.reportPaths=coverage/lcov.info`.  |
| Los umbrales son configurables.                             | Inputs y variables de entorno de la sección 6.           |
| El resultado se normaliza al contrato de HU01-T1.           | `quality.status`, `quality.issues` y campos adicionales. |
| Los fallos no rompen el pipeline por configuración ausente. | Modo `skipped` de `analyzeQuality`.                      |
| El token no se filtra.                                      | `redactToken` y pruebas de redacción.                    |
| Hay pruebas y documentación.                                | `tests/quality/` y este documento.                       |

## 11. TDD y evidencias

Se implementaron primero las pruebas y después el código de producción:

| Suite                        | Qué cubre                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------- |
| `quality-evaluator.test.js`  | Normalización, umbrales, precedencia de estados e issues.                     |
| `sonar-client.test.js`       | Auth, endpoints, timeout, 401, 404, 429, JSON inválido y redacción.           |
| `analyze-quality.test.js`    | Modos deshabilitado/sin token/sin project key, gate OK/WARN/ERROR y umbrales. |
| `cli.test.js`                | Parseo del entorno, escritura del reporte y códigos de salida.                |
| `action-integration.test.js` | Integración en `src/index.js`: outputs, bloqueo y degradación a `skipped`.    |

Comandos de verificación:

```bash
npm test
npm run lint
npm run build
```

## 12. Reproducción local

1. Crear el proyecto en SonarCloud y obtener el `SONAR_TOKEN`.
2. Ajustar `sonar.organization` y `sonar.projectKey` en
   `sonar-project.properties`.
3. Ejecutar las pruebas con cobertura:

   ```bash
   npm ci
   npm test
   ```

4. Lanzar el escáner (requiere Java y el CLI de Sonar):

   ```bash
   npx sonar-scanner \
     -Dsonar.host.url=https://sonarcloud.io \
     -Dsonar.token=$SONAR_TOKEN
   ```

5. Generar el reporte:

   ```bash
   SONAR_TOKEN=... \
   SONAR_PROJECT_KEY=Aoex2612_Proyecto-GPS \
   node src/quality/cli.js
   ```

## 13. Riesgos y mitigaciones

| Riesgo                                                     | Mitigación                                                                    |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------- |
| El repositorio es privado y SonarCloud no es gratuito.     | Usar SonarQube self-hosted o una licencia de SonarCloud.                      |
| El primer análisis aún no ha terminado cuando se consulta. | El estado queda `skipped`/`warning` y se reintenta en la siguiente ejecución. |
| La organización o el project key no coinciden.             | Documentados en `sonar-project.properties`; ajustar antes del primer uso.     |
| PRs de fork sin secretos.                                  | El job se omite y no bloquea la integración.                                  |
| El Quality Gate de Sonar y los umbrales locales discrepan. | El reporte incluye ambos y explica el motivo en `reasons`.                    |
| El escáner tarda más de lo aceptable.                      | Job acotado por el timeout del workflow y caché del scanner.                  |

## 14. Referencias

- [Contrato de fases de HU01-T1](./HU01-T01-diseno-fases.md)
- [Criterios de clasificación de autoría](./criterios-clasificacion-autoria.md)
- [README del proyecto](../README.md)
- [Documentación de SonarCloud](https://docs.sonarsource.com/sonarcloud/)
- [SonarQube Scan Action](https://github.com/SonarSource/sonarqube-scan-action)
