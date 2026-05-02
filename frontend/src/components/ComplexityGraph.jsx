/*frontend\src\components\ComplexityGraph.jsx*/
import { useMemo } from 'react';
import { Line, LineChart, ResponsiveContainer, YAxis } from 'recharts';

const generateSparklineData = (complexity) => {
  const data = [];
  const N = 40; // Increased resolution for truer mathematical arcs

  for (let n = 1; n <= N; n++) {
    let yValue = 0;
    
    // Ensure complexity is a string before calling toLowerCase
    const safeComp = complexity ? String(complexity).toLowerCase() : "";

    // Strictly map to real mathematical functions for accurate graph shapes
    if (safeComp.includes("o(1)")) {
      yValue = 10; // Perfectly flat horizontal line
    } 
    else if (safeComp.includes("log n")) {
      yValue = Math.log2(n + 1); // True logarithmic curve (rises fast, then flattens)
    } 
    else if (safeComp.includes("√n") || safeComp.includes("sqrt")) {
      yValue = Math.sqrt(n); // Square root curve
    } 
    else if (safeComp.includes("n^2") || safeComp.includes("n²")) {
      yValue = Math.pow(n, 2); // True parabolic curve
    } 
    else if (safeComp.includes("n^3") || safeComp.includes("n³")) {
      yValue = Math.pow(n, 3); // Steeper cubic curve
    } 
    else if (safeComp.includes("n log n")) {
      yValue = n * Math.log2(n + 1); // Linearithmic (slightly curved linear)
    } 
    else if (safeComp.includes("2^n") || safeComp.includes("2ⁿ")) {
      // Scaled 'n' down slightly to prevent JavaScript number overflow on the Y-Axis,
      // but preserves the brutal "hockey-stick" vertical shoot-up characteristic of O(2^n).
      yValue = Math.pow(2, n / 4); 
    } 
    else if (safeComp.includes("n!") || safeComp.includes("t(n-1)")) {
      // Gamma-like scaling for factorial. Shoots up even more violently than exponential.
      yValue = Math.pow(n, n / 8); 
    } 
    else {
      // Default O(n) or O(V + E)
      yValue = n; // Perfectly straight diagonal line
    }
    
    data.push({ operations: yValue });
  }
  return data;
};

const ComplexityGraph = ({ complexity, color = "#e67e22", label = "" }) => {
  const data = useMemo(() => generateSparklineData(complexity), [complexity]);

  if (!complexity || complexity === "-" || complexity === "Definition" || complexity === "Analyzing...") return null;

  return (
    <div style={{ 
      flex: 1,
      minWidth: '200px',
      backgroundColor: 'rgba(255,255,255,0.05)', 
      borderRadius: '12px',
      padding: '15px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      border: `1px solid ${color}33` // Faint border matching complexity color
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#888', textTransform: 'uppercase' }}>
          {label}
        </span>
        <span style={{ fontSize: '16px', fontWeight: 'bold', color: color }}>
          {complexity}
        </span>
      </div>
      
      <div style={{ width: '100%', height: '80px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            {/* Auto-scaling Y-Axis allows the relative shape of the mathematical curve to dominate */}
            <YAxis hide={true} domain={['dataMin', 'dataMax']} />
            <Line 
              type="monotone" // Changed from 'basis' to 'monotone' to prevent artificial/wobbly curving
              dataKey="operations" 
              stroke={color} 
              strokeWidth={4} 
              dot={false}
              isAnimationActive={true}
              animationDuration={1500}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ComplexityGraph;