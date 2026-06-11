// frontend/src/utils/errorTranslator.js

/**
 * Scans a raw Python error message and returns a deeply contextual, 
 * educational hint to help the user understand and fix the specific issue.
 * * @param {string} errorMsg - The raw error string from Pyodide or the backend analyzer.
 * @returns {string} - An actionable, in-depth explanation and solution.
 */
export const translatePythonError = (errorMsg) => {
  if (!errorMsg) return "";
  const str = String(errorMsg);

  // =========================================================================
  // HEURISTIC ERROR RULES
  // The engine tests the error string against specific Regex patterns.
  // If matched, it extracts the groups (like variable names) and dynamically
  // builds an actionable, educational insight tailored to that exact scenario.
  // =========================================================================
  const rules = [
    // -------------------------------------------------------------------------
    // 1. SYNTAX & STRUCTURAL ERRORS
    // -------------------------------------------------------------------------
    {
      test: /SyntaxError: expected ':'/i,
      generate: () =>
        "Missing Colon: You forgot to put a colon `:` at the end of your statement. In Python, keywords that start a new block of logic (like `if`, `for`, `while`, `elif`, `else`, or `def`) must always end with a colon so the engine knows to expect indented code next.",
    },
    {
      test: /SyntaxError: unexpected EOF while parsing/i,
      generate: () =>
        "Unclosed Bracket/Parenthesis: The Python engine reached the absolute end of your code, but it was still waiting for a closure. Look at the lines above; you likely opened a parenthesis `(`, square bracket `[`, or curly brace `{` and forgot to put the closing match.",
    },
    {
      test: /SyntaxError: unmatched '(\)|\]|\})'/i,
      generate: (match) =>
        `Dangling Bracket: You have an extra closing bracket \`${match[1]}\` that doesn't belong to anything. Check your equations or list definitions and remove the extra character.`,
    },
    {
      test: /SyntaxError: invalid syntax/i,
      generate: () =>
        "Invalid Syntax: The engine cannot read this line mathematically or logically. This usually happens if you misspelled a core keyword, forgot an operator (like putting `2x` instead of `2 * x`), or accidentally put a space inside a variable name. Also, check the line directly above this one for missing closing parentheses!",
    },
    {
      test: /SyntaxError: cannot assign to literal/i,
      generate: () =>
        "Reversed Assignment: In Python, you can only assign values to variables, and the variable MUST be on the left side of the equals sign. For example, `x = 5` is correct, but `5 = x` is physically impossible for the computer to process.",
    },
    {
      test: /SyntaxError: cannot assign to function call/i,
      generate: () =>
        "Function Assignment Error: You are trying to use an equals sign `=` to assign a value directly into a function call (like `len(arr) = 5`). Functions compute results; they cannot act as storage containers. Assign values to standard variables instead.",
    },
    {
      test: /IndentationError: expected an indented block/i,
      generate: () =>
        "Missing Indentation: You created a structure (like a loop or an if-statement), but the line immediately underneath it isn't indented. Python strictly uses spacing to group code together. Press the 'Tab' key (or 4 spaces) before the code that belongs inside that block.",
    },
    {
      test: /IndentationError: unindent does not match any outer indentation level/i,
      generate: () =>
        "Inconsistent Spacing: Your code indentations are misaligned. This happens when you accidentally mix 'Tabs' and 'Spaces' in the same file, or if you deleted a space by accident. Highlight your block and ensure the vertical lines match perfectly.",
    },

    // -------------------------------------------------------------------------
    // 2. VARIABLE & NAME ERRORS
    // -------------------------------------------------------------------------
    {
      test: /NameError: name '(.+)' is not defined/i,
      generate: (match) =>
        `Undefined Variable: You are trying to use a variable or function named \`${match[1]}\`, but it doesn't exist in the computer's memory yet. Did you misspell the name? Or did you forget to initialize it earlier in your code (e.g., \`${match[1]} = 0\`)? Remember, capitalization matters in Python (\`MyVar\` is different from \`myvar\`).`,
    },
    {
      test: /UnboundLocalError: local variable '(.+)' referenced before assignment/i,
      generate: (match) =>
        `Scope Error: You are trying to modify or read the variable \`${match[1]}\` inside a function, but you haven't assigned it a value inside that function yet. If \`${match[1]}\` exists globally outside the function, you must pass it in as an argument.`,
    },

    // -------------------------------------------------------------------------
    // 3. TYPE ERRORS (Mismatched data types)
    // -------------------------------------------------------------------------
    {
      test: /TypeError: can only concatenate str \(not "(.+)"\) to str/i,
      generate: (match) =>
        `Data Type Clash: You are trying to use the \`+\` operator to attach a mathematical \`${match[1]}\` (like a number) directly to text (a string). Python refuses to guess how to combine them. Fix this by explicitly converting the number to text first: \`str(your_number)\`, or use f-strings: \`f"Result: {your_number}"\`.`,
    },
    {
      test: /TypeError: unsupported operand type\(s\) for (.+): '(.+)' and '(.+)'/i,
      generate: (match) =>
        `Mathematical Type Clash: You cannot use the \`${match[1]}\` operator between a \`${match[2]}\` and a \`${match[3]}\`. For example, you cannot subtract a letter from a number. Ensure both sides of your equation represent compatible mathematical concepts.`,
    },
    {
      test: /TypeError: '(.+)' object is not iterable/i,
      generate: (match) =>
        `Iteration Error: You wrote a loop (like \`for x in item:\`), but the item you are trying to loop over is a flat \`${match[1]}\` (like a single integer or boolean). You can only loop over collections of data (like Lists, Strings, or Dictionaries). If you want to run a loop N times, use \`for i in range(N):\`.`,
    },
    {
      test: /TypeError: '(.+)' object is not callable/i,
      generate: (match) =>
        `Call Error: You put parentheses \`()\` right next to a \`${match[1]}\` as if it were a function (e.g., \`my_variable()\`). The computer is confused because it's just raw data, not a callable function. Check if you accidentally gave a variable the exact same name as a function.`,
    },
    {
      test: /TypeError: (.+) takes (.+) positional arguments but (.+) were given/i,
      generate: (match) =>
        `Argument Mismatch: The function \`${match[1]}\` was designed to accept exactly ${match[2]} inputs, but you handed it ${match[3]}. Check the function definition and ensure you are passing the correct amount of data through the parentheses.`,
    },
    {
      test: /TypeError: '(.+)' object does not support item assignment/i,
      generate: (match) =>
        `Immutability Error: You are trying to directly overwrite a specific index inside a \`${match[1]}\` (like trying to change a specific letter in a String or Tuple via \`text[0] = 'A'\`). In Python, ${match[1]}s are strictly immutable and cannot be changed in-place. You must build a completely new string instead.`,
    },

    // -------------------------------------------------------------------------
    // 4. INDEX & ARRAY BOUNDARY ERRORS
    // -------------------------------------------------------------------------
    {
      test: /IndexError: list index out of range/i,
      generate: () =>
        "Out of Bounds: You are commanding the computer to look up a specific slot in an array, but that slot doesn't exist! Remember that arrays start counting at 0. If a list has 5 items, the maximum valid index is 4. Check your loop limits (e.g., making sure you use `< len(arr)` and not `<= len(arr)`).",
    },
    {
      test: /IndexError: list assignment index out of range/i,
      generate: () =>
        "Out of Bounds Assignment: You are trying to inject data directly into an array index (like `arr[5] = 10`), but the array currently doesn't have 6 slots. You cannot assign to an index that doesn't physically exist yet. If you want to add a brand new item to the end of a list, use `arr.append(10)` instead.",
    },
    {
      test: /KeyError: (.+)/i,
      generate: (match) =>
        `Dictionary Key Missing: You are asking a Dictionary to give you the value attached to the key \`${match[1]}\`, but that key hasn't been created inside the dictionary yet. To prevent crashes, either verify the key exists first (\`if key in my_dict:\`) or use the safe fetch method: \`my_dict.get(key, default_value)\`.`,
    },

    // -------------------------------------------------------------------------
    // 5. VALUE ERRORS (Data casting & Unpacking)
    // -------------------------------------------------------------------------
    {
      test: /ValueError: invalid literal for int\(\) with base 10: '(.+)'/i,
      generate: (match) =>
        `Conversion Failure: You attempted to forcefully cast the text \`${match[1]}\` into a pure integer using \`int()\`. The math engine rejected it because that text contains letters, symbols, or decimals. Make sure you only pass clean whole numbers into \`int()\`.`,
    },
    {
      test: /ValueError: not enough values to unpack \(expected (\d+), got (\d+)\)/i,
      generate: (match) =>
        `Tuple Unpacking Error: You wrote a line trying to unpack data into ${match[1]} distinct variables at once (e.g., \`a, b, c = data\`), but the structure on the right side only contained ${match[2]} items. The quantities must match perfectly.`,
    },
    {
      test: /ValueError: too many values to unpack/i,
      generate: () =>
        "Tuple Unpacking Error: The collection on the right side of the equals sign has more items inside it than the number of variables you provided on the left side to catch them. The quantities must match perfectly.",
    },

    // -------------------------------------------------------------------------
    // 6. ATTRIBUTE ERRORS (Object Methods)
    // -------------------------------------------------------------------------
    {
      test: /AttributeError: 'NoneType' object has no attribute '(.+)'/i,
      generate: (match) =>
        `Null Reference: You are trying to trigger the \`.${match[1]}()\` method on a variable that is currently absolutely empty (\`None\`). This is a classic trap: it usually happens if you used a method that modifies a list in-place (like \`arr.sort()\` or \`arr.append()\`) and accidentally assigned its result back to the variable (e.g., \`arr = arr.append(x)\`). In-place modifiers return None!`,
    },
    {
      test: /AttributeError: '(.+)' object has no attribute '(.+)'/i,
      generate: (match) =>
        `Missing Attribute/Method: You are trying to use \`.${match[2]}\` on a \`${match[1]}\` object, but that capability does not mathematically or structurally exist for that data type. For example, you cannot trigger \`.append()\` on a string, only on a list. Check your variable's data type.`,
    },

    // -------------------------------------------------------------------------
    // 7. MATH & EXECUTION ERRORS
    // -------------------------------------------------------------------------
    {
      test: /ZeroDivisionError: division by zero/i,
      generate: () =>
        "Mathematical Impossibility: You are attempting to divide a number by strictly zero. This physically crashes the math processor. Check your logic and add a safety check (e.g., `if denominator != 0:`) before executing the division.",
    },
    {
      test: /RecursionError: maximum recursion depth exceeded/i,
      generate: () =>
        "Infinite Recursion Trap: Your function is caught in an infinite loop, calling itself over and over without ever stopping. The system artificially crashed the program to protect system RAM. Ensure your recursive function has a reachable 'Base Case' (a condition where it returns a value instead of calling itself again) and that every parameter passed down moves mathematically closer to that base case.",
    },
    {
      test: /StopIteration/i,
      generate: () =>
        "Exhausted Iterator: You forcefully requested the `next()` item from a generator or iterator, but it has completely run out of data. Always handle generators safely using loops or default fallback values.",
    },
    {
      test: /ModuleNotFoundError: No module named '(.+)'/i,
      generate: (match) =>
        `Missing Library: You tried to import a library named \`${match[1]}\`. However, the sandbox engine doesn't have this third-party library installed. The AlgoBlocks environment relies strictly on pure Python standard libraries (like \`math\`, \`collections\`, or \`itertools\`).`,
    }
  ];

  // =========================================================================
  // MATCHER ENGINE
  // Extracts the specific rule, triggers the callback, and constructs the string.
  // =========================================================================
  for (const rule of rules) {
    const match = str.match(rule.test);
    if (match) {
      return rule.generate(match);
    }
  }

  // =========================================================================
  // FALLBACK
  // If the error is overly cryptic or completely unknown to our dictionary.
  // =========================================================================
  return "Unknown System Error: An unpredictable runtime failure occurred. Read the raw error message above to locate the line number causing the crash. Verify your mathematical logic, variable types, and array manipulations.";
};