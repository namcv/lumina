import { describe, it, expect } from 'vitest';
import { DepGraph } from '../utils/dep-graph.js';

describe('DepGraph', () => {
  it('tracks imports and importedBy', () => {
    const g = new DepGraph();
    g.addEdge('a.ts', 'b.ts');
    g.addEdge('a.ts', 'c.ts');
    g.addEdge('d.ts', 'b.ts');

    expect(g.getImports('a.ts')).toEqual(expect.arrayContaining(['b.ts', 'c.ts']));
    expect(g.getImportedBy('b.ts')).toEqual(expect.arrayContaining(['a.ts', 'd.ts']));
    expect(g.getImports('b.ts')).toEqual([]);
  });

  it('getImpacted returns all transitive importers', () => {
    const g = new DepGraph();
    // util → service → controller → app
    g.addEdge('service.ts', 'util.ts');
    g.addEdge('controller.ts', 'service.ts');
    g.addEdge('app.ts', 'controller.ts');

    const impacted = g.getImpacted('util.ts');
    const files = impacted.map((i) => i.file);

    expect(files).toContain('service.ts');
    expect(files).toContain('controller.ts');
    expect(files).toContain('app.ts');
    expect(files).not.toContain('util.ts');
  });

  it('getImpacted assigns correct depths', () => {
    const g = new DepGraph();
    g.addEdge('b.ts', 'a.ts'); // b imports a (depth 1)
    g.addEdge('c.ts', 'b.ts'); // c imports b (depth 2)

    const impacted = g.getImpacted('a.ts');
    const depthMap = Object.fromEntries(impacted.map(({ file, depth }) => [file, depth]));

    expect(depthMap['b.ts']).toBe(1);
    expect(depthMap['c.ts']).toBe(2);
  });

  it('handles circular-like imports without infinite loop', () => {
    const g = new DepGraph();
    g.addEdge('a.ts', 'b.ts');
    g.addEdge('b.ts', 'c.ts');
    g.addEdge('c.ts', 'a.ts'); // cycle

    // Should not throw or loop forever
    expect(() => g.getImpacted('a.ts')).not.toThrow();
  });

  it('toJSON produces correct structure', () => {
    const g = new DepGraph();
    g.addEdge('a.ts', 'b.ts');

    const json = g.toJSON();
    expect(json['a.ts'].imports).toContain('b.ts');
    expect(json['b.ts'].importedBy).toContain('a.ts');
  });
});
