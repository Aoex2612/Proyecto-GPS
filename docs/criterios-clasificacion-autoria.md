# 📄 Criterios para la Distinción de Aportaciones Humanas y Automatizadas

| Metadatos del Documento | Detalle                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------- |
| **Historia de Usuario** | **HU07**: Determinación fiable del origen del trabajo                               |
| **Tarea de Diseño**     | **T01**: Definir los criterios para distinguir aportaciones humanas y automatizadas |
| **Responsable / Autor** | Alejandro Jesús Ortiz Zamora (`AZ`)                                                 |
| **Revisor Asignado**    | Pablo García Gómez (`PG`)                                                           |
| **Estado**              | Propuesta para Revisión                                                             |
| **Versión**             | 1.0.0                                                                               |

---

## 1. 🎯 Objetivo y Contexto

En el marco de la **HU07**, el objetivo primordial es:

> _"Clasificar con exactitud qué partes del trabajo proceden de personas y cuáles de asistentes automatizados, para generar análisis justos sin penalizar erróneamente al autor."_

Este documento establece la **especificación funcional y técnica de los criterios y reglas** que deberá implementar el clasificador de autoría (tarea **HU07-T03**, asignada a Jorge Torres Sánchez) y que servirá de base para el tratamiento de incertidumbre (**HU07-T04**) y almacenamiento de resultados (**HU07-T05**).

---

## 2. ⚖️ Principios Rectores

1. **Determinismo sobre la duda**: La clasificación directa solo debe aplicarse cuando los datos ofrezcan certeza técnica.
2. **Principio de No Penalización Errónea (In dubio pro humano)**: Si existe duda razonable o falta de evidencias concluyentes de uso de IA, la aportación **no** debe etiquetarse arbitrariamente como IA. Debe marcarse como `UNKNOWN` para su posterior auditoría humana (tratado en **T04**).
3. **Auditabilidad**: Todo dictamen de clasificación debe justificar qué criterio o regla se ha activado (metadato, heurística de velocidad o patrón textual).

---

## 3. 🏷️ Categorías de Clasificación de Autoría

Se definen tres estados estándar de procedencia del código:

| Estado (`AuthorshipOrigin`) | Valor           | Definición                                                                                                 |
| --------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------- |
| `HUMAN`                     | `'human'`       | Código atribuido íntegramente a una persona física identificable.                                          |
| `AI_ASSISTED`               | `'ai_assisted'` | Código generado total o parcialmente con asistencia de IA o procesos automatizados.                        |
| `UNKNOWN`                   | `'unknown'`     | Código cuya procedencia no puede determinarse con fiabilidad suficiente a partir de los datos disponibles. |

---

## 4. 🔍 Criterios de Clasificación

### 4.1. Nivel 1: Criterios Deterministas de Metadatos (Certeza 100%)

Son señales directas presentes en el árbol de commits de Git o en la API de GitHub:

1. **Co-autoría declarada (`Co-authored-by`)**:
   - Presencia de trailers `Co-authored-by` en el mensaje del commit que apunten a identidades de IA conocidas (ejemplo: `GitHub Copilot <copilot@github.com>`, `Cursor <...>`, asistentes generativos).
2. **Tipo de cuenta y nombres de Bots**:
   - Atributo de identidad `userType === 'Bot'` o campo `isBot: true` en GitHub.
   - Direcciones de correo o nombres de usuario que sigan el patrón estándar de automatización de GitHub:
     - `*@users.noreply.github.com` con sufijo `[bot]` (ej. `github-actions[bot]`, `dependabot[bot]`).
     - Cuentas de servicio o bots de integración continua.
3. **Trailers explícitos en el commit**:
   - Etiquetas de metadatos estandarizadas añadidas por herramientas:
     - `AI-Assisted: true` / `AI-Assisted: yes`
     - `Generated-by: <nombre_herramienta>`
4. **Marcadores explícitos en el mensaje**:
   - Presencia de etiquetas formales en el título o descripción del commit, tales como `[ai-assisted]` o `[ai-generated]`.

_Resultado de coincidencia en Nivel 1:_ Clasificación inmediata como **`AI_ASSISTED`**.

---

### 4.2. Nivel 2: Criterios Heurísticos y de Comportamiento (IA Encubierta / No Declarada)

Diseñados para detectar casos en los que un usuario humano genera el código con un LLM en su navegador/IDE y realiza commit/push bajo su propia identidad sin declarar trailers.

#### A. Heurística de Velocidad Sobrehumana (Velocity Rate)

- **Concepto**: Comparación entre el volumen neto de líneas de lógica añadidas y el tiempo transcurrido entre commits consecutivos.
- **Métrica**:
  $$\text{Velocidad} = \frac{\text{Líneas añadidas netas}}{\text{Tiempo transcurrido (minutos)}}$$
- **Umbral de referencia**:
  - Un desarrollador humano promedio genera entre 15 y 40 líneas netas de lógica estructurada por hora (o ráfagas de 30-50 líneas cada 15-20 minutos).
  - **Umbral de alerta:** $\mathbf{> 150\text{ líneas/minuto}}$ de código nuevo estructurado.
- **Exclusiones obligatorias (Filtro de falsos positivos)**:
  - Ficheros generados automáticamente por el entorno (`package-lock.json`, `yarn.lock`, bundles en `dist/`).
  - Ficheros de datos estáticos extensos (`.json`, `.csv`, `.svg`).
  - Acciones de renombrado, formateo masivo o generación de _scaffolding_ de frameworks.

#### B. Heurística de Firmas Textuales y Residuos de LLMs

- **Bloques Markdown residuales**:
  - Restos de formato de chat de LLM que se cuelan por copia-pega directo en comentarios o cadenas de texto:
    - Triple acento grave con identificador de lenguaje (ej. `// ```javascript`, `/* ```python */`).
- **Frases conversacionales de cortesía de LLMs**:
  - Comentarios introductorios dejados en el código copiados literalmente:
    - _"Here is the implementation of..."_ / _"Aquí tienes la implementación de..."_
    - _"Note: Make sure to replace the placeholder..."_ / _"Nota: Asegúrate de..."_
    - _"This function handles..."_ (en bloques de texto conversacionales).
    - _"As an AI language model..."_ / _"Como modelo de lenguaje..."_

---

## 5. ❓ Criterios de Aportación Humana (`HUMAN`)

Una aportación se clasificará como **`HUMAN`** si y solo si:

1. El autor y committer cuentan con identidades válidas y verificables (nombre y correo electrónico bien formados).
2. El tipo de usuario no es un bot ni pertenece a una cuenta de servicio automatizada.
3. No se detectan trailers ni co-autores de IA.
4. El ritmo de generación de código se encuentra dentro de los rangos fisiológicos normales de un programador.
5. El código no contiene artefactos o firmas textuales residuales de LLMs.

---

## 6. ⚠️ Derivación a Desconocido (`UNKNOWN`) — Interfaz con T04

En concordancia con el principio de no penalización errónea:

- Si se detecta una velocidad anómala (por ejemplo, copia de una función existente de StackOverflow o librería interna), pero **no** hay patrones de LLM ni trailers de IA:
  - **No se clasificará directamente como IA.**
  - Se derivará a **`UNKNOWN`** con un motivo asociado (_"anomalía de velocidad sin confirmación textual"_), permitiendo que la tarea **HU07-T04** defina el tratamiento de dicha incertidumbre y solicite revisión manual.
- Aportaciones sin datos de autor o con metadatos corruptos/ausentes se clasificarán siempre como **`UNKNOWN`**.

---

## 7. 💻 Especificación de Interfaz para la Implementación (HU07-T03)

Para facilitar la labor del desarrollador asignado a la implementación (**Jorge Torres Sánchez - T03**), se propone la siguiente estructura de datos y firmas:

### 7.1. Estructura de Entrada (`contribution`)

```javascript
{
  author: {
    name: string,
    email: string,
    userType?: string, // 'User' | 'Bot'
    isBot?: boolean
  },
  committer?: {
    name: string,
    email: string,
    userType?: string
  },
  coAuthors?: Array<{ name: string, email: string }>,
  trailers?: Record<string, string>,
  message?: string,
  stats?: {
    additions: number,
    deletions: number,
    elapsedMinutes: number
  },
  content?: string // Diffs o código añadido
}
```

### 7.2. Interfaz del Clasificador

```javascript
/**
 * Clasifica una aportación según los criterios definidos en HU07-T01.
 * @param {object} contribution
 * @returns {string} 'human' | 'ai_assisted' | 'unknown'
 */
function classifyOrigin(contribution) {
  // A implementar en HU07-T03 por Jorge Torres Sánchez
}
```

---

## 8. 📋 Resumen para Revisión por Pares (Matriz P4)

- **Revisor asignado:** Pablo García Gómez (`PG`).
- **Puntos a validar en la PR:**
  - [ ] ¿Son los umbrales de velocidad (150 líneas/min) realistas y justos?
  - [ ] ¿Están cubiertos los principales asistentes del mercado (Copilot, ChatGPT, Claude, Cursor)?
  - [ ] ¿Queda garantizado que no se penalizará erróneamente a programadores rápidos (principio pro-humano de T04)?
