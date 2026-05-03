// frontend/src/components/ComplexityGraph.jsx
import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { resolveRecurrenceToBigO } from '../utils/formatters';

// Simple math helper for calculating O(n!)
const factorial = (n) => (n <= 1 ? 1 : n * factorial(n - 1));

const ComplexityGraph = ({ complexity, color, label }) => {
  // 1. Resolve any T(n) recurrence relations into standard Big-O notation
  const resolvedComplexity = resolveRecurrenceToBigO(complexity);

  // 2. Generate curve data based on the mathematical shape of the resolved complexity
  const data = useMemo(() => {
    const dataPoints = [];
    // Strip out spaces and lowercase for easier matching
    const comp = resolvedComplexity.toLowerCase().replace(/\s+/g, '');
    
    // Generate 10 data points to form the curve (n = 1 through 10)
    for (let i = 1; i <= 10; i++) {
      let yVal = 0;
      
      if (comp.includes("o(1)")) {
        yVal = 1; // Constant: flat line
      } else if (comp.includes("logn")) {
        yVal = Math.log2(i + 1); // Logarithmic: slow curve up
      } else if (comp.includes("nlogn")) {
        yVal = i * Math.log2(i + 1); // Linearithmic: slight bend
      } else if (comp.includes("n^2") || comp.includes("n²")) {
        yVal = Math.pow(i, 2); // Quadratic: steep curve
      } else if (comp.includes("n^3") || comp.includes("n³")) {
        yVal = Math.pow(i, 3); // Cubic: very steep curve
      } else if (comp.includes("2^n") || comp.includes("2ⁿ")) {
        yVal = Math.pow(2, i); // Exponential: rocket ship
      } else if (comp.includes("n!")) {
        yVal = factorial(i); // Factorial: near vertical wall
      } else if (comp.includes("o(n)")) {
        yVal = i; // Linear: straight diagonal line
      } else {
        yVal = i; // Default fallback to linear
      }

      dataPoints.push({
        n: i,
        operations: Number(yVal.toFixed(2))
      });
    }
    return dataPoints;
  }, [resolvedComplexity]);

  return (
    <div style={{ width: '100%', height: '100%', minHeight: '120px' }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          
          <XAxis 
            dataKey="n" 
            stroke="#888" 
            tickLine={false} 
            axisLine={false} 
            tick={false} // This hides the X-axis numbers completely
          />
          
          <YAxis 
            stroke="#888" 
            tickLine={false} 
            axisLine={false} 
            tick={false} // This hides the Y-axis numbers completely
          />
          
          <Tooltip 
            contentStyle={{ 
              backgroundColor: '#1C1236', 
              border: `1px solid ${color}`, 
              borderRadius: '6px',
              color: '#fff', 
              fontSize: '0.8rem',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
            }}
            itemStyle={{ color: color, fontWeight: 'bold' }}
            labelStyle={{ color: '#A096B9', marginBottom: '4px' }}
            labelFormatter={(label) => `Input Size (n): ${label}`}
            formatter={(value) => [value, label || 'Operations']}
            animationDuration={200}
          />
          
          <Line 
            type="monotone" 
            dataKey="operations" 
            stroke={color} 
            strokeWidth={3} 
            dot={false} // Hiding dots makes the curve look much smoother and premium
            activeDot={{ r: 5, fill: '#fff', stroke: color, strokeWidth: 2 }}
            animationDuration={1200}
            animationEasing="ease-out"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ComplexityGraph;