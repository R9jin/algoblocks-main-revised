// frontend/src/utils/asymptoticParser.jsx
import DOMPurify from "dompurify";
import { useEffect, useRef, useState } from "react";
import { toClosedFormBigO } from "./formatters";

export const handleEditorWillMount = (monaco) => {
  monaco.editor.defineTheme("algoblocks-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "7928CA", fontStyle: "bold" },
      { token: "string", foreground: "047857" },
      { token: "comment", foreground: "5B6B7F", fontStyle: "italic" },
      { token: "number", foreground: "B45309" },
    ],
    colors: {
      "editor.background": "#F8FAFC",
      "editor.foreground": "#1E293B",
      "editorLineNumber.foreground": "#64748B",
      "editorLineNumber.activeForeground": "#1E293B",
      "editorBracketHighlight.foreground1": "#1E7A1E",
      "editorBracketHighlight.foreground2": "#B45309",
      "editorBracketHighlight.foreground3": "#6B21A8",
      "editor.lineHighlightBackground": "#F1F5F9",
      "editorCursor.foreground": "#7928CA",
      "editor.selectionBackground": "#E2E8F0",
      "editor.inactiveSelectionBackground": "#F1F5F9",
    },
  });

  // Dark counterpart, picked in PythonCodeEditor when <html data-theme="dark">.
  // Every foreground below is >= 4.5:1 on the #150A24 editor background.
  monaco.editor.defineTheme("algoblocks-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword", foreground: "C4B5FD", fontStyle: "bold" },
      { token: "string", foreground: "6EE7B7" },
      { token: "comment", foreground: "9B8EC4", fontStyle: "italic" },
      { token: "number", foreground: "FDBA74" },
    ],
    colors: {
      "editor.background": "#150A24",
      "editor.foreground": "#E4DDF7",
      "editorLineNumber.foreground": "#9B8EC4",
      "editorLineNumber.activeForeground": "#F5F3FF",
      "editorBracketHighlight.foreground1": "#86EFAC",
      "editorBracketHighlight.foreground2": "#FDBA74",
      "editorBracketHighlight.foreground3": "#D8B4FE",
      "editor.lineHighlightBackground": "#211337",
      "editorCursor.foreground": "#D3BFFF",
      "editor.selectionBackground": "#4B3A7C",
      "editor.inactiveSelectionBackground": "#2F1E50",
      "editorWidget.background": "#211337",
      "editorWidget.border": "#4B3A7C",
      "editorSuggestWidget.background": "#211337",
      "editorSuggestWidget.border": "#4B3A7C",
      "editorSuggestWidget.selectedBackground": "#3A2562",
      "editorHoverWidget.background": "#211337",
      "editorHoverWidget.border": "#4B3A7C",
      "scrollbarSlider.background": "#A78BFA44",
      "scrollbarSlider.hoverBackground": "#A78BFA77",
    },
  });
};

// Growth class of a complexity string. Recurrences (T(n) = ...) are resolved
// to their closed-form Big-O first, so a row is always coloured by what it
// grows like, never by whichever substring happens to appear in the relation
// (the old check painted "T(n) = 2T(n/2) + O(n)" as plain O(n)).
export const getComplexityClass = (complexity) => {
  const s = toClosedFormBigO(String(complexity || ""))
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/\u00B2/g, "^2")
    .replace(/\u00B3/g, "^3")
    .replace(/\u207F/g, "^n")
    .replace(/\u221An/g, "sqrtn");
  if (!s.includes("o(")) return "unknown";
  if (s.includes("n!")) return "factorial";
  if (/(\d|c)\^n|exponential/.test(s)) return "exponential";
  const frac = s.match(/n\^(\d+\.\d+)/);
  if (frac) {
    const e = Number(frac[1]);
    if (e > 2) return "polyHigh";
    if (e > 1) return "nlogn"; // e.g. 3T(n/2)+O(n) = O(n^1.58): between n and n^2
    return "sqrt";
  }
  const poly = s.match(/n\^(\d+)/);
  if (poly) {
    const degree = Number(poly[1]);
    if (degree >= 3 || (degree === 2 && s.includes("log"))) return "polyHigh";
    if (degree === 2) return "quadratic";
  }
  if (/cubic|quartic/.test(s)) return "polyHigh";
  if (/n\*n|n\*m|m\*n/.test(s)) return "quadratic";
  if (/nlog|n\*log/.test(s)) return "nlogn";
  if (/v\+e|e\+v|n\+m|m\+n|o\(v\)|o\(e\)/.test(s)) return "graph";
  if (/o\([a-z]\)/.test(s)) return "linear";
  if (/sqrt|n\^0\.5/.test(s)) return "sqrt";
  if (s.includes("log")) return "log";
  if (/o\(1\)|constant/.test(s)) return "constant";
  return "unknown";
};

export const COMPLEXITY_CLASS_COLORS = {
  // Every value is >= 4.5:1 on the light panel (#F8FAFC) because these are
  // rendered as TEXT in the complexity table. The old, brighter hues
  // (#10B981, #F59E0B, #F97316 ...) were only ~2:1 and read as washed-out.
  constant: "#047857",
  log: "#0369A1",
  sqrt: "#0F766E",
  linear: "#B45309",
  graph: "#92400E",
  nlogn: "#C2410C",
  quadratic: "#B91C1C",
  polyHigh: "#BE123C",
  exponential: "#7928CA",
  factorial: "#A21CAF",
  unknown: "#475569",
};

export const getComplexityColor = (complexity) =>
  COMPLEXITY_CLASS_COLORS[getComplexityClass(complexity)] || COMPLEXITY_CLASS_COLORS.unknown;

// Weight scale rebuilt to match the analyzer's actual recognized scope: it
// reliably recognizes O(1), O(log n), O(sqrt n), O(n), O(V+E), O(n log n),
// O(n^2), O(2^n), and O(n!) — 9 classes total. Ordering (log n < sqrt n < n)
// mirrors the analyzer engine's own internal _get_weight() ordering in
// frontend/public/python_engine/complexity_analyzer/complexity_heuristics.py.
// There is no partial-credit tier for n^3/n^4/n^2 log n since the analyzer
// does not reliably distinguish those from its 9 supported classes.
export const getComplexityWeight = (complexity, defaultWeight = 0) => {
  const comp = String(complexity || "").toLowerCase().replace(/\s+/g, "");
  if (comp.includes("n!") || comp.includes("n*t(n-1)")) return 9;
  if (comp.includes("2^n") || comp.includes("2ⁿ") || comp.includes("c^n") || comp.includes("t(n-1)+t(n-2)")) return 8;
  if (comp.includes("n^2") || comp.includes("n²") || comp.includes("n*n") || comp.includes("n*m") || comp.includes("m*n") || comp.includes("t(n-1)+o(n)")) return 7;
  if (comp.includes("nlogn") || comp.includes("n*log") || comp.includes("nlog") || comp.includes("2t(n/2)+o(n)") || comp.includes("t(n-1)+o(log")) return 6;
  if (comp.includes("v+e") || comp.includes("e+v") || comp.includes("n+m") || comp.includes("m+n")) return 5;
  if (comp.includes("o(n)") || comp.includes("o(m)") || comp.includes("2t(n/2)+o(1)") || comp.includes("t(n/2)+o(n)") || comp.includes("t(n-1)+o(1)")) return 4;
  if (comp.includes("√n") || comp.includes("sqrt")) return 3;
  if (comp.includes("logn") || comp.includes("log(n)") || comp.includes("log") || comp.includes("t(n/2)+o(1)")) return 2;
  if (comp.includes("o(1)")) return 1;
  return defaultWeight;
};

export const sanitizePythonCode = (code) => {
  if (!code) return "";
  return code.replace(/[\u00A0\u1680\u180E\u2000-\u200B\u202F\u205F\u3000]/g, " ");
};

export const parseMarkdown = (str) => {
  if (!str) return "";
  let html = str.trim();

  html = html.replace(/^###\s+(.*)$/gm, '<h3 class="overall-main-title">$1</h3>');
  html = html.replace(/^####\s+(.*)$/gm, '<h4 class="overall-sub-title">$1</h4>');
  html = html.replace(/^#####\s+(.*)$/gm, '<h5 class="overall-section-title">$1</h5>');

  html = html.replace(/\*\*(Step \d+:.*?)\*\*/g, '<span class="step-badge">$1</span>');
  html = html.replace(/\*\*(\d+\.\s.*?)\*\*/g, '<span class="step-badge">$1</span>');
  html = html.replace(/\*\*(Asymptotic Simplification|Final Asymptotic Complexity:?|Complexity Summary)\*\*/g, '<h5 class="overall-section-title">$1</h5>');

  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/([a-zA-Z0-9_]+)\^([a-zA-Z0-9+\x2f-]+)/g, '$1<sup>$2</sup>');

  html = html.replace(/^`([TS]\(n\)\s*=.*?)`$/gm, '<div class="math-block">$1</div>');
  html = html.replace(/`([TS]\(n\)\s*=.*?)`/g, '<div class="math-block">$1</div>');
  html = html.replace(/`([^`]+)`/g, '<code class="nlg-inline-code">$1</code>');

  let blocks = html.split(/\n\s*\n/);
  let parsedBlocks = blocks.map(block => {
    if (block.includes('<h3') || block.includes('<h4') || block.includes('<h5') || block.includes('<div class="math-block"')) {
      return block.replace(/\n/g, '<br/>');
    }

    if (/^[-*]\s+/m.test(block)) {
      let listItems = block.split('\n').reduce((acc, line) => {
        let trimmed = line.trim();
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          acc.push(`<li>${trimmed.substring(2).trim()}</li>`);
        } else if (trimmed !== '') {
          if (acc.length > 0) acc[acc.length - 1] = acc[acc.length - 1].replace('</li>', ` ${trimmed}</li>`);
          else acc.push(`<li>${trimmed}</li>`);
        }
        return acc;
      }, []).join('');
      return `<ul class="nlg-list">${listItems}</ul>`;
    }

    return `<p>${block.replace(/\n/g, '<br/>')}</p>`;
  });

  return parsedBlocks.join('');
};

export const formatExplanation = (text) => {
  if (!text) return null;

  const headerRegex = /(?=\*\*Local Analysis:\*\*|\*\*Global Impact:\*\*|\*\*Educational Insight:\*\*|\*\*Bottleneck Warning:\*\*|\*\*Space Bottleneck:\*\*|\*\*Algorithmic Mastery:\*\*|\*\*Local & Global Analysis:\*\*|\*Profiler verified)/;
  const sections = text.split(headerRegex);

  return sections.map((sec, idx) => {
    let trimmedSec = sec.trim();
    if (!trimmedSec) return null;

    const renderBlock = (content, title, variantClass) => {
      const parsedContent = parseMarkdown(content);
      return (
        <div key={idx} className={`nlg-block ${variantClass}`}>
          <strong className="nlg-block-title">{title}</strong>
          <div className="nlg-block-content" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(parsedContent) }} />
        </div>
      );
    };

    if (trimmedSec.startsWith("**Local & Global Analysis:**")) return renderBlock(trimmedSec.replace("**Local & Global Analysis:**", "").trim(), "Dead Code Analysis", "nlg-deadcode");
    if (trimmedSec.startsWith("**Local Analysis:**")) return renderBlock(trimmedSec.replace("**Local Analysis:**", "").trim(), "Local Analysis", "nlg-local");
    if (trimmedSec.startsWith("**Global Impact:**")) return renderBlock(trimmedSec.replace("**Global Impact:**", "").trim(), "Global Impact", "nlg-global");
    if (trimmedSec.startsWith("**Educational Insight:**")) return renderBlock(trimmedSec.replace("**Educational Insight:**", "").trim(), "Educational Insight", "nlg-educational");
    if (trimmedSec.startsWith("**Bottleneck Warning:**") || trimmedSec.startsWith("**Space Bottleneck:**")) {
      const cleanText = trimmedSec.replace(/\*\*(Bottleneck Warning:|Space Bottleneck:|Space Bottleneck)\*\*/g, "").trim();
      return renderBlock(cleanText, "Performance Bottleneck", "nlg-bottleneck");
    }
    if (trimmedSec.startsWith("**Algorithmic Mastery:**")) return renderBlock(trimmedSec.replace("**Algorithmic Mastery:**", "").trim(), "Algorithmic Mastery", "nlg-mastery");
    if (trimmedSec.startsWith("*Profiler verified")) return renderBlock(trimmedSec.replace(/\*Profiler verified\*/g, "").replace(/\*Profiler verified/g, "").trim(), "Runtime Diagnostic", "nlg-profiler");

    let parsedSec = parseMarkdown(trimmedSec);
    return <div key={idx} className="nlg-paragraph" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(parsedSec) }}></div>;
  }).filter(Boolean);
};

export const usePanelResizer = (initialHeight = 300) => {
  const [panelHeight, setPanelHeight] = useState(initialHeight);
  const isDragging = useRef(false);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging.current) return;
      const newHeight = window.innerHeight - e.clientY - 48;
      if (newHeight >= 150 && newHeight <= window.innerHeight - 150) setPanelHeight(newHeight);
    };
    const handleMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = "default"; document.body.style.userSelect = "auto";
    };
    document.addEventListener("mousemove", handleMouseMove); document.addEventListener("mouseup", handleMouseUp);
    return () => { document.removeEventListener("mousemove", handleMouseMove); document.removeEventListener("mouseup", handleMouseUp); };
  }, []);

  const handleDragStart = (e) => {
    e.preventDefault(); isDragging.current = true;
    document.body.style.cursor = "ns-resize"; document.body.style.userSelect = "none";
  };

  return { panelHeight, handleDragStart };
};