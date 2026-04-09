import { describe, it, expect } from 'vitest';
import { calculateImpact, renderImpactMarkdown } from '../generators/impact-report.js';
import { DepGraph } from '../utils/dep-graph.js';

const ROOT = '/project';

function makeGraph() {
  const g = new DepGraph();
  // util.ts is imported by service.ts and helper.ts
  g.addEdge(`${ROOT}/service.ts`, `${ROOT}/util.ts`);
  g.addEdge(`${ROOT}/helper.ts`, `${ROOT}/util.ts`);
  // service.ts is imported by controller.ts
  g.addEdge(`${ROOT}/controller.ts`, `${ROOT}/service.ts`);
  return g;
}

describe('calculateImpact', () => {
  it('returns correct impacted files', () => {
    const g = makeGraph();
    const result = calculateImpact(`${ROOT}/util.ts`, ROOT, g);

    const files = result.impacted.map((i) => i.file);
    expect(files).toContain('service.ts');
    expect(files).toContain('helper.ts');
    expect(files).toContain('controller.ts');
    expect(result.totalImpacted).toBe(3);
  });

  it('returns empty when no one imports the file', () => {
    const g = makeGraph();
    const result = calculateImpact(`${ROOT}/controller.ts`, ROOT, g);
    expect(result.totalImpacted).toBe(0);
  });

  it('marks critical files when fan-out >= 3', () => {
    const g = new DepGraph();
    const shared = `${ROOT}/shared.ts`;
    // 3 files import shared (fan-out = 3, critical)
    for (const f of ['a.ts', 'b.ts', 'c.ts']) {
      g.addEdge(`${ROOT}/${f}`, shared);
    }
    // util is imported by shared
    g.addEdge(shared, `${ROOT}/util.ts`);

    const result = calculateImpact(`${ROOT}/util.ts`, ROOT, g);
    expect(result.criticalFiles).toContain('shared.ts');
  });
});

describe('renderImpactMarkdown', () => {
  it('includes changed file in header', () => {
    const g = makeGraph();
    const result = calculateImpact(`${ROOT}/util.ts`, ROOT, g);
    const md = renderImpactMarkdown(result);
    expect(md).toContain('util.ts');
    expect(md).toContain('# Impact Report');
  });

  it('returns no-impact message when empty', () => {
    const g = makeGraph();
    const result = calculateImpact(`${ROOT}/controller.ts`, ROOT, g);
    const md = renderImpactMarkdown(result);
    expect(md).toContain('No other files');
  });
});
