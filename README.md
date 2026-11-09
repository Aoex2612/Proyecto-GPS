# AI Authorship & Quality Gate Action 🛡️🤖

> **GitHub Action** para la auditoría y clasificación automática del código en Pull Requests, distinguiendo entre aportaciones humanas y asistidas por IA, y orquestando el control de calidad en el ciclo de integración continua.

---

## 👥 Equipo y Organización (UMA)

| Miembro | Rol Principal (Sprint 1) | Iniciales |
|---|---|---|
| **Candela Marco Jiménez** | Scrum Master / QA Reviewer | `CJ` |
| **Jesús Cañete García** | Gestor de Proyecto / Desarrollador CI | `JG` |
| **Ángel López Sánchez** | Coordinador Técnico / Metadatos Git | `AS` |
| **Alejandro Jesús Ortiz Zamora** | Desarrollador (Criterios Autoría) | `AZ` |
| **Félix Jiménez Almanza** | Desarrollador (API GitHub / Auth) | `FA` |
| **Germán Peláez Gallardo** | QA / Análisis Estático (SonarQube) | `GG` |
| **Jorge Torres Sánchez** | Desarrollador (Clasificación & Reportes) | `JS` |
| **Pablo García Gómez** | Desarrollador (Validación & Reportes) | `PG` |

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
│   ├── workflows/ci.yml           # Pipeline de validación automática
│   └── pull_request_template.md   # Plantilla de PR con checklist del DoD
├── src/
│   ├── index.js                   # Entrypoint de la GitHub Action
│   ├── auth/                      # HU08: Cliente de GitHub y llamadas seguras (Octokit)
│   ├── classifier/                # HU07: Clasificador de autoría (Humano / IA / Desconocido)
│   ├── git/                       # HU01 / HU07: Extracción de metadatos de Git y commits
│   ├── reporter/                  # HU08: Notificación en PRs y manejo de errores
│   └── utils/                     # Utilidades comunes y logging
├── tests/                         # Pruebas unitarias (Jest) y mocks
├── action.yml                     # Manifiesto de la GitHub Action
├── package.json                   # Dependencias y scripts
├── .eslintrc.json                 # Reglas de linter
└── .prettierrc                    # Configuración de formateo
```
