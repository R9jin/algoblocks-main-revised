"""
Explanation Signals

Dataclasses used to carry structural/complexity signals between the
pattern visitor and the educational insight generator (formerly the
top of semantic_nlg.py).
"""
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set

# =========================================================================
# DATACLASSES & SIGNAL TRACKING
# =========================================================================

@dataclass
class BigOInfo:
    raw: str
    normalized: str
    family: str
    factors: Dict[str, Any]

@dataclass
class MemorySignals:
    allocates_lists: bool = False
    allocates_2d_lists: bool = False
    allocates_dicts: bool = False
    allocates_sets: bool = False
    uses_list_comprehension: bool = False
    uses_dict_comprehension: bool = False
    uses_set_comprehension: bool = False
    uses_generator: bool = False
    performs_slicing: bool = False
    string_concatenation_in_loop: bool = False
    geometric_capacity_growth: bool = False
    tracks_visited_nodes: bool = False
    recursive_stack_risk: bool = False
    efficient_deque_pop: bool = False
    set_and_dict_updates: bool = False
    caches_results: bool = False
    dp_tabulation_array: bool = False
    array_preallocation: bool = False
    inplace_swap: bool = False
    # newly added coverage
    creates_new_list_from_concat: bool = False
    uses_string_multiplication: bool = False
    uses_join_for_strings: bool = False
    allocates_view_object: bool = False
    uses_heap: bool = False
    allocates_counter: bool = False
    sorted_makes_a_copy: bool = False

@dataclass
class ComplexitySignals:
    inefficient_list_pop: bool = False
    inefficient_list_insert: bool = False
    repeated_sort: bool = False
    membership_in_list: bool = False
    heavy_math_operations: bool = False
    quadratic_math: bool = False
    set_mathematical_ops: bool = False
    dict_lookup_constant: bool = False
    amortized_operation: bool = False
    aggregation_in_loop: bool = False
    bitwise_operations: bool = False
    boolean_short_circuit: bool = False
    f_string_usage: bool = False
    exception_control_flow: bool = False
    # newly added coverage
    linear_string_op: bool = False
    list_reverse_op: bool = False
    list_count_op: bool = False
    type_conversion: bool = False
    heap_push_pop: bool = False
    binary_search_module: bool = False
    itertools_usage: bool = False
    iteration_helper_usage: bool = False  # zip / enumerate / map / filter
    lru_cache_decorator: bool = False
    dict_view_iteration: bool = False

@dataclass
class AlgorithmicParadigms:
    is_halving: bool = False
    is_doubling: bool = False
    is_two_pointer: bool = False
    is_sliding_window: bool = False
    is_fast_slow_pointer: bool = False
    is_grid_traversal: bool = False
    is_memoization_check: bool = False
    is_tabulation_setup: bool = False
    is_brian_kernighan: bool = False
    is_fibonacci_sequence: bool = False
    is_bfs_queue: bool = False
    is_dfs_stack: bool = False
    is_modulo_arithmetic: bool = False
    is_matrix_math: bool = False
    is_combinatorics: bool = False
    is_euclidean_distance: bool = False
    is_prefix_sum: bool = False
    is_bitmasking: bool = False
    # newly added coverage
    is_priority_queue: bool = False
    is_union_find: bool = False
    is_kadane: bool = False

@dataclass
class PatternSignals:
    loop_depth: int = 0
    nested_loops: bool = False
    has_recursion: bool = False
    indirect_recursion: bool = False
    recursion_branching: Optional[str] = None
    has_backtracking_risk: bool = False
    has_memoization: bool = False
    recursion_in_loop: bool = False
    membership_in_loop: bool = False
    comprehension_expansion: bool = False
    graph_traversal: bool = False
    visited_tracking: bool = False
    repeated_calls_in_loop: bool = False
    has_early_exits: bool = False
    has_continue: bool = False
    inline_ternary: bool = False
    string_interpolation: bool = False
    variable_swapping: bool = False
    has_comment_block: bool = False
    has_docstring: bool = False
    uses_try_except: bool = False
    uses_context_manager: bool = False
    uses_lambda: bool = False
    uses_yield: bool = False
    uses_raise: bool = False
    uses_assert: bool = False
    # newly added coverage
    uses_delete: bool = False
    uses_global_or_nonlocal: bool = False
    uses_walrus: bool = False
    uses_star_unpacking: bool = False
    creates_view_object: bool = False

    memory_signals: MemorySignals = field(default_factory=MemorySignals)
    complexity_signals: ComplexitySignals = field(default_factory=ComplexitySignals)
    paradigms: AlgorithmicParadigms = field(default_factory=AlgorithmicParadigms)
    extra_notes: List[str] = field(default_factory=list)


# =========================================================================
# COMPREHENSIVE AST VISITOR
# =========================================================================
