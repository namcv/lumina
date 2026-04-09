/**
 * Directed dependency graph using adjacency lists.
 * Edge A → B means "A imports B".
 */
export class DepGraph {
  /** file → files it imports */
  private edges = new Map<string, Set<string>>();
  /** file → files that import it (reverse) */
  private reverseEdges = new Map<string, Set<string>>();

  addFile(file: string): void {
    if (!this.edges.has(file)) this.edges.set(file, new Set());
    if (!this.reverseEdges.has(file)) this.reverseEdges.set(file, new Set());
  }

  addEdge(from: string, to: string): void {
    this.addFile(from);
    this.addFile(to);
    this.edges.get(from)!.add(to);
    this.reverseEdges.get(to)!.add(from);
  }

  getImports(file: string): string[] {
    return Array.from(this.edges.get(file) ?? []);
  }

  getImportedBy(file: string): string[] {
    return Array.from(this.reverseEdges.get(file) ?? []);
  }

  getAllFiles(): string[] {
    return Array.from(this.edges.keys());
  }

  /**
   * BFS upward: find all files transitively affected when `file` changes.
   * Returns result sorted by depth (most directly affected first).
   */
  getImpacted(file: string): { file: string; depth: number }[] {
    const visited = new Map<string, number>(); // file → depth
    const queue: [string, number][] = [[file, 0]];

    while (queue.length > 0) {
      const [current, depth] = queue.shift()!;
      if (visited.has(current)) continue;
      visited.set(current, depth);

      for (const parent of this.getImportedBy(current)) {
        if (!visited.has(parent)) {
          queue.push([parent, depth + 1]);
        }
      }
    }

    // Exclude the source file itself
    return Array.from(visited.entries())
      .filter(([f]) => f !== file)
      .map(([f, d]) => ({ file: f, depth: d }))
      .sort((a, b) => a.depth - b.depth);
  }

  /**
   * DFS-based cycle detection.
   * Returns array of cycles, each cycle is the list of files forming the loop.
   */
  detectCycles(): string[][] {
    const visited = new Set<string>();
    const stack = new Set<string>();
    const stackArr: string[] = [];
    const cycles: string[][] = [];

    const dfs = (node: string): void => {
      visited.add(node);
      stack.add(node);
      stackArr.push(node);

      for (const neighbor of this.getImports(node)) {
        if (!visited.has(neighbor)) {
          dfs(neighbor);
        } else if (stack.has(neighbor)) {
          // Found a cycle — extract the loop portion
          const cycleStart = stackArr.indexOf(neighbor);
          cycles.push(stackArr.slice(cycleStart).concat(neighbor));
        }
      }

      stack.delete(node);
      stackArr.pop();
    };

    for (const file of this.edges.keys()) {
      if (!visited.has(file)) dfs(file);
    }

    return cycles;
  }

  toJSON(): Record<string, { imports: string[]; importedBy: string[] }> {
    const result: Record<string, { imports: string[]; importedBy: string[] }> = {};
    for (const file of this.edges.keys()) {
      result[file] = {
        imports: this.getImports(file),
        importedBy: this.getImportedBy(file),
      };
    }
    return result;
  }
}
