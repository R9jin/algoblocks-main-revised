# Authoring source for the O(n!) records added to processed/.
#
# Every executable line carries a trailing tag "#@ T | S" holding the
# hand-derived worst-case line time and line space (rules in
# GROUND_TRUTH_RULES.md). Tag alphabet: 1 = O(1), n = O(n), n2 = O(n^2),
# f = O(n!). build_factorial_records.py strips the tags, so the stored code
# is plain code, and builds line_metrics from them. No analyzer output is used.

RECORDS = [
    {
        "id": "algo_nfact_299",
        "name": "Print All Permutations of a String (Swap Backtracking)",
        "T": "f", "S": "n",
        "note": "n!=leaves, ~e*n! recursion nodes; each leaf joins n chars, absorbed into n!; space is the recursion depth n, nothing is stored",
        "code": '''# Python program to print all permutations of a
# string using backtracking (swap method)

def permute(a, l, r):  #@ 1|1
    if l == r:  #@ f|1
        print(''.join(a))  #@ f|n
    else:
        for i in range(l, r + 1):  #@ f|1
            a[l], a[i] = a[i], a[l]  #@ f|1
            permute(a, l + 1, r)  #@ f|n
            a[l], a[i] = a[i], a[l]  #@ f|1

# Driver code
if __name__ == "__main__":  #@ 1|1
    a = ["A", "B", "C"]  #@ 1|1
    n = len(a)  #@ 1|1
    permute(a, 0, n - 1)  #@ f|n
''',
    },
    {
        "id": "algo_nfact_300",
        "name": "Generate All Permutations of a List Using a Used Array",
        "T": "f", "S": "f",
        "note": "n! leaves, each stores a copy of size n in res => n*n! cells, absorbed into n!; time ~e*n!*n absorbed",
        "code": '''# Python program to generate all permutations of a
# list using backtracking with a "used" array

def backtrack(nums, path, used, res):  #@ 1|1
    if len(path) == len(nums):  #@ f|1
        res.append(path[:])  #@ f|f
        return  #@ f|1
    for i in range(len(nums)):  #@ f|1
        if used[i]:  #@ f|1
            continue  #@ f|1
        used[i] = True  #@ f|1
        path.append(nums[i])  #@ f|n
        backtrack(nums, path, used, res)  #@ f|n
        path.pop()  #@ f|1
        used[i] = False  #@ f|1

def permutations(nums):  #@ 1|1
    res = []  #@ 1|1
    used = [False] * len(nums)  #@ n|n
    backtrack(nums, [], used, res)  #@ f|f
    return res  #@ 1|1

# Driver code
if __name__ == "__main__":  #@ 1|1
    nums = [1, 2, 3]  #@ 1|1
    result = permutations(nums)  #@ f|f
    for p in result:  #@ f|1
        print(p)  #@ f|1
''',
    },
    {
        "id": "algo_nfact_301",
        "name": "Find All Permutations of a String by Removing One Character (Slicing)",
        "T": "f", "S": "f",
        "note": "calls ~e*n!; each frame returns a list of all permutations of its suffix, so the top frame holds (n-1)! lists and the result holds n! strings of length n => n! space",
        "code": '''# Python program to find all permutations of a string
# by fixing one character and permuting the rest

def permute(s):  #@ 1|1
    if len(s) <= 1:  #@ f|1
        return [s]  #@ f|1
    result = []  #@ f|1
    for i in range(len(s)):  #@ f|1
        rest = s[:i] + s[i + 1:]  #@ f|n
        for p in permute(rest):  #@ f|f
            result.append(s[i] + p)  #@ f|f
    return result  #@ f|1

# Driver code
if __name__ == "__main__":  #@ 1|1
    for p in permute("abc"):  #@ f|f
        print(p)  #@ f|1
''',
    },
    {
        "id": "algo_nfact_302",
        "name": "Generate All Permutations Using Heap's Algorithm",
        "T": "f", "S": "n",
        "note": "Heap's algorithm: T(n)=n*T(n-1)+O(n) => n! leaves and e*n! calls; array permuted in place, space is the recursion depth n",
        "code": '''# Python program to print all permutations of a list
# using Heap's algorithm

def heap_permutation(a, size, n):  #@ 1|1
    if size == 1:  #@ f|1
        print(a)  #@ f|1
        return  #@ f|1
    for i in range(size):  #@ f|1
        heap_permutation(a, size - 1, n)  #@ f|n
        if size % 2 == 1:  #@ f|1
            a[0], a[size - 1] = a[size - 1], a[0]  #@ f|1
        else:
            a[i], a[size - 1] = a[size - 1], a[i]  #@ f|1

# Driver code
if __name__ == "__main__":  #@ 1|1
    a = [1, 2, 3]  #@ 1|1
    n = len(a)  #@ 1|1
    heap_permutation(a, n, n)  #@ f|n
''',
    },
    {
        "id": "algo_nfact_303",
        "name": "Print All Permutations Using Iterative Next Permutation",
        "T": "f", "S": "n",
        "note": "the loop calls next_permutation exactly n! times (once per distinct arrangement of distinct elements); each call costs O(n) at worst, absorbed into n!; the reversed slice is an O(n) temporary",
        "code": '''# Python program to print all permutations of a list
# by repeatedly calling next_permutation

def next_permutation(a):  #@ 1|1
    i = len(a) - 2  #@ f|1
    while i >= 0 and a[i] >= a[i + 1]:  #@ f|1
        i -= 1  #@ f|1
    if i < 0:  #@ f|1
        return False  #@ 1|1
    j = len(a) - 1  #@ f|1
    while a[j] <= a[i]:  #@ f|1
        j -= 1  #@ f|1
    a[i], a[j] = a[j], a[i]  #@ f|1
    a[i + 1:] = reversed(a[i + 1:])  #@ f|n
    return True  #@ f|1

# Driver code
if __name__ == "__main__":  #@ 1|1
    a = [1, 2, 3, 4]  #@ 1|1
    print(a)  #@ 1|1
    while next_permutation(a):  #@ f|n
        print(a)  #@ f|1
''',
    },
    {
        "id": "algo_nfact_304",
        "name": "Travelling Salesman Problem by Brute Force over All Tours",
        "T": "f", "S": "n",
        "note": "fixes city 0 and enumerates the (n-1)! tours by swapping; each tour is costed in O(n), absorbed into n!; space is the recursion depth",
        "code": '''# Python program to solve the travelling salesman problem
# by trying every possible tour (swap backtracking)

INF = float("inf")  #@ 1|1

def tsp(graph, path, l, r, best):  #@ 1|1
    if l == r:  #@ f|1
        cost = 0  #@ f|1
        for k in range(r):  #@ f|1
            cost += graph[path[k]][path[k + 1]]  #@ f|1
        cost += graph[path[r]][path[0]]  #@ f|1
        return min(best, cost)  #@ f|1
    for i in range(l, r + 1):  #@ f|1
        path[l], path[i] = path[i], path[l]  #@ f|1
        best = tsp(graph, path, l + 1, r, best)  #@ f|n
        path[l], path[i] = path[i], path[l]  #@ f|1
    return best  #@ f|1

# Driver code
if __name__ == "__main__":  #@ 1|1
    graph = [[0, 10, 15, 20], [10, 0, 35, 25], [15, 35, 0, 30], [20, 25, 30, 0]]  #@ 1|1
    path = [0, 1, 2, 3]  #@ 1|1
    n = len(path)  #@ 1|1
    print(tsp(graph, path, 1, n - 1, INF))  #@ f|n
''',
    },
    {
        "id": "algo_nfact_305",
        "name": "Sort an Array by Trying Every Permutation Until It Is Sorted",
        "T": "f", "S": "n",
        "note": "worst case: the sorted arrangement is the last of the n! arrangements visited (the visit order is a bijection on inputs); every leaf runs an O(n) sortedness check; return True runs once per stack frame while unwinding",
        "code": '''# Python program to sort an array by trying every
# permutation until a sorted one is found

def is_sorted(a):  #@ 1|1
    for i in range(len(a) - 1):  #@ f|1
        if a[i] > a[i + 1]:  #@ f|1
            return False  #@ f|1
    return True  #@ 1|1

def permutation_sort(a, l):  #@ 1|1
    if l == len(a) - 1:  #@ f|1
        return is_sorted(a)  #@ f|1
    for i in range(l, len(a)):  #@ f|1
        a[l], a[i] = a[i], a[l]  #@ f|1
        if permutation_sort(a, l + 1):  #@ f|n
            return True  #@ n|1
        a[l], a[i] = a[i], a[l]  #@ f|1
    return False  #@ f|1

# Driver code
if __name__ == "__main__":  #@ 1|1
    a = [3, 1, 2]  #@ 1|1
    permutation_sort(a, 0)  #@ f|n
    print(a)  #@ 1|1
''',
    },
    {
        "id": "algo_nfact_306",
        "name": "Count Derangements of 0..n-1 by Brute Force Enumeration",
        "T": "f", "S": "n",
        "note": "enumerates all n! permutations by swapping and checks fixed points at each leaf; the only input is the number n, so n is its value; list(range(n)) is O(n)",
        "code": '''# Python program to count derangements of 0..n-1 by
# generating every permutation and rejecting fixed points

def count_derangements(a, l, n):  #@ 1|1
    if l == n:  #@ f|1
        for i in range(n):  #@ f|1
            if a[i] == i:  #@ f|1
                return 0  #@ f|1
        return 1  #@ f|1
    count = 0  #@ f|1
    for i in range(l, n):  #@ f|1
        a[l], a[i] = a[i], a[l]  #@ f|1
        count += count_derangements(a, l + 1, n)  #@ f|n
        a[l], a[i] = a[i], a[l]  #@ f|1
    return count  #@ f|1

# Driver code
if __name__ == "__main__":  #@ 1|1
    n = 5  #@ 1|1
    a = list(range(n))  #@ n|n
    print(count_derangements(a, 0, n))  #@ f|n
''',
    },
    {
        "id": "algo_nfact_307",
        "name": "Assignment Problem by Brute Force (Try Every Worker-to-Job Matching)",
        "T": "f", "S": "n",
        "note": "assigns workers to jobs with a used array and no pruning: n! complete matchings, ~e*n! nodes; space is the recursion depth plus the used array",
        "code": '''# Python program to solve the assignment problem by
# trying every one-to-one assignment of workers to jobs

def assign(cost, worker, used, current, best):  #@ 1|1
    n = len(cost)  #@ f|1
    if worker == n:  #@ f|1
        return min(best, current)  #@ f|1
    for job in range(n):  #@ f|1
        if not used[job]:  #@ f|1
            used[job] = True  #@ f|1
            best = assign(cost, worker + 1, used, current + cost[worker][job], best)  #@ f|n
            used[job] = False  #@ f|1
    return best  #@ f|1

# Driver code
if __name__ == "__main__":  #@ 1|1
    cost = [[9, 2, 7, 8], [6, 4, 3, 7], [5, 8, 1, 8], [7, 6, 9, 4]]  #@ 1|1
    n = len(cost)  #@ 1|1
    used = [False] * n  #@ n|n
    print(assign(cost, 0, used, 0, float("inf")))  #@ f|n
''',
    },
    {
        "id": "algo_nfact_308",
        "name": "Generate All Permutations by Inserting Each Element into Every Position",
        "T": "f", "S": "f",
        "note": "after k items there are k! lists of length k; the last pass appends n! lists of length n (n*n! cells, absorbed); total sum k*k! is dominated by the last pass",
        "code": '''# Python program to generate all permutations of a list
# by inserting each element at every position

def permutations(items):  #@ 1|1
    result = [[]]  #@ 1|1
    for x in items:  #@ n|1
        new_result = []  #@ n|1
        for p in result:  #@ f|1
            for pos in range(len(p) + 1):  #@ f|1
                new_result.append(p[:pos] + [x] + p[pos:])  #@ f|f
        result = new_result  #@ n|1
    return result  #@ 1|1

# Driver code
if __name__ == "__main__":  #@ 1|1
    items = [1, 2, 3]  #@ 1|1
    for p in permutations(items):  #@ f|f
        print(p)  #@ f|1
''',
    },
    {
        "id": "algo_nfact_309",
        "name": "Print All Distinct Permutations of a String with Repeated Characters",
        "T": "f", "S": "n2",
        "note": "worst case all characters distinct => n! permutations (repeats only shrink the tree); each frame keeps a seen set and a sliced list of size O(n), n frames deep => O(n^2) stack-held space",
        "code": '''# Python program to print all distinct permutations of a
# string that may contain repeated characters

def permute_unique(chars, path, n):  #@ 1|1
    if len(path) == n:  #@ f|1
        print("".join(path))  #@ f|n
        return  #@ f|1
    seen = set()  #@ f|1
    for i in range(len(chars)):  #@ f|1
        if chars[i] in seen:  #@ f|1
            continue  #@ f|1
        seen.add(chars[i])  #@ f|n
        rest = chars[:i] + chars[i + 1:]  #@ f|n
        path.append(chars[i])  #@ f|n
        permute_unique(rest, path, n)  #@ f|n2
        path.pop()  #@ f|1

# Driver code
if __name__ == "__main__":  #@ 1|1
    s = ["A", "B", "C"]  #@ 1|1
    n = len(s)  #@ 1|1
    permute_unique(s, [], n)  #@ f|n2
''',
    },
    {
        "id": "algo_nfact_310",
        "name": "Print All Permutations of the Numbers 1 to n",
        "T": "f", "S": "n",
        "note": "the only input is the number n, so n is its value; used has n+1 flags; n! leaves, ~e*n! nodes; space is the recursion depth plus the path",
        "code": '''# Python program to print all permutations of the
# numbers 1 to n using a used array

def generate(n, path, used):  #@ 1|1
    if len(path) == n:  #@ f|1
        print(path)  #@ f|1
        return  #@ f|1
    for x in range(1, n + 1):  #@ f|1
        if not used[x]:  #@ f|1
            used[x] = True  #@ f|1
            path.append(x)  #@ f|n
            generate(n, path, used)  #@ f|n
            path.pop()  #@ f|1
            used[x] = False  #@ f|1

# Driver code
if __name__ == "__main__":  #@ 1|1
    n = 4  #@ 1|1
    used = [False] * (n + 1)  #@ n|n
    generate(n, [], used)  #@ f|n
''',
    },
    {
        "id": "algo_nfact_311",
        "name": "Count Hamiltonian Paths by Trying Every Vertex Ordering",
        "T": "f", "S": "n",
        "note": "worst case is the complete graph (every ordering is a path, so return 1 runs n! times); orderings are enumerated by swapping and edges are checked at each leaf",
        "code": '''# Python program to count Hamiltonian paths by checking
# every ordering of the vertices

def count_hamiltonian_paths(adj, order, l, n):  #@ 1|1
    if l == n:  #@ f|1
        for i in range(n - 1):  #@ f|1
            if adj[order[i]][order[i + 1]] == 0:  #@ f|1
                return 0  #@ f|1
        return 1  #@ f|1
    total = 0  #@ f|1
    for i in range(l, n):  #@ f|1
        order[l], order[i] = order[i], order[l]  #@ f|1
        total += count_hamiltonian_paths(adj, order, l + 1, n)  #@ f|n
        order[l], order[i] = order[i], order[l]  #@ f|1
    return total  #@ f|1

# Driver code
if __name__ == "__main__":  #@ 1|1
    adj = [[0, 1, 1, 1], [1, 0, 1, 1], [1, 1, 0, 1], [1, 1, 1, 0]]  #@ 1|1
    n = len(adj)  #@ 1|1
    order = list(range(n))  #@ n|n
    print(count_hamiltonian_paths(adj, order, 0, n))  #@ f|n
''',
    },
    {
        "id": "algo_nfact_312",
        "name": "Print All Permutations by Passing the Remaining Characters (Slicing)",
        "T": "f", "S": "n2",
        "note": "~e*n! calls; each frame holds its own sliced list and extended prefix of size O(n), n frames deep => O(n^2) space; per-call slicing cost n is absorbed into n!",
        "code": '''# Python program to print all permutations of a list
# by passing the remaining characters down

def permute(chars, prefix):  #@ 1|1
    if not chars:  #@ f|1
        print("".join(prefix))  #@ f|n
        return  #@ f|1
    for i in range(len(chars)):  #@ f|1
        permute(chars[:i] + chars[i + 1:], prefix + [chars[i]])  #@ f|n2

# Driver code
if __name__ == "__main__":  #@ 1|1
    s = ["A", "B", "C"]  #@ 1|1
    permute(s, [])  #@ f|n2
''',
    },
]
