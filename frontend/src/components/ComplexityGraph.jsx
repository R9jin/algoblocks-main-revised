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
import '../styles/ComplexityGraph.css';
import { resolveRecurrenceToBigO } from '../utils/formatters';

// Simple math helper for calculating O(n!)
const factorial = (n) => (n <= 1 ? 1 : n * factorial(n - 1));

const ComplexityGraph = ({ complexity, color, label }) => {
  // 1. Resolve any T(n) recurrence relations into standard Big-O notation
  const resolvedComplexity = resolveRecurrenceToBigO(complexity);
  
  // Extract and evaluate the complexity string outside the useMemo so axes can read it
  const comp = resolvedComplexity.toLowerCase().replace(/\s+/g, '');
  const isConstant = comp.includes("o(1)");

  // 2. Generate curve data based on the mathematical shape of the resolved complexity
  const data = useMemo(() => {
    const dataPoints = [];
    
    // Start at 0 to ensure the line touches the far left Y-axis
    for (let i = 0; i <= 10; i++) {
      let yVal = 0;
      
      if (isConstant) {
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
  }, [comp, isConstant]);

  return (
    <div className="complexity-graph-container">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          
          <XAxis 
            dataKey="n" 
            type="number"           
            domain={[0, 'dataMax']} 
            stroke="#888" 
            tickLine={false} 
            axisLine={{ stroke: '#A096B9', strokeWidth: 2 }} // Colored, visible X-axis
            tick={false} 
          />
          
          <YAxis 
            type="number"           
            domain={[0, isConstant ? 10 : 'auto']} 
            stroke="#888" 
            tickLine={false} 
            axisLine={{ stroke: '#A096B9', strokeWidth: 2 }} // Colored, visible Y-axis
            tick={false} 
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
            dot={false} 
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