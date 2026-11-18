# AI Authorship & Quality Gate Action 🛡️🤖

> **GitHub Action** para la auditoría y clasificación automática del código en Pull Requests, distinguiendo entre aportaciones humanas y asistidas por IA, y orquestando el control de calidad en el ciclo de integración continua.

---

## 👥 Equipo y Organización (UMA)

| Miembro                          | Rol Principal (Sprint 1)                 | Iniciales |
| -------------------------------- | ---------------------------------------- | --------- |
| **Candela Marco Jiménez**        | Scrum Master / QA Reviewer               | `CJ`      |
| **Jesús Cañete García**          | Gestor de Proyecto / Desarrollador CI    | `JG`      |
| **Ángel López Sánchez**          | Coordinador Técnico / Metadatos Git      | `AS`      |
| **Alejandro Jesús Ortiz Zamora** | Desarrollador (Criterios Autoría)        | `AZ`      |
| **Félix Jiménez Almanza**        | Desarrollador (API GitHub / Auth)        | `FA`      |
| **Germán Peláez Gallardo**       | QA / Análisis Estático (SonarQube)       | `GG`      |
| **Jorge Torres Sánchez**         | Desarrollador (Clasificación & Reportes) | `JS`      |
| **Pablo García Gómez**           | Desarrollador (Validación & Reportes)    | `PG`      |

---

## 🚀 Inicio Rápido en Local

### 1. Requisitos

- [Node.js](https://nodejs.org/) v20 o superior
- `npm` v10 o superior

### 2. Instalación de dependencias

```bash
npm install
```

### 3. Ejecución de pruebas (TDD)

```bash
# Ejecutar todas las pruebas unitarias y ver cobertura
npm test

# Modo observación para ciclo Rojo-Verde-Refactor
npm run test:watch
```

### 4. Linters y formateo de código

```bash
# Comprobar estándares con ESLint
npm run lint

# Corregir automáticamente problemas de estilo
npm run lint:fix

# Formatear archivos con Prettier
npm run format
```

### 5. Compilación del artefacto de distribución

```bash
npm run build
```

### 6. Calidad y complejidad (SonarCloud)

El análisis de calidad se ejecuta en el job `quality` del pipeline y también
puede reproducirse en local:

```bash
npm test

SONAR_TOKEN=... \
SONAR_PROJECT_KEY=Aoex2612_Proyecto-GPS \
node src/quality/cli.js
```

Genera `quality-report.json` con el Quality Gate, complejidad, cobertura,
duplicación, deuda técnica e issues abiertos. La configuración de SonarCloud
está en `sonar-project.properties` y el diseño completo en
[`docs/HU01-T04-sonarqube-calidad.md`](docs/HU01-T04-sonarqube-calidad.md).

> SonarCloud requiere que el repositorio sea público o una licencia de pago.
> Si no existe `SONAR_TOKEN`, el análisis queda en estado `skipped` y no bloquea
> el pipeline.

### 7. Motor de integración continua (HU01-T5)

El job `lifecycle` ejecuta el motor de CI después de `validate` y `quality`.
Valida que el evento de GitHub dispara el análisis, recorre las fases
automáticas del contrato (`pull_request`, `analysis` y `reporting`), descarga
los commits de la entrega y ejecuta el detector de autoría de HU01-T3. Después
genera `ci-report.json`, que se publica como artefacto `ci-lifecycle-report` y
se resume en el job summary:

```bash
# Reproducción local (sin GitHub Actions)
$env:GITHUB_REPOSITORY = 'equipo-uma/proyecto-gps'
$env:GITHUB_EVENT_NAME = 'pull_request'
node src/pipeline/cli.js
Get-Content ci-report.json
```

El diseño completo, el catálogo de tareas y los timeouts están documentados en
[`docs/HU01-T05-motor-ci.md`](docs/HU01-T05-motor-ci.md).

---

## 🌳 Flujo de Trabajo en Git (GitFlow Simplificado)

1. **Ramas Principales Protegidas**:
   - `main`: Código estable y validado al final del sprint.
   - `develop`: Rama de integración continua activa durante el sprint.
2. **Ramas de Tareas**:
   - Se crean siempre a partir de `develop`:
     ```bash
     git checkout develop
     git pull origin develop
     git checkout -b <HU>-<Tarea>-<descripcion-corta>
     # Ejemplo: git checkout -b HU07-T01-criterios-distincion-autoria
     ```
3. **Pull Requests (PR)**:
   - Se dirigen siempre contra `develop`.
   - Se debe completar la plantilla `.github/pull_request_template.md`.
   - Requiere la aprobación del **revisor asignado en la matriz P4** (nadie aprueba su propia PR).
   - Requiere que el check de integración continua (`CI Pipeline`) esté en **verde**.

---

## 📋 Definition of Done (DoD)

Una tarea solo se considera **terminada** si cumple:

1. **TDD obligatorio**: Se escribió primero la prueba unitaria que fallaba (rojo) antes del código de producción (verde).
2. **Batería de pruebas**: Pasa el 100% de los tests unitarios con `npm test`.
3. **Estilo**: Pasa `npm run lint` sin errores ni advertencias.
4. **Criterios de Aceptación**: Cumple los criterios especificados en la tarjeta de ClickUp.
5. **Revisión por Pares**: PR aprobada por el revisor asignado.
6. **CI en Verde**: El pipeline automático en GitHub Actions finaliza con éxito.

---

## 📁 Estructura del Proyecto

```text
├── .github/
│   ├── workflows/ci.yml           # Pipeline: validate, quality y lifecycle
│   └── pull_request_template.md   # Plantilla de PR con checklist del DoD
├── src/
│   ├── index.js                   # Entrypoint de la GitHub Action
│   ├── auth/                      # HU08: Cliente de GitHub y llamadas seguras (Octokit)
│   ├── classifier/                # HU07: Clasificador de autoría (Humano / IA / Desconocido)
│   ├── git/                       # HU01 / HU07: Extracción de metadatos de Git y commits
│   ├── pipeline/                  # HU01: Fases, procesos y motor de integración continua
│   ├── quality/                   # HU01-T4: Cliente SonarCloud, umbrales y reporte
│   ├── reporter/                  # HU08: Notificación en PRs y manejo de errores
│   └── utils/                     # Utilidades comunes y logging
├── docs/                          # Documentación de diseño por tarea
├── tests/                         # Pruebas unitarias (Jest) y mocks
├── action.yml                     # Manifiesto de la GitHub Action
├── sonar-project.properties       # Configuración de SonarCloud (HU01-T4)
├── package.json                   # Dependencias y scripts
├── .eslintrc.json                 # Reglas de linter
└── .prettierrc                    # Configuración de formateo
```

### Reintentos de operaciones (HU08-T4)

`withRetry(operation, options)` en `src/utils/retry.js` ofrece una política común para operaciones asíncronas: hasta 3 intentos por defecto, con espera exponencial (1 s, 2 s) y respeto de las cabeceras `Retry-After` y `X-RateLimit-Reset` de GitHub. Solo reintenta fallos transitorios de red, HTTP 408/429/5xx y respuestas 403 identificadas como límite de peticiones; los demás errores se propagan sin reintento. Los parámetros `maxAttempts`, `baseDelayMs`, `maxDelayMs`, `sleep`, `shouldRetry` y `logger` se pueden configurar. Debe usarse especialmente con operaciones idempotentes, ya que el resultado de una petición de escritura que perdió la respuesta puede ser ambiguo.

### Metadatos e identidades (HU07-T02)

`parseCommitMetadata({ commits })` normaliza los commits recibidos de GitHub y devuelve:

- Por commit: SHA, autor y committer (nombre, correo, login, tipo de cuenta e indicador de bot), mensaje, trailers, coautores indicados mediante `Co-authored-by` y diff disponible.
- Una lista consolidada de identidades de autor, committer y coautores. Se consideran duplicadas las identidades que comparten correo o login; si no hay ninguno, se comparan por nombre.

Git proporciona nombre y correo en los metadatos del commit, mientras que la API de GitHub puede añadir login y tipo de cuenta (`User` o `Bot`). Los parches se concatenan desde `files[].patch`; GitHub puede omitirlos en ficheros grandes o cuando el parche no está disponible, por lo que un diff vacío no significa que el commit no tenga cambios. Los trailers se conservan por clave y valor para que el clasificador pueda evaluar otras declaraciones además de los coautores.
