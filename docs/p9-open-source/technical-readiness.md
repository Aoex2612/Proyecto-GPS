# Preparación Técnica y Seguridad (technical-readiness.md)

**Proyecto:** ai-authorship-qa-action (GitHub Action para auditoría de autoría y calidad en PRs)  
**Asignatura:** Gestión de Proyectos Software (Universidad de Málaga)  
**Subequipo B:** Félix Jiménez Almanza y Germán Peláez Gallardo  

---

## 1. Revisión de la Estructura y Organización del Repositorio

El código del proyecto se encuentra estructurado de forma modular en el directorio src, separando claramente las responsabilidades del sistema:
- src/auth gestiona el cliente seguro de GitHub mediante Octokit.
- src/classifier implementa las reglas de autoría, la detección de procedencia y la cola de revisión manual.
- src/git normaliza y extrae los metadatos de commits y autores.
- src/pipeline orquesta el motor de fases y el ciclo de vida de la integración continua.
- src/quality evalúa el Quality Gate y métricas de SonarCloud.
- src/reporter genera las notificaciones y comentarios en las Pull Requests.
- src/utils centraliza el sistema de registros y la lógica de reintentos con espera exponencial.

Deficiencias organizativas detectadas:
- Presencia del directorio daily-scrum con grabaciones de audio de 15 MB ajenas al software.
- Ausencia del artefacto compilado final en dist/index.js, lo que imposibilita la ejecución remota de la acción.
- Falta de plantillas comunitarias de issues y workflows de empaquetado continuo en el directorio .github.

---

## 2. Identificación de Secretos, Credenciales y Datos Sensibles

Diagnóstico de seguridad en el código y en el historial de Git:
- Manejo de credenciales en código activo: El código maneja los tokens de forma segura leyéndolos desde variables de entorno y enmascarando cualquier secreto con asteriscos en los registros y mensajes de error.
- Fuga de datos personales en el historial: Existen correos institucionales de la Universidad de Málaga y cuentas personales de Gmail de los alumnos en el historial de commits.
- Grabaciones multimedia internas: El archivo de audio de reuniones de clase expone voces y datos personales de los estudiantes, suponiendo una infracción del Reglamento General de Protección de Datos (RGPD) si se hace público.
- Parámetros individuales: La configuración de SonarCloud contiene identificadores vinculados a la cuenta personal de un estudiante (Aoex2612_Proyecto-GPS).

Plan de higienización con herramientas del Tema 4:
- Detección de claves con Git Secrets para asegurar que ninguna revisión pasada contenga tokens o contraseñas.
- Búsqueda de información personal en el historial con la herramienta Poirot.
- Purga completa del directorio daily-scrum y reescritura de correos hacia alias anónimos de GitHub utilizando la herramienta git-filter-repo antes de abrir el repositorio.

---

## 3. Revisión de Dependencias y Licencias de Terceros

Auditoría de licencias de dependencias:
- Dependencias de producción (@actions/core y @actions/github): Ambas bajo licencia MIT.
- Dependencias de desarrollo (@vercel/ncc, jest, eslint y prettier): Todas bajo licencia MIT.
- Compatibilidad legal: Al ser todas las dependencias de tipo permisivo (MIT), existe total libertad para licenciar el proyecto bajo MIT o Apache 2.0 sin incompatibilidades ni restricciones de copyleft.
- Seguridad de dependencias: Se debe integrar la auditoría periódica de vulnerabilidades en el pipeline mediante comprobaciones automáticas de npm audit y herramientas de análisis como OWASP Dependency-Check.

---

## 4. Configuración de la Aplicación y Gestión de Parámetros

Evaluación de parámetros en action.yml:
- La acción define entradas para umbrales de IA (por defecto 50%), activación de SonarCloud (por defecto false) y cobertura mínima exigida (por defecto 80%).
- Desacoplamiento necesario: Actualmente la clave de proyecto de SonarCloud está prefijada en el flujo de integración continua. Debe modificarse para que tome automáticamente el nombre del repositorio actual mediante variables de entorno, evitando configuraciones manuales a terceros.
- Resiliencia y degradación elegante: Si un usuario activa el análisis de calidad pero no proporciona un token válido, la acción debe avisar mediante un mensaje informativo y continuar con el reporte de autoría sin abortar el trabajo del pipeline.

---

## 5. Pruebas, Integración Continua y Automatización

Estado de las comprobaciones automatizadas:
- Batería de pruebas: 21 suites de prueba y 332 tests unitarios en Jest que se ejecutan en aproximadamente 7 segundos con más del 94% de cobertura de código.
- Pipeline de CI en GitHub Actions: Cuenta con tres tareas encadenadas (validación de estilo y pruebas, análisis de calidad con SonarCloud y motor de ciclo de vida).
- Protección de ejecuciones externas: El pipeline omite automáticamente el análisis de SonarCloud cuando la Pull Request proviene de un fork externo, evitando fallos por falta de secretos.
- Automatización pendiente: Crear un flujo de trabajo que, ante la creación de una etiqueta de versión en Git, compile el código fuente con la herramienta ncc y publique la versión empaquetada lista para el Marketplace.

---

## 6. Tres Riesgos Técnicos Críticos y Soluciones

- Riesgo 1: Fallo crítico al ejecutar la acción en repositorios ajenos por ausencia de dist/index.js.  
  Solución: Configurar un flujo de compilación desatendida que empaquete todas las dependencias en un único archivo dentro de las ramas de publicación.
- Riesgo 2: Exposición de grabaciones de voz y correos de estudiantes en el repositorio público.  
  Solución: Ejecutar una limpieza profunda del historial con git-filter-repo eliminando los ficheros multimedia y anonimizando las identidades de autoría.
- Riesgo 3: Errores de ejecución por depender de cuentas personales de SonarCloud.  
  Solución: Convertir SonarCloud en un módulo puramente opcional y desacoplar las claves fijas del repositorio.
