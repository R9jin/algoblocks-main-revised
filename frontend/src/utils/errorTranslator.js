// frontend/src/utils/errorTranslator.js
export const translatePythonError = (rawErrorMessage) => {
    if (!rawErrorMessage) return "";
  
    const msg = String(rawErrorMessage);
    let hint = "";

    if (msg.includes("EOL while scanning string literal") || msg.includes("unterminated string literal")) {
      hint = "You forgot to close a quotation mark at the end of a string (e.g., missing a ' or \").";
    } 
    else if (msg.includes("unexpected EOF while parsing") || msg.includes("unexpected EOF")) {
      hint = "The code ended unexpectedly. You are likely missing a closing parenthesis ')', bracket ']', or brace '}'.";
    } 
    else if (msg.includes("expected ':'") || msg.includes("expected a ':'")) {
      hint = "You forgot a colon (:) at the end of your 'if', 'for', 'while', or 'def' statement.";
    } 
    else if (msg.includes("invalid syntax")) {
      hint = "Check for missing colons (:), unclosed parentheses/quotes, or misspelled/misplaced keywords nearby.";
    } 
  
    // ==========================================
    // INDENTATION & WHITESPACE
    // ==========================================
    else if (msg.includes("TabError") || msg.includes("inconsistent use of tabs and spaces")) {
      hint = "You mixed tabs and spaces for indentation. Python strictly requires using either all spaces or all tabs (spaces are highly recommended).";
    }
    else if (msg.includes("IndentationError") || msg.includes("expected an indented block")) {
      hint = "Check your spacing! Code inside loops, conditionals, and functions must be indented consistently.";
    } 
    
    // ==========================================
    // VARIABLES, NAMES & SCOPE
    // ==========================================
    else if (msg.includes("NameError") || msg.includes("is not defined")) {
      const match = msg.match(/name '([^']+)' is not defined/);
      const varName = match ? match[1] : "a variable";
      hint = `Python doesn't know what '${varName}' is. Did you forget to define it, spell it wrong, or forget quotation marks around a string?`;
    } 
    else if (msg.includes("UnboundLocalError")) {
      const match = msg.match(/local variable '([^']+)' referenced before assignment/);
      const varName = match ? match[1] : "a variable";
      hint = `You are trying to use or modify the variable '${varName}' inside a function before giving it a value. If it's a global variable, you might need the 'global' keyword.`;
    }
    
    // ==========================================
    // TYPES & COMPATIBILITY
    // ==========================================
    else if (msg.includes("TypeError: unsupported operand")) {
      hint = "You are trying to perform a math operation on incompatible data types (like adding text to a number).";
    } 
    else if (msg.includes("TypeError: can only concatenate str") || msg.includes("must be str, not int")) {
      hint = "You cannot directly combine text and numbers. Try wrapping your number in str() first.";
    } 
    else if (msg.includes("TypeError") && msg.includes("object is not callable")) {
      const match = msg.match(/'([^']+)' object is not callable/);
      const objName = match ? match[1] : "An";
      hint = `${objName} is not a function, but you are trying to call it like one by putting parentheses '()' after it.`;
    }
    else if (msg.includes("TypeError") && msg.includes("object is not iterable")) {
      const match = msg.match(/'([^']+)' object is not iterable/);
      const objName = match ? match[1] : "An";
      hint = `You are trying to loop over or unpack a ${objName}, but it's a single value (like an integer), not a collection (like a list or string).`;
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
    // ATTRIBUTES & METHODS
    // ==========================================
    else if (msg.includes("AttributeError")) {
      const match = msg.match(/'([^']+)' object has no attribute '([^']+)'/);
      if (match) {
        hint = `A ${match[1]} doesn't have a method or property named '${match[2]}'. Check your spelling or ensure you are using the right method for this data type.`;
      } else {
        hint = "You are trying to use a method or property that doesn't exist for this specific type of object.";
      }
    }
  
    // ==========================================
    // LISTS, DICTIONARIES & TUPLES
    // ==========================================
    else if (msg.includes("IndexError: list index out of range")) {
      hint = "You are trying to access a position in a list that doesn't exist. Remember, list positions start counting at 0, not 1!";
    } 
    else if (msg.includes("KeyError")) {
      const match = msg.match(/KeyError: (.*)/);
      const keyName = match ? match[1] : "a key";
      hint = `You tried to look up the key ${keyName} in a dictionary, but that key hasn't been added yet.`;
    } 
    else if (msg.includes("ValueError: too many values to unpack")) {
      hint = "You are trying to assign multiple variables at once (unpacking), but there are more values on the right side than variables on the left.";
    }
    else if (msg.includes("ValueError: not enough values to unpack")) {
      hint = "You are trying to assign multiple variables at once (unpacking), but there aren't enough values on the right side for all the variables on the left.";
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
      hint = `You tried to convert '${badVal}' into an integer, but it isn't a valid whole number.`;
    } 
    
    // ==========================================
    // IMPORTS & MODULES
    // ==========================================
    else if (msg.includes("ModuleNotFoundError") || msg.includes("No module named")) {
      const match = msg.match(/No module named '([^']+)'/);
      const modName = match ? match[1] : "a module";
      hint = `Python cannot find the library '${modName}'. Check your spelling, or ensure it is supported in this environment.`;
    }
    else if (msg.includes("ImportError")) {
      hint = "You are trying to import a specific function or class from a library, but it doesn't exist in that library. Check your spelling.";
    }
  
    // ==========================================
    // ADVANCED: RECURSION & MEMORY
    // ==========================================
    else if (msg.includes("RecursionError") || msg.includes("maximum recursion depth exceeded")) {
      hint = "Your function called itself too many times! Check your 'base case' to ensure the recursion eventually stops.";
    }
    else if (msg.includes("MemoryError")) {
      hint = "Your program ran out of memory. This usually happens if you create an infinitely growing list or string.";
    }
  
    // Fallback: If we couldn't match the error exactly, let the raw error show through but encourage debugging.
    if (!hint) {
       return ""; // Alternatively, return a generic: `💡 Hint: Try copying this error and checking lines nearby for typos.`
    }
  
    return `💡 Hint: ${hint}`;
  };