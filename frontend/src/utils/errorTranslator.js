// frontend/src/utils/errorTranslator.js
export const translatePythonError = (rawErrorMessage) => {
    if (!rawErrorMessage) return "";
  
    const msg = String(rawErrorMessage);
    let hint = "";

    // ==========================================
    // SYNTAX & BRACKETS (Expanded)
    // ==========================================
    if (msg.includes("EOL while scanning string literal") || msg.includes("unterminated string literal")) {
      hint = "You forgot to close a quotation mark at the end of a string (e.g., missing a ' or \").";
    } 
    else if (msg.includes("unexpected EOF while parsing") || msg.includes("unexpected EOF")) {
      hint = "You are missing a closing parenthesis ')', bracket ']', or brace '}'.";
    } 
    else if (msg.includes("expected ':'") || msg.includes("expected a ':'")) {
      hint = "You forgot a colon (:) at the end of your 'if', 'for', 'while', 'class', or 'def' statement.";
    } 
    else if (msg.includes("invalid character in identifier")) {
      hint = "You might have accidentally pasted a hidden character or 'smart quote' from a document. Try retyping the line manually.";
    }
    else if (msg.includes("positional argument follows keyword argument")) {
      hint = "When calling a function, regular arguments (like `5`) must come before keyword arguments (like `x=5`).";
    }
    else if (msg.includes("invalid syntax")) {
      if (msg.includes("mismatched")) {
         hint = "You closed a bracket with the wrong type (e.g. closing a '(' with a ']').";
      } else {
         hint = "Check for missing colons (:), unclosed parentheses/quotes, missing commas between arguments, or misspelled keywords nearby.";
      }
    } 
  
    // ==========================================
    // INDENTATION & WHITESPACE (Expanded)
    // ==========================================
    else if (msg.includes("TabError") || msg.includes("inconsistent use of tabs and spaces")) {
      hint = "You mixed tabs and spaces for indentation. Python strictly requires using either all spaces or all tabs (spaces are highly recommended).";
    }
    else if (msg.includes("IndentationError") || msg.includes("expected an indented block")) {
      hint = "Check your spacing! Code inside loops, conditionals, and functions must be indented consistently.";
    } 
    else if (msg.includes("unindent does not match any outer indentation level")) {
      hint = "Your indentation is misaligned. Make sure you are deleting spaces in multiples of 4 (or matching the exact spacing of the lines above).";
    }
    
    // ==========================================
    // VARIABLES, NAMES & SCOPE
    // ==========================================
    else if (msg.includes("NameError") || msg.includes("is not defined")) {
      const match = msg.match(/name '([^']+)' is not defined/);
      const varName = match ? match[1] : "a variable";
      hint = `Python doesn't know what '${varName}' is. Did you forget to define it, misspell it, or forget quotation marks around a string?`;
    } 
    else if (msg.includes("UnboundLocalError")) {
      const match = msg.match(/local variable '([^']+)' referenced before assignment/);
      const varName = match ? match[1] : "a variable";
      hint = `You are trying to use or modify the variable '${varName}' inside a function before giving it a value. If it's a global variable, you might need to use the 'global' keyword.`;
    }
    
    // ==========================================
    // TYPES & COMPATIBILITY
    // ==========================================
    else if (msg.includes("TypeError: unsupported operand")) {
      hint = "You are trying to perform a math operation on incompatible data types (like adding text to a number, or a list to an integer).";
    } 
    else if (msg.includes("TypeError: can only concatenate str") || msg.includes("must be str, not int")) {
      hint = "You cannot directly combine text and numbers using '+'. Try wrapping your number in str() first, e.g., str(5).";
    } 
    else if (msg.includes("TypeError") && msg.includes("object is not callable")) {
      const match = msg.match(/'([^']+)' object is not callable/);
      const objName = match ? match[1] : "An object";
      hint = `You are treating a '${objName}' like a function by putting parentheses '()' after it. For example, if 'x = 5', doing 'x()' causes this error.`;
    }
    else if (msg.includes("TypeError") && msg.includes("object is not iterable")) {
      const match = msg.match(/'([^']+)' object is not iterable/);
      const objName = match ? match[1] : "An object";
      hint = `You are trying to loop over or unpack a '${objName}', but it's a single value (like an integer), not a collection (like a list or string).`;
    }
    else if (msg.includes("TypeError") && msg.includes("does not support item assignment")) {
      hint = "You are trying to change a specific item inside an immutable object (like a string or a tuple). You cannot modify strings directly; you must create a new one.";
    }
  
    // ==========================================
    // FUNCTIONS & ARGUMENTS
    // ==========================================
    else if (msg.includes("TypeError") && (msg.includes("positional arguments but") || msg.includes("missing") && msg.includes("required positional argument"))) {
      hint = "You are passing the wrong number of arguments to a function. Double-check how many inputs the function expects versus how many you gave it.";
    }
  
    // ==========================================
    // ATTRIBUTES & METHODS (Expanded)
    // ==========================================
    else if (msg.includes("AttributeError") && msg.includes("'NoneType' object has no attribute")) {
      hint = "You are trying to use a method on a variable that is currently 'None' (null). This often happens if a previous function returned nothing (None) but you expected an object or list.";
    }
    else if (msg.includes("AttributeError")) {
      const match = msg.match(/'([^']+)' object has no attribute '([^']+)'/);
      if (match) {
        hint = `A ${match[1]} doesn't have a method or property named '${match[2]}'. Check your spelling or ensure you are using the right method for this data type.`;
      } else {
        hint = "You are trying to use a method or property that doesn't exist for this specific type of object.";
      }
    }
  
    // ==========================================
    // LISTS, DICTIONARIES & TUPLES (Expanded)
    // ==========================================
    else if (msg.includes("IndexError: list index out of range")) {
      hint = "You are trying to access a position in a list that doesn't exist. Remember, list positions start counting at 0! Try using 'len(my_list) - 1' for the last item.";
    } 
    else if (msg.includes("KeyError")) {
      const match = msg.match(/KeyError: (.*)/);
      const keyName = match ? match[1] : "a key";
      hint = `You tried to look up the key ${keyName} in a dictionary, but it hasn't been added yet. Consider using 'my_dict.get(key)' which safely returns None if missing.`;
    } 
    else if (msg.includes("ValueError: too many values to unpack")) {
      hint = "You are trying to assign multiple variables at once (unpacking), but there are more values on the right side than variables on the left.";
    }
    else if (msg.includes("ValueError: not enough values to unpack")) {
      hint = "You are trying to assign multiple variables at once (unpacking), but there aren't enough values on the right side for all the variables on the left.";
    }
    else if (msg.includes("ValueError: list.remove(x): x not in list")) {
      hint = "You tried to remove an item from a list, but that item doesn't exist in the list. Check if it's there first using 'if x in my_list:'.";
    }
    
    // ==========================================
    // MATH & VALUES
    // ==========================================
    else if (msg.includes("ZeroDivisionError") || msg.includes("division by zero")) {
      hint = "You are trying to divide a number by zero, which is mathematically impossible. Check the variable being used as the divisor.";
    } 
    else if (msg.includes("ValueError: invalid literal for int()")) {
      const match = msg.match(/invalid literal for int\(\) with base \d+: '([^']+)'/);
      const badVal = match ? match[1] : "the text";
      hint = `You tried to convert '${badVal}' into an integer, but it isn't a valid whole number. Make sure the string only contains digits.`;
    } 
    
    // ==========================================
    // IMPORTS, MODULES & FILES (Expanded)
    // ==========================================
    else if (msg.includes("ModuleNotFoundError") || msg.includes("No module named")) {
      const match = msg.match(/No module named '([^']+)'/);
      const modName = match ? match[1] : "a module";
      hint = `Python cannot find the library '${modName}'. Check your spelling, or ensure it is supported in this Pyodide environment.`;
    }
    else if (msg.includes("ImportError")) {
      hint = "You are trying to import a specific function or class from a library, but it doesn't exist in that library. Check your spelling.";
    }
    else if (msg.includes("FileNotFoundError") || msg.includes("No such file or directory")) {
      hint = "Python cannot find the file you are trying to open. Check that the file name is spelled correctly and that it exists in the current directory.";
    }
  
    // ==========================================
    // ADVANCED: RECURSION, ITERATORS & ASSERTIONS (Expanded)
    // ==========================================
    else if (msg.includes("RecursionError") || msg.includes("maximum recursion depth exceeded")) {
      hint = "Your function called itself too many times! Check your 'base case' to ensure the recursion eventually stops.";
    }
    else if (msg.includes("MemoryError")) {
      hint = "Your program ran out of memory. This usually happens if you create an infinitely growing list or string.";
    }
    else if (msg.includes("AssertionError")) {
      hint = "An 'assert' statement failed. This means a condition you expected to be True turned out to be False.";
    }
    else if (msg.includes("StopIteration")) {
      hint = "You called 'next()' on an iterator, but there are no more items left to generate.";
    }
  
    if (!hint) {
       return ""; 
    }
  
    return `💡 Hint: ${hint}`;
  };