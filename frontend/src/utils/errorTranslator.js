// frontend/src/utils/errorTranslator.js

export const translatePythonError = (rawErrorMessage) => {
    if (!rawErrorMessage) return "";
  
    const msg = String(rawErrorMessage);
    let hint = "";
  
    // --- SYNTAX & INDENTATION ---
    if (msg.includes("invalid syntax")) {
      hint = "Check for missing colons (:), unclosed parentheses/quotes, or misspelled keywords nearby.";
    } 
    else if (msg.includes("expected ':'") || msg.includes("expected a ':'")) {
      hint = "You forgot a colon (:) at the end of your 'if', 'for', 'while', or 'def' statement.";
    } 
    else if (msg.includes("IndentationError") || msg.includes("expected an indented block")) {
      hint = "Check your spacing! Code inside loops, conditionals, and functions must be indented consistently.";
    } 
    
    // --- VARIABLES & NAMES ---
    else if (msg.includes("NameError") || msg.includes("is not defined")) {
      const match = msg.match(/name '([^']+)' is not defined/);
      const varName = match ? match[1] : "a variable";
      hint = `Python doesn't know what '${varName}' is. Did you forget to define it, or did you misspell it?`;
    } 
    
    // --- DATA TYPES ---
    else if (msg.includes("TypeError: unsupported operand")) {
      hint = "You are trying to perform math on incompatible data types (like adding text to a number).";
    } 
    else if (msg.includes("TypeError: can only concatenate str") || msg.includes("must be str, not int")) {
      hint = "You cannot directly combine text and numbers. Try wrapping your number in str() first.";
    } 
    
    // --- LISTS & DICTIONARIES ---
    else if (msg.includes("IndexError: list index out of range")) {
      hint = "You are trying to access a position in a list that doesn't exist. Remember, list positions start counting at 0!";
    } 
    else if (msg.includes("KeyError")) {
      const match = msg.match(/KeyError: (.*)/);
      const keyName = match ? match[1] : "a key";
      hint = `You tried to look up the key ${keyName} in a dictionary, but it hasn't been created yet.`;
    } 
    
    // --- MATH ---
    else if (msg.includes("ZeroDivisionError") || msg.includes("division by zero")) {
      hint = "You are trying to divide a number by zero, which is mathematically impossible. Check your variables.";
    } 
    
    // --- CONVERSIONS ---
    else if (msg.includes("ValueError: invalid literal for int()")) {
      hint = "You tried to convert text into an integer, but the text isn't a valid number.";
    } 
    
    // --- RECURSION ---
    else if (msg.includes("RecursionError") || msg.includes("maximum recursion depth exceeded")) {
      hint = "Your function called itself too many times! Check your 'base case' to ensure the recursion eventually stops.";
    }
  
    return hint ? `💡 Hint: ${hint}` : "";
  };