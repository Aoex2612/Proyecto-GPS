/**
 * Tests unitarios para HU01-T06: Selección y reportes de la autoría
 *
 * Responsable asignado en Sprint 1: Pablo García Gómez (PG)
 * Revisor asignado: Germán Peláez Gallardo (GG)
 *
 * Ciclo TDD - Fase Roja (Pruebas antes de la implementación)
 */

const {
  filterContributions,
  groupByAuthor,
  getAuditAlerts,
  formatMarkdownReport,
  formatConsoleSummary,
  buildEnrichedReport,
} = require('../src/reporter/authorship-report');
const { REPORT_MARKER } = require('../src/reporter/pr-notifier');

describe('HU01-T06 - Selección y reportes de la autoría', () => {
  const sampleContributions = [
    {
      sha: 'a1b2c3d',
      author: { name: 'Pablo García', email: 'pablo@example.com' },
      origin: 'human',
      rule: 'no-ai-evidence',
      reason: 'Sin marcas ni herramientas de IA detectadas',
      stats: { additions: 120, elapsedMinutes: 45 },
      message: 'feat: add author reporting module',
    },
    {
      sha: 'e4f5a6b',
      author: { name: 'Pablo García', email: 'pablo@example.com' },
      origin: 'ai-assisted',
      rule: 'co-authored-by-ai',
      reason: 'Trailer Co-authored-by: GitHub Copilot <copilot@github.com>',
      stats: { additions: 40, elapsedMinutes: 10 },
      message: 'feat: add helper utilities\n\nCo-authored-by: GitHub Copilot <copilot@github.com>',
    },
    {
      sha: '7c8d9e0',
      author: { name: 'Ángel López', email: 'angel@example.com' },
      origin: 'human',
      rule: 'no-ai-evidence',
      reason: 'Identidad válida de miembro del equipo',
      stats: { additions: 80, elapsedMinutes: 60 },
      message: 'fix: metadata parser edge cases',
    },
    {
      sha: '1f2e3d4',
      author: { name: 'Desconocido', email: 'anon@example.com' },
      origin: 'unknown',
      rule: 'unverified-author',
      reason: 'No se pudo verificar la identidad ni el origen del commit',
      stats: { additions: 15, elapsedMinutes: 5 },
      message: 'chore: miscellaneous tweaks',
    },
  ];

  const sampleAnalysisResult = {
    delivery: {
      repository: 'Aocx2612/Proyecto-GPS',
      pullRequest: 16,
      baseBranch: 'develop',
      headBranch: 'HU01-T06-seleccion-reportes-autoria',
      commitSha: 'a1b2c3d4e5f6',
    },
    authorship: {
      human: 2,
      aiAssisted: 1,
      unknown: 1,
      total: 4,
      percentage: {
        human: 50.0,
        aiAssisted: 25.0,
        unknown: 25.0,
      },
      lines: {
        human: 200,
        aiAssisted: 40,
        unknown: 15,
        total: 255,
      },
    },
    verdict: {
      status: 'review_required',
      exceedsThreshold: false,
      reasons: [
        'Se han detectado 1 aportación(es) con procedencia desconocida (UNKNOWN) que requieren auditoría.',
      ],
    },
    thresholdAi: 50,
    contributions: sampleContributions,
  };

  // --------------------------------------------------------------------------
  // 1. SELECCIÓN Y FILTRADO DE APORTACIONES
  // --------------------------------------------------------------------------
  describe('filterContributions (Selección y filtrado)', () => {
    test('devuelve todas las aportaciones cuando no se especifican filtros', () => {
      const filtered = filterContributions(sampleContributions);
      expect(filtered).toHaveLength(4);
    });

    test('filtra aportaciones por origen (origin: "human")', () => {
      const human = filterContributions(sampleContributions, { origin: 'human' });
      expect(human).toHaveLength(2);
      expect(human.every((c) => c.origin === 'human')).toBe(true);
    });

    test('filtra aportaciones por origen (origin: "ai-assisted")', () => {
      const ai = filterContributions(sampleContributions, { origin: 'ai-assisted' });
      expect(ai).toHaveLength(1);
      expect(ai[0].sha).toBe('e4f5a6b');
    });

    test('filtra aportaciones por origen (origin: "unknown")', () => {
      const unknown = filterContributions(sampleContributions, { origin: 'unknown' });
      expect(unknown).toHaveLength(1);
      expect(unknown[0].sha).toBe('1f2e3d4');
    });

    test('filtra aportaciones por autor (nombre insensible a mayúsculas/minúsculas)', () => {
      const pablo = filterContributions(sampleContributions, { author: 'pablo garcía' });
      expect(pablo).toHaveLength(2);
      expect(pablo.every((c) => c.author.name === 'Pablo García')).toBe(true);
    });

    test('filtra aportaciones por autor (email)', () => {
      const angel = filterContributions(sampleContributions, { author: 'angel@example.com' });
      expect(angel).toHaveLength(1);
      expect(angel[0].author.name).toBe('Ángel López');
    });

    test('filtra aportaciones por regla activada', () => {
      const copilot = filterContributions(sampleContributions, { rule: 'co-authored-by-ai' });
      expect(copilot).toHaveLength(1);
      expect(copilot[0].rule).toBe('co-authored-by-ai');
    });

    test('soporta filtros combinados (autor y origen)', () => {
      const combined = filterContributions(sampleContributions, {
        author: 'Pablo',
        origin: 'ai-assisted',
      });
      expect(combined).toHaveLength(1);
      expect(combined[0].sha).toBe('e4f5a6b');
    });

    test('devuelve array vacío si la lista de entrada no es válida o está vacía', () => {
      expect(filterContributions(null)).toEqual([]);
      expect(filterContributions([])).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // 2. AGRUPACIÓN Y MÉTRICAS POR AUTOR
  // --------------------------------------------------------------------------
  describe('groupByAuthor (Agregación por colaborador)', () => {
    test('agrupa y calcula métricas individuales de cada autor', () => {
      const authors = groupByAuthor(sampleContributions);

      expect(authors).toHaveLength(3);

      const pablo = authors.find((a) => a.name === 'Pablo García');
      expect(pablo).toBeDefined();
      expect(pablo.totalCommits).toBe(2);
      expect(pablo.humanCommits).toBe(1);
      expect(pablo.aiCommits).toBe(1);
      expect(pablo.unknownCommits).toBe(0);
      expect(pablo.totalLines).toBe(160);
      expect(pablo.humanLines).toBe(120);
      expect(pablo.aiLines).toBe(40);
      expect(pablo.aiPercentage).toBe(50.0);
      expect(pablo.humanPercentage).toBe(50.0);

      const angel = authors.find((a) => a.name === 'Ángel López');
      expect(angel).toBeDefined();
      expect(angel.totalCommits).toBe(1);
      expect(angel.humanCommits).toBe(1);
      expect(angel.aiCommits).toBe(0);
      expect(angel.totalLines).toBe(80);
      expect(angel.humanPercentage).toBe(100.0);
      expect(angel.aiPercentage).toBe(0.0);
    });

    test('maneja commits sin nombre de autor asignándolos a Desconocido', () => {
      const anonymous = [{ sha: '999', origin: 'human', stats: { additions: 10 } }];
      const authors = groupByAuthor(anonymous);
      expect(authors).toHaveLength(1);
      expect(authors[0].name).toBe('Desconocido');
      expect(authors[0].totalCommits).toBe(1);
    });

    test('devuelve array vacío si no hay aportaciones', () => {
      expect(groupByAuthor([])).toEqual([]);
      expect(groupByAuthor(null)).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // 3. EXTRACCIÓN DE ALERTAS DE AUDITORÍA
  // --------------------------------------------------------------------------
  describe('getAuditAlerts', () => {
    test('identifica advertencia cuando existen aportaciones desconocidas', () => {
      const alerts = getAuditAlerts(sampleAnalysisResult);
      const unknownAlert = alerts.find((a) => a.type === 'unknown_authorship');
      expect(unknownAlert).toBeDefined();
      expect(unknownAlert.severity).toBe('warning');
      expect(unknownAlert.count).toBe(1);
    });

    test('identifica error cuando se supera el umbral de IA', () => {
      const exceededResult = {
        ...sampleAnalysisResult,
        authorship: {
          ...sampleAnalysisResult.authorship,
          percentage: { human: 20.0, aiAssisted: 80.0, unknown: 0.0 },
        },
        verdict: {
          status: 'review_required',
          exceedsThreshold: true,
          reasons: ['El porcentaje de código asistido por IA (80%) supera el umbral (50%).'],
        },
      };

      const alerts = getAuditAlerts(exceededResult);
      const thresholdAlert = alerts.find((a) => a.type === 'threshold_exceeded');
      expect(thresholdAlert).toBeDefined();
      expect(thresholdAlert.severity).toBe('error');
    });

    test('devuelve lista limpia si el análisis pasa al 100% sin alertas', () => {
      const cleanResult = {
        authorship: {
          human: 5,
          aiAssisted: 0,
          unknown: 0,
          total: 5,
          percentage: { human: 100, aiAssisted: 0, unknown: 0 },
        },
        verdict: { status: 'passed', exceedsThreshold: false, reasons: [] },
        thresholdAi: 50,
        contributions: [],
      };

      const alerts = getAuditAlerts(cleanResult);
      expect(alerts).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // 4. GENERACIÓN DEL REPORTE MARKDOWN PARA PULL REQUESTS
  // --------------------------------------------------------------------------
  describe('formatMarkdownReport (Generación de informe enriquecido)', () => {
    test('incluye el encabezado, estado de auditoría y badge', () => {
      const markdown = formatMarkdownReport(sampleAnalysisResult);

      expect(markdown).toContain('## 📊 Informe de Auditoría de Autoría y Calidad');
      expect(markdown).toContain('REVISIÓN REQUERIDA');
      expect(markdown).toContain('Aocx2612/Proyecto-GPS');
      expect(markdown).toContain('PR #16');
    });

    test('genera tabla cuantitativa completa con métricas de commits y líneas', () => {
      const markdown = formatMarkdownReport(sampleAnalysisResult);

      expect(markdown).toContain('| Origen | Aportaciones | % Aportaciones | Líneas | % Líneas |');
      expect(markdown).toContain('Humana');
      expect(markdown).toContain('Asistida por IA');
      expect(markdown).toContain('Desconocida');
      expect(markdown).toContain('200');
      expect(markdown).toContain('40');
      expect(markdown).toContain('255');
    });

    test('incluye sección de comparación con el umbral configurado', () => {
      const markdown = formatMarkdownReport(sampleAnalysisResult);

      expect(markdown).toContain('Umbral máximo tolerado de IA');
      expect(markdown).toContain('50%');
      expect(markdown).toContain('25%');
    });

    test('incluye tabla de desglose por colaborador/autor', () => {
      const markdown = formatMarkdownReport(sampleAnalysisResult);

      expect(markdown).toContain('### 👥 Desglose por Colaborador');
      expect(markdown).toContain('Pablo García');
      expect(markdown).toContain('Ángel López');
    });

    test('incluye detalle de aportaciones que requieren atención (IA / Unknown)', () => {
      const markdown = formatMarkdownReport(sampleAnalysisResult);

      expect(markdown).toContain('### 🔍 Detalle de Aportaciones Auditadas');
      expect(markdown).toContain('`e4f5a6b`');
      expect(markdown).toContain('co-authored-by-ai');
      expect(markdown).toContain('`1f2e3d4`');
      expect(markdown).toContain('unverified-author');
    });

    test('muestra estado APROBADO (PASSED) cuando la entrega cumple todos los criterios', () => {
      const passedResult = {
        delivery: { repository: 'Aocx2612/Proyecto-GPS', pullRequest: 10 },
        authorship: {
          human: 4,
          aiAssisted: 1,
          unknown: 0,
          total: 5,
          percentage: { human: 80.0, aiAssisted: 20.0, unknown: 0.0 },
          lines: { human: 100, aiAssisted: 10, unknown: 0, total: 110 },
        },
        verdict: { status: 'passed', exceedsThreshold: false, reasons: [] },
        thresholdAi: 50,
        contributions: [
          {
            sha: '1234567',
            author: { name: 'Pablo García' },
            origin: 'human',
            rule: 'no-ai-evidence',
            reason: 'Commit humano',
            stats: { additions: 100 },
          },
        ],
      };

      const markdown = formatMarkdownReport(passedResult);
      expect(markdown).toContain('APROBADO');
      expect(markdown).not.toContain('REVISIÓN REQUERIDA');
    });

    test('maneja análisis sin aportaciones (entrega vacía) limpiamente', () => {
      const emptyResult = {
        authorship: {
          human: 0,
          aiAssisted: 0,
          unknown: 0,
          total: 0,
          percentage: { human: 0, aiAssisted: 0, unknown: 0 },
          lines: { human: 0, aiAssisted: 0, unknown: 0, total: 0 },
        },
        verdict: { status: 'passed', exceedsThreshold: false, reasons: [] },
        thresholdAi: 50,
        contributions: [],
      };

      const markdown = formatMarkdownReport(emptyResult);
      expect(markdown).toContain('Sin aportaciones detectadas en esta entrega');
    });
  });

  // --------------------------------------------------------------------------
  // 5. RESUMEN PARA CONSOLA / LOGS
  // --------------------------------------------------------------------------
  describe('formatConsoleSummary', () => {
    test('genera una línea concisa para salida en logs de GitHub Actions', () => {
      const summary = formatConsoleSummary(sampleAnalysisResult);
      expect(summary).toContain('Autoría:');
      expect(summary).toContain('Humana: 50%');
      expect(summary).toContain('IA: 25%');
      expect(summary).toContain('Desconocida: 25%');
      expect(summary).toContain('Estado: review_required');
    });
  });

  // --------------------------------------------------------------------------
  // 6. INTEGRACIÓN CON NOTIFICADOR DE PR (buildEnrichedReport)
  // --------------------------------------------------------------------------
  describe('buildEnrichedReport (Integración con PR Notifier)', () => {
    test('construye el objeto de publicación con el cuerpo markdown y el marcador', () => {
      const report = buildEnrichedReport(sampleAnalysisResult, {
        owner: 'Aocx2612',
        repo: 'Proyecto-GPS',
        pullNumber: 16,
      });

      expect(report.owner).toBe('Aocx2612');
      expect(report.repo).toBe('Proyecto-GPS');
      expect(report.pullNumber).toBe(16);
      expect(report.body).toContain(REPORT_MARKER);
      expect(report.body).toContain('## 📊 Informe de Auditoría de Autoría y Calidad');
      expect(report.authorship).toEqual(sampleAnalysisResult.authorship);
    });
  });
});
