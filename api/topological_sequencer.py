"""
Topological Sequencer

Computes a dependency-ordered visitation sequence over the call graph
so functions are analyzed only after everything they call has already
been resolved -- the "Topological Sequencer (Dependency Ordering)"
stage of the complexity analysis model.
"""
from collections import deque


class TopologicalSequencer:
    """Topological Sequencer (Dependency Ordering). Composed into ComplexityAnalyzer
    as `self.topological_sequencer`; `topological_order` is this component's own
    working state, everything else is read via `self.analyzer`.
    """

    def __init__(self, analyzer):
        self.analyzer = analyzer
        self.topological_order = []

    def compute_topological_order(self):
        """
        PHASE 1 (modified BFS) -- final step: turn the call graph just built
        into a dependency-respecting visiting order for Phase 2, instead of
        only using it for reachability/recursion detection and then leaving
        it unused for traversal order (which is what previously forced a
        blind full-tree pass followed by a second full-tree redo just to
        cope with forward references).

        Functions are first grouped into mutual-dependency clusters (so that
        directly or indirectly recursive functions -- which can't have a
        strict "before/after" order relative to each other -- are treated as
        a single unit), then those clusters are topologically sorted so that
        every callee's cluster is ordered before any cluster that calls it.
        """
        known_funcs = list(self.analyzer.symbol_table.keys())
        deps = {f: set() for f in known_funcs}
        for caller, edges in self.analyzer.call_graph.items():
            if caller not in deps:
                continue
            for e in edges:
                target = e.get('target')
                if target in deps and target != caller:
                    deps[caller].add(target)

        def reachable_from(start):
            seen = set()
            stack = [start]
            while stack:
                curr = stack.pop()
                for nxt in deps.get(curr, ()):
                    if nxt not in seen:
                        seen.add(nxt)
                        stack.append(nxt)
            return seen

        reach = {f: reachable_from(f) for f in known_funcs}

        # Group functions into clusters: f and g share a cluster if each can
        # reach the other (i.e. they're mutually/indirectly recursive).
        group_of = {}
        groups = []
        for f in known_funcs:
            if f in group_of:
                continue
            cluster = {f}
            for g in known_funcs:
                if g != f and g in reach[f] and f in reach.get(g, set()):
                    cluster.add(g)
            gid = len(groups)
            groups.append(cluster)
            for m in cluster:
                group_of[m] = gid

        # Condense into a DAG of clusters, then Kahn's algorithm ordered so
        # that a cluster with no unresolved dependencies (i.e. it calls
        # nothing outside itself that hasn't already been placed) comes
        # first -- this is what guarantees callees precede callers.
        n_groups = len(groups)
        cluster_deps = [set() for _ in range(n_groups)]
        for f in known_funcs:
            a = group_of[f]
            for t in deps[f]:
                b = group_of.get(t)
                if b is not None and b != a:
                    cluster_deps[a].add(b)

        in_degree = [len(cluster_deps[a]) for a in range(n_groups)]
        dependents = [set() for _ in range(n_groups)]
        for a in range(n_groups):
            for b in cluster_deps[a]:
                dependents[b].add(a)

        ready = deque(i for i in range(n_groups) if in_degree[i] == 0)
        order = []
        while ready:
            curr = ready.popleft()
            order.append(curr)
            for a in dependents[curr]:
                in_degree[a] -= 1
                if in_degree[a] == 0:
                    ready.append(a)
        if len(order) < n_groups:
            order.extend(i for i in range(n_groups) if i not in order)

        self.topological_order = []
        for gid in order:
            self.topological_order.extend(groups[gid])

    def visit_functions_topologically(self):
        """
        PHASE 2a (modified DFS, part 1) -- establish every function's
        complexity signature by visiting function bodies in the dependency
        order Phase 1 computed, instead of blindly walking the whole script
        once in raw source order and hoping every callee happened to be
        defined earlier in the file. This replaces the previous "run the
        whole analysis once, then reset and run the whole thing again" fix
        for forward references with a single dependency-correct pre-pass
        that touches only function bodies (not top-level script code).
        """
        for name in getattr(self, 'topological_order', []):
            node = self.analyzer.symbol_table.get(name)
            if node is not None:
                self.analyzer.ast_visitor.visit(node)
