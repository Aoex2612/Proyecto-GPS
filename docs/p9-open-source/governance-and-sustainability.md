# Gobernanza y Sostenibilidad (governance-and-sustainability.md)

**Proyecto:** ai-authorship-qa-action (GitHub Action para auditoría de autoría y calidad en PRs)  
**Asignatura:** Gestión de Proyectos Software (Universidad de Málaga)  
**Subequipo D:** Jorge Torres Sánchez y Pablo García Gómez  

---

## 1. Elección y Justificación del Modelo de Gobernanza

Se adopta un modelo de gobernanza basado en un Comité Técnico de Dirección (Technical Steering Committee o TSC):
- Justificación: En un equipo fundacional de ocho personas, un modelo de dictador benevolente (BDFL) crearía un cuello de botella innecesario y desmotivaría al resto. Por otro lado, una meritocracia totalmente formalizada introduciría demasiada burocracia para la fase inicial del proyecto.
- Composición del comité: Formado por los coordinadores de las cuatro áreas principales de la arquitectura (Ángel López en arquitectura, Jesús Cañete en integración continua, Jorge Torres en clasificación y Germán Peláez en calidad y pruebas).
- Evolución futura: A medida que el proyecto gane usuarios en el Marketplace, el comité se renovará anualmente mediante votación de los mantenedores activos, siguiendo modelos de referencia del ecosistema de software libre como Python y la Cloud Native Computing Foundation.

---

## 2. Revisión y Aceptación de Cambios

Estructura de roles y asignación de revisiones:
- Roles del proyecto:
  - Contribuidor: Cualquier persona que envía una propuesta de cambio o reporte.
  - Revisor: Desarrollador con conocimiento específico que evalúa código ajeno tras haber completado varias contribuciones previas.
  - Mantenedor: Miembro con permisos de escritura y fusión sobre submódulos concretos.
  - Miembro del Comité: Administrador responsable de las decisiones estratégicas y de las versiones públicas.
- Asignación por propiedad de código (CODEOWNERS):
  - Módulo de clasificación de autoría (src/classifier): asignado a Jorge Torres, Pablo García y Alejandro Ortiz.
  - Módulo de calidad SonarCloud (src/quality): asignado a Germán Peláez y Félix Jiménez.
  - Módulo de notificaciones e informes (src/reporter): asignado a Jorge Torres, Pablo García y Candela Marco.
  - Manifiesto de la acción y pipelines de integración (.github y action.yml): asignado a Jesús Cañete, Ángel López y Candela Marco.
- Regla de aceptación: Ningún cambio puede integrarse en las ramas protegidas sin superar las pruebas automáticas y contar con la aprobación explícita de al menos un propietario del submódulo afectado.

---

## 3. Resolución de Desacuerdos Técnicos y Estratégicos

Mecanismo formal para dirimir diferencias:
- Consenso tácito (Lazy Consensus): Para decisiones ordinarias de diseño o propuestas de mejora, se abre un debate en las incidencias con un plazo de 72 horas laborables. Si ningún miembro fundamenta una objeción técnica durante ese periodo, la propuesta se considera aprobada ("quien calla otorga").
- Requisito de las objeciones: Cualquier objeción debe venir acompañada obligatoriamente de una justificación técnica y de una alternativa constructiva.
- Escalado y votación: Si el desacuerdo persiste tras el debate, el asunto se eleva al Comité Técnico. Las decisiones operativas se resuelven por mayoría simple (contando el coordinador técnico con voto de desempate), mientras que los cambios arquitectónicos críticos, variaciones en la licencia o modificaciones en el manifiesto exigen una mayoría cualificada de dos tercios.

---

## 4. Plan de Contingencia ante Abandono de Desarrolladores Principales

Medidas para mitigar el riesgo de dependencia crítica (Bus Factor):
- Emparejamiento obligatorio (Lead y Shadow): Cada submódulo del sistema cuenta con un responsable principal y un co-responsable secundario que participan de forma cruzada en las revisiones de código, garantizando que el conocimiento nunca resida en una única persona.
- Manuales operativos documentados: Todos los procedimientos no visibles (como el empaquetado y firmado de nuevas versiones en el Marketplace o la rotación de credenciales) se documentan paso a paso en guías técnicas de ejecución dentro del directorio docs.
- Gestión colegiada de accesos: La titularidad del repositorio y los permisos de publicación en GitHub residen en una organización compartida con tres administradores independientes.
- Protocolo de baja: Si un desarrollador principal abandona el equipo, sus responsabilidades pasan automáticamente a su co-responsable asignado y se rotan los secretos y tokens de acceso en menos de 24 horas por seguridad.

---

## 5. Tres Riesgos de Continuidad y Mitigaciones Operativas

- Riesgo 1: Ruptura del entorno por cambios en el motor de Node.js o en la infraestructura de GitHub Actions.  
  Mitigación: Empaquetar todo el código y sus dependencias en un único ejecutable hermético con la herramienta ncc y ejecutar pruebas automatizadas programadas semanalmente para detectar incompatibilidades de forma temprana.
- Riesgo 2: Bloqueo de análisis por caídas de servicio o límites de uso en la API de SonarCloud.  
  Mitigación: Implementar reintentos automáticos con espera exponencial y asegurar que la acción continúe su flujo en modo degradado si SonarCloud no responde, sin hacer fallar el pipeline del usuario.
- Riesgo 3: Abandono o falta de tiempo del equipo una vez finalizada la asignatura universitaria.  
  Mitigación: Incorporar bots que automaticen el etiquetado y triaje de incidencias, abrir una vía clara para que colaboradores externos pasen a ser mantenedores y contemplar la transferencia del repositorio a una organización institucional de la universidad o fundación de software libre.

---

## 6. Modelo de Sostenibilidad Económica y de Recursos

Estrategia de viabilidad para una GitHub Action:
- Nivel base de uso libre: El núcleo de la herramienta es 100% gratuito y de código abierto bajo licencia MIT. Al tratarse de una acción de GitHub, el coste de ejecución en servidores lo asume directamente el usuario en su propio repositorio, lo que supone un coste cero de infraestructura para el equipo mantenedor.
- Financiación comunitaria: Habilitación de plataformas de patrocinio (GitHub Sponsors y Open Collective) destinadas a financiar licencias de desarrollo, servidores de prueba y certificaciones.
- Servicios avanzados para organizaciones (Open Core): Desarrollo de un panel web complementario para empresas y universidades que requieran monitorizar de forma centralizada cientos de repositorios, auditar el cumplimiento del Reglamento Europeo de Inteligencia Artificial (EU AI Act) y solicitar soporte profesional o reglas de detección a medida.
