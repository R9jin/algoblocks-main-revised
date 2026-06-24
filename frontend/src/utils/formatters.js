// frontend/src/utils/formatters.js

export const formatExplanation = (text) => {
    if (!text) return null;

    // 1. Strip out LaTeX math delimiters and artifacts
    let cleanText = text
        .replace(/\(\$/g, '')       // Remove opening ($
        .replace(/\$\)/g, '')       // Remove closing $)
        .replace(/\$/g, '')         // Remove standalone $
        .replace(/\\\(/g, '')       // Remove opening \(
        .replace(/\\\)/g, '')       // Remove closing \)
        .replace(/\\{/g, '{')       // Remove escaped braces
        .replace(/\\}/g, '}');

    // 2. Translate common LaTeX algorithmic notation to plain text
    cleanText = cleanText
        .replace(/\\log\s*n/g, 'log n')
        .replace(/\\log/g, 'log')
        .replace(/n\^2/g, 'n²')
        .replace(/n\^3/g, 'n³')
        .replace(/2\^n/g, '2ⁿ')
        .replace(/\\cdot/g, '·')
        .replace(/\\times/g, '×');

    // 3. Parse Markdown bolding (**text**) and line breaks
    const parts = cleanText.split(/(\*\*.*?\*\*)/g);
    
    return parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={`strong-${index}`}>{part.slice(2, -2)}</strong>;
        }
        
        // Handle newlines for React rendering
        return part.split('\n').map((line, lineIndex, arr) => (
            <span key={`text-${index}-${lineIndex}`}>
                {line}
                {lineIndex !== arr.length - 1 && <br />}
            </span>
        ));
    });
};