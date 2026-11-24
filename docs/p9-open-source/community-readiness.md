# Licencia, Documentación y Colaboración (community-readiness.md)

**Proyecto:** ai-authorship-qa-action (GitHub Action para auditoría de autoría y calidad en PRs)  
**Asignatura:** Gestión de Proyectos Software (Universidad de Málaga)  
**Subequipo C:** Ángel López Sánchez y Alejandro Jesús Ortiz Zamora  

---

## 1. Elección y Justificación de la Licencia

Se selecciona la Licencia MIT para el proyecto.

Justificación de la elección:
- Compatibilidad directa con el ecosistema: Las dependencias centrales de la acción (@actions/core y @actions/github) están bajo licencia MIT.
- Adopción sin fricción: Más del 80% de las GitHub Actions publicadas en el Marketplace oficial utilizan licencias permisivas. Muchas organizaciones y proyectos tienen políticas que restringen el uso de acciones con licencias de copyleft fuerte (como GPLv3) por temor a contingencias legales sobre su código privado.
- Simplicidad: Otorga libertad total para utilizar, modificar y redistribuir el software, facilitando la máxima adopción tanto en el ámbito universitario como en la industria.

---

## 2. Contenido Mínimo del README

El archivo README principal debe diseñarse para resolver las dudas de un nuevo usuario en menos de 5 minutos, incluyendo:
- Descripción clara del propósito: Explicar en un párrafo qué problema resuelve la acción (auditoría automática de autoría humana frente a IA y control de calidad en Pull Requests).
- Insignias de estado: Mostrar el estado de la integración continua, el Quality Gate de SonarCloud, la versión mínima de Node.js (v20) y la licencia MIT.
- Guía de inicio rápido: Ejemplo conciso de cómo incorporar la acción en un archivo de workflow de GitHub Actions sin configuraciones innecesarias.
- Catálogo de parámetros: Lista explicativa de todas las opciones configurables (umbrales de porcentaje de IA, activación de SonarCloud y coberturas mínimas) indicando sus valores predeterminados.
- Salidas del análisis: Descripción de los resultados que genera la acción (resumen en el panel de ejecución y comentario detallado en la Pull Request).
- Enlaces comunitarios: Accesos directos a la guía de contribución, el código de conducta y el canal de incidencias.

---

## 3. Reporte de Errores y Peticiones de Funcionalidad

Proceso para la gestión de incidencias:
- Formularios guiados en GitHub Issues: Creación de dos plantillas estructuradas dentro de .github/ISSUE_TEMPLATE para estandarizar las aportaciones.
- Plantilla de reporte de errores: Solicita versión de la acción, sistema operativo del runner, comportamiento esperado frente al obtenido, pasos exactos para reproducirlo y fragmento de logs limpios de secretos.
- Plantilla de petición de características: Exige describir la necesidad concreta, el caso de uso y la solución o alternativa propuesta.
- Compromiso de primera respuesta (First Responder): Se asigna una guardia semanal entre los integrantes del equipo para garantizar un primer acuse de recibo y triaje de cualquier incidencia en un plazo máximo de 48 horas laborables.

---

## 4. Normas para Pull Requests y Definition of Done

Criterios de colaboración reflejados en CONTRIBUTING.md:
- Estrategia de ramas: Las contribuciones deben partir y solicitar integración contra la rama de desarrollo continuo (develop), manteniendo la rama principal (main) exclusivamente para versiones estables publicadas.
- Flujo de trabajo: Todo cambio debe estar vinculado a una incidencia previa y utilizar una rama descriptiva con el identificador de la tarea.
- Requisitos de aceptación de cambios:
  - Las pruebas unitarias deben ejecutarse y aprobarse al 100% mediante Jest.
  - El código debe cumplir los estándares de estilo sin errores ni avisos de ESLint y Prettier.
  - Para colaboradores externos que resuelvan tareas sencillas, se exige una cobertura mínima del 80% sobre el código nuevo, sin exigirles la recompilación manual del paquete final.
  - Toda Pull Request requiere la revisión y aprobación de al menos un miembro del equipo antes de su fusión.

---

## 5. Código de Conducta

Se adopta formalmente el estándar internacional Contributor Covenant en su versión 2.1:
- Objetivo: Garantizar un espacio de colaboración libre de acoso, inclusivo y respetuoso para personas de cualquier nivel de experiencia o contexto.
- Canales de reporte: Los incidentes de conducta se comunicarán de manera confidencial a una dirección de correo institucional del proyecto, gestionada de forma neutral por los coordinadores del equipo.
- Procedimiento de resolución: Se establece un protocolo gradual de cuatro niveles según la gravedad del hecho: aviso privado formativo, advertencia formal por escrito, suspensión temporal de interacción en el repositorio y expulsión definitiva del proyecto.

---

## 6. Tres Tareas Iniciales para Principiantes (Good First Issues)

Tareas reales y delimitadas sobre el código del proyecto para nuevos colaboradores:
- Tarea 1: Soporte para identificadores de autoría personalizados en los metadatos de Git. Ampliar el analizador en src/git/metadata-parser.js para reconocer etiquetas en commits como Generated-By o AI-Assisted-By además de las habituales de coautoría.
- Tarea 2: Reporte colapsable en Markdown para Pull Requests. Modificar la generación del informe en src/reporter/authorship-report.js para presentar la lista de commits dentro de un bloque desplegable, evitando comentarios excesivamente largos en Pull Requests con muchos cambios.
- Tarea 3: Regla para ignorar commits automáticos de mantenimiento. Añadir un filtro en src/classifier/authorship-classifier.js que excluya del análisis de autoría los commits generados automáticamente por herramientas de dependencias (como Dependabot o Renovate) y los mensajes estándar de fusión de ramas.
