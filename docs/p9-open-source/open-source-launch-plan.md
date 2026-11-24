# Plan de Lanzamiento e Integración Open Source (open-source-launch-plan.md)

**Proyecto:** ai-authorship-qa-action (GitHub Action para auditoría de autoría y calidad en PRs)  
**Asignatura:** Gestión de Proyectos Software (Universidad de Málaga)  
**Equipo Completo:** Candela Marco, Jesús Cañete, Félix Jiménez, Germán Peláez, Ángel López, Alejandro Jesús Ortiz, Jorge Torres y Pablo García  

---

## 1. Síntesis de Decisiones por Subequipo

- Subequipo A (Estrategia y Alcance): Plantea abrir el proyecto para distribuir la herramienta en GitHub Marketplace, validando las reglas de detección de IA con repositorios reales. Excluye archivos internos de Scrum y audios de reuniones, e introduce el modo Zero-Config para operar sin SonarCloud.
- Subequipo B (Preparación Técnica y Seguridad): Confirma la compatibilidad total de dependencias bajo licencia MIT. Exige la compilación del archivo ejecutable dist/index.js antes de publicar y el saneamiento del historial de Git con herramientas de higienización para purgar grabaciones de voz y correos de alumnos.
- Subequipo C (Licencia, Documentación y Colaboración): Selecciona la licencia MIT, diseña un README para instalar en menos de 5 minutos, establece plantillas guiadas de incidencias, define un SLA de respuesta en 48 horas y propone tres tareas iniciales para nuevos colaboradores.
- Subequipo D (Gobernanza y Sostenibilidad): Crea un Comité Técnico de cuatro miembros, organiza la revisión mediante propietarios de código por submódulo, implementa parejas de trabajo para eliminar la dependencia de una sola persona y propone un modelo económico mixto con donaciones comunitarias y servicios avanzados para organizaciones.

---

## 2. Incoherencias Detectadas y Resoluciones Consensuadas (Actividad 3)

Al contrastar los entregables de los cuatro subequipos se detectaron cinco tensiones clave que se resolvieron en común:

- Incoherencia 1 (Licencia y modelo de negocio): El Subequipo D exploró licencias con reserva de patentes para monetizar, mientras los Subequipos A y C exigían MIT para maximizar la adopción.  
  Resolución: Se adopta la Licencia MIT para la GitHub Action completa. La sostenibilidad comercial se apoyará en una plataforma web complementaria para empresas y en servicios de consultoría, manteniendo la acción de integración continua totalmente libre.

- Incoherencia 2 (Exigencia del Definition of Done a colaboradores externos): Los Subequipos B y C exigían un 94% de cobertura de pruebas y recompilación manual del paquete final, lo que chocaba con la facilidad de entrada que pedía el Subequipo A.  
  Resolución: Se acuerda un criterio escalonado. Para aportaciones comunitarias en tareas sencillas solo se exigirá un 80% de cobertura en el código nuevo y pasar las pruebas existentes. Un sistema automático recompilará el paquete ejecutable tras la integración del cambio.

- Incoherencia 3 (Tiempos de respuesta frente a consenso en decisiones): El Subequipo D proponía una espera de 72 horas para validar propuestas por consenso tácito, lo que retrasaba la meta de responder en 48 horas planteada por el Subequipo C.  
  Resolución: El plazo de 72 horas de consenso tácito se aplicará exclusivamente a debates sobre la arquitectura general del sistema y cambios en el manifiesto. Los fallos cotidianos y mejoras menores se gestionarán de forma directa y ágil por el revisor de cada submódulo en menos de 48 horas.

- Incoherencia 4 (Acoplamiento a SonarCloud frente a modo autónomo): El Subequipo B diseñó el flujo asumiendo que siempre existía SonarCloud, mientras que el Subequipo A priorizaba que cualquier usuario pudiera usar la acción gratis sin registrarse en servicios externos.  
  Resolución: Se establece que SonarCloud esté desactivado por defecto. La acción auditará la autoría de IA de manera completamente autónoma. Si el usuario decide activar SonarCloud, la clave del proyecto se deducirá de forma dinámica a partir de las variables de su propio repositorio.

- Incoherencia 5 (Publicación continua frente a control de versiones): El Subequipo B propuso publicar automáticamente en el Marketplace ante cualquier etiqueta nueva en Git, mientras el Subequipo D exigía supervisión colegiada.  
  Resolución: La integración continua compilará y probará el código generando un borrador de versión, pero la publicación definitiva en el catálogo público de GitHub Marketplace requerirá la aprobación y firma manual de al menos dos miembros del Comité Técnico.

---

## 3. Roadmap de Apertura del Proyecto

Fase 1: Antes de Publicar
- Anonimizar los correos electrónicos del historial hacia alias genéricos de GitHub.
- Añadir el archivo LICENSE oficial con el texto de la Licencia MIT.
- Incorporar el archivo CODEOWNERS, las plantillas de incidencias y la guía CONTRIBUTING.md.
- Configurar la compilación automática con la herramienta ncc para generar el archivo dist/index.js.

Fase 2: Primera Publicación
- Publicar la versión inicial v1.0.0 y vincular la etiqueta flotante v1.
- Publicar la ficha oficial de la acción en el GitHub Marketplace con descripciones y ejemplos claros.
- Abrir el espacio de debate en GitHub Discussions con categorías de preguntas, ideas y anuncios.
- Crear y etiquetar públicamente las tres tareas sencillas para principiantes.

Fase 3: Después de Publicar
- Operar los turnos rotatorios de atención semanal para garantizar respuesta en menos de 48 horas.
- Revisar y fusionar las propuestas de cambio respetando la asignación de propietarios por submódulo.
- Supervisar semanalmente la seguridad de dependencias con Dependabot.
- Evaluar mensualmente los cuatro indicadores de salud para introducir mejoras de gestión.

---

## 4. Indicadores de Salud del Proyecto (Actividad 3)

- Indicador 1: Tiempo de primera respuesta a incidencias.  
  Qué permite detectar: Sensación de comunidad desatendida y abandono del proyecto.  
  Actuación si empeora: Reforzar el sistema de alertas del equipo, reorganizar los turnos semanales de guardia e incorporar respuestas automáticas orientativas para los recién llegados.

- Indicador 2: Concentración de contribuciones en pocas personas.  
  Qué permite detectar: Riesgo de dependencia crítica (Bus Factor) si los desarrolladores principales dejan el proyecto.  
  Actuación si empeora: Obligar a que todas las revisiones se realicen en parejas rotatorias de trabajo y documentar detalladamente las tareas complejas de mantenimiento.

- Indicador 3: Número de nuevos colaboradores externos y retención.  
  Qué permite detectar: Existencia de barreras de entrada altas o documentación confusa.  
  Actuación si empeora: Simplificar los pasos de instalación local en la guía de contribución para que no lleven más de 5 minutos y publicar nuevas tareas iniciales accesibles.

- Indicador 4: Actividad y ritmo de mantenimiento.  
  Qué permite detectar: Riesgo de obsolescencia del código ante cambios en Node.js o en la plataforma de GitHub.  
  Actuación si empeora: Reajustar la carga de trabajo entre los miembros del equipo, promover patrocinios comunitarios o transferir el mantenimiento a una organización universitaria.

---

## 5. Cierre: Respuestas Conjuntas del Equipo (Actividad 4)

- Pregunta 1: ¿Está el proyecto preparado para publicarse hoy? Justificad la respuesta.  
  Respuesta: No. El proyecto carece del archivo compilado final dist/index.js, lo que provocaría un fallo inmediato si alguien intenta usar la acción desde GitHub. Además, el repositorio conserva audios internos de reuniones de clase y correos de alumnos en su historial, y aún no cuenta con un archivo formal de licencia.

- Pregunta 2: ¿Cuál es el principal riesgo de abrirlo en su estado actual?  
  Respuesta: El riesgo técnico y reputacional de publicar una herramienta que falle en su primera ejecución en el Marketplace, arruinando la confianza de los primeros usuarios, sumado al riesgo legal de difundir datos personales y grabaciones de voz de estudiantes sin su consentimiento.

- Pregunta 3: ¿Cuál sería la primera tarea que realizaríais mañana?  
  Respuesta: Ejecutar la higienización del historial con la herramienta git-filter-repo para eliminar de raíz los ficheros multimedia y datos personales, añadiendo al mismo tiempo el archivo de Licencia MIT y la tarea de compilación desatendida del paquete ejecutable.

- Pregunta 4: ¿Qué podría provocar que el proyecto fracasara aunque el código estuviese disponible públicamente?  
  Respuesta: La desatención y falta de mantenimiento tras finalizar el curso universitario, una dificultad excesiva para poner en marcha la acción en repositorios externos, la exigencia de servicios de pago como SonarCloud para tareas básicas, o la falta de respuesta a los reportes de los usuarios externos.
