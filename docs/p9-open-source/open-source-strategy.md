# Estrategia y Alcance Open Source (open-source-strategy.md)

**Proyecto:** ai-authorship-qa-action (GitHub Action para auditoría de autoría y calidad en PRs)  
**Asignatura:** Gestión de Proyectos Software (Universidad de Málaga)  
**Subequipo A:** Jesús Cañete García y Candela Marco Jiménez  

---

## 1. Objetivo de Abrir el Proyecto y Beneficios Esperados

El proyecto automatiza la auditoría de Pull Requests clasificando las aportaciones entre código humano, asistido por IA o desconocido, orquestando el control de calidad en la integración continua. La apertura del proyecto responde a una decisión estratégica consciente y no a la incapacidad de mantenerlo en solitario.

Los objetivos principales son:
- Validar y enriquecer las reglas de detección de IA con casos reales de múltiples repositorios públicos.
- Distribuir la herramienta a través del GitHub Marketplace para facilitar su uso con una sola línea en pipelines de GitHub Actions.
- Evitar que el software muera tras finalizar el curso académico, creando una base comunitaria que lo mantenga y evolucione.

Beneficios esperados:
- Para el equipo promotor: Repartir el esfuerzo de mantenimiento, atraer ideas externas y dar visibilidad técnica al trabajo realizado.
- Para los usuarios: Disponer de una herramienta gratuita, ligera y automatizada para auditar el uso de IA y asegurar que no degrade la calidad del código.
- Para los colaboradores: Participar en un proyecto con alta calidad de ingeniería (más de 300 pruebas unitarias y cobertura superior al 94%) donde aportar mejoras en detección y reportería.

---

## 2. Componentes que se Publican y Componentes que Quedan Fuera

Decisiones de alcance y delimitación:

- Se publica el código fuente completo ubicado en src: clasificador de autoría, detector de metadatos de Git, motor de integración continua, cliente de calidad SonarCloud, notificador de Pull Requests y utilidades comunes.
- Se publica la suite de pruebas unitarias y mocks en tests: imprescindible para que cualquier contribuidor verifique que no introduce regresiones.
- Se publica el manifiesto de la acción action.yml y la configuración de dependencias package.json.
- Se publica la documentación técnica de arquitectura y diseño situada en docs.
- Queda totalmente fuera la carpeta daily-scrum: contiene archivos de audio de reuniones internas (como una grabación de 15 MB) que vulneran la privacidad de los alumnos (RGPD) y consumen espacio innecesario.
- Quedan fuera las actas de reunión internas de clase, matrices de reparto de tareas docentes y archivos de calificación de la asignatura.
- Se refactoriza y desvincula la configuración personal de SonarCloud para que no apunte a cuentas particulares de alumnos ni exponga identificadores privados.

---

## 3. Identificación de Usuarios y Colaboradores Potenciales

Usuarios potenciales:
- Mantenedores de proyectos de código abierto que reciben Pull Requests generadas masivamente por herramientas de IA y necesitan evaluar su procedencia.
- Equipos de desarrollo empresarial y responsables de cumplimiento que aplican políticas de IA responsable y control de deuda técnica en sus pipelines.
- Docentes universitarios que requieren auditar el código entregado por los alumnos en prácticas de programación.

Colaboradores potenciales:
- Desarrolladores de JavaScript y Node.js interesados en optimizar heurísticas de expresiones regulares, parseo de diffs e interacción con la API de GitHub.
- Especialistas en DevOps y CI/CD que deseen portar la acción a otras plataformas como GitLab CI o generar informes en formato SARIF.
- Investigadores y estudiantes de ciencia de datos que busquen aportar modelos de detección basados en análisis de árbol sintáctico (AST) o patrones de escritura.

---

## 4. Madurez del Proyecto y Funcionalidades Pendientes

Estado de madurez:
- El proyecto se encuentra en estado de beta funcional avanzada (MVP al cierre del Sprint 1).
- Dispone de 332 pruebas unitarias pasando al 100%, una cobertura de código superior al 94% y un pipeline de integración continua con control de tiempos y reintentos automáticos ante caídas de red.

Funcionalidades no preparadas para producción abierta:
- Falta el archivo compilado de distribución (dist/index.js): el manifiesto apunta a este fichero, pero al estar ignorado en el repositorio, la acción no funciona actualmente si un tercero intenta instalarla desde GitHub.
- La detección de IA depende principalmente de metadatos y trailers de commits; el análisis heurístico directo sobre el contenido del código está en fase embrionaria.
- El análisis de calidad está fuertemente acoplado a SonarCloud y requiere tokens de pago o cuentas públicas específicas, impidiendo su uso libre en modo desconectado.

---

## 5. Tres Prioridades para el Éxito de la Apertura

- Prioridad 1: Empaquetar y publicar en GitHub Marketplace. Automatizar la compilación para generar el archivo final en cada versión, permitiendo que cualquier repositorio use la acción de forma directa e inmediata.
- Prioridad 2: Implementar un modo de funcionamiento autónomo (Zero-Config). Permitir que la acción audite autoría de IA de forma totalmente gratuita y útil sin exigir cuenta ni token de SonarCloud.
- Prioridad 3: Facilitar la incorporación comunitaria con tareas iniciales. Publicar una guía de contribución clara donde el entorno se configure en menos de 5 minutos, acompañando el repositorio de tareas sencillas etiquetadas para principiantes.
