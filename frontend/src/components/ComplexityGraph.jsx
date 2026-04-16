import { useMemo } from 'react';
import { Line, LineChart, ResponsiveContainer, YAxis } from 'recharts';

const generateSparklineData = (complexity) => {
  const data = [];
  // 30 points for a high-definition smooth curve
  for (let n = 1; n <= 20; n++) {
    let yValue = 0;
    
    // Ensure complexity is a string before calling toLowerCase
    const safeComp = complexity ? String(complexity) : "";
    const cleanComp = safeComp.toLowerCase();

    if (cleanComp.includes("o(1)")) yValue = 10; 
    else if (cleanComp.includes("log n")) yValue = Math.log2(n + 1) * 10;
    // Added checks for the formatted unicode superscripts ² and ⁿ
    else if (cleanComp.includes("n^2") || cleanComp.includes("n²")) yValue = Math.pow(n, 2);
    else if (cleanComp.includes("n log n")) yValue = n * Math.log2(n + 1);
    else if (cleanComp.includes("2^n") || cleanComp.includes("2ⁿ")) yValue = Math.pow(1.3, n) * 5;
    else if (cleanComp.includes("n!")) yValue = n > 10 ? 1000 : [1,2,6,24,120,720,5040,40320,362880,3628800][n-1];
    else yValue = n * 5; // O(n) default
    
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
            <YAxis hide={true} domain={['dataMin', 'dataMax']} />
            <Line 
              type="basis" 
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