/**
 * SpiralPlot: Visualize superposition states in polar coordinates
 *
 * Maps each state to a 2D point based on amplitude:
 * - Distance from center: magnitude (√probability)
 * - Angle: phase
 */

import React, { useMemo } from "react";
import { SuperposedVariable, spiralMapping, type Complex, type Point2D } from "../../../../../packages/superposition/src";

interface SpiralPlotProps<T = string> {
  variable: SuperposedVariable<T>;
  width?: number;
  height?: number;
  showLabels?: boolean;
  highlightState?: T;
  onStateClick?: (state: T) => void;
}

const COLORS = [
  "#3b82f6", // blue
  "#10b981", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
];

export function SpiralPlot<T = string>({
  variable,
  width = 400,
  height = 400,
  showLabels = true,
  highlightState,
  onStateClick,
}: SpiralPlotProps<T>) {
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 40;

  const { coords, probs, maxMag } = useMemo(() => {
    const probs = variable.probabilities();
    const amps = variable.amplitudes;

    // Get spiral coordinates
    const rawCoords = spiralMapping(amps, { x: 0, y: 0 });

    // Find max magnitude for scaling
    let maxMag = 0;
    for (const amp of amps.values()) {
      const mag = Math.sqrt(amp.real * amp.real + amp.imag * amp.imag);
      maxMag = Math.max(maxMag, mag);
    }

    // Scale coordinates to fit the plot
    const coords = new Map<T, Point2D>();
    for (const [state, coord] of rawCoords.entries()) {
      coords.set(state, {
        x: centerX + (coord.x / maxMag) * radius,
        y: centerY - (coord.y / maxMag) * radius, // Flip Y for SVG
      });
    }

    return { coords, probs, maxMag };
  }, [variable, centerX, centerY, radius]);

  const states = Array.from(coords.keys());

  return (
    <svg width={width} height={height} className="spiral-plot">
      {/* Grid circles */}
      {[0.25, 0.5, 0.75, 1.0].map((fraction) => (
        <circle
          key={fraction}
          cx={centerX}
          cy={centerY}
          r={fraction * radius}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={1}
          strokeDasharray={fraction === 1.0 ? "none" : "4 4"}
        />
      ))}

      {/* Center dot */}
      <circle cx={centerX} cy={centerY} r={3} fill="#6b7280" />

      {/* Axes */}
      <line
        x1={centerX - radius}
        y1={centerY}
        x2={centerX + radius}
        y2={centerY}
        stroke="#d1d5db"
        strokeWidth={1}
      />
      <line
        x1={centerX}
        y1={centerY - radius}
        x2={centerX}
        y2={centerY + radius}
        stroke="#d1d5db"
        strokeWidth={1}
      />

      {/* State points */}
      {states.map((state, idx) => {
        const coord = coords.get(state)!;
        const prob = probs.get(state)!;
        const color = COLORS[idx % COLORS.length];
        const isHighlighted = highlightState === state;

        return (
          <g key={String(state)}>
            {/* Line from center to point */}
            <line
              x1={centerX}
              y1={centerY}
              x2={coord.x}
              y2={coord.y}
              stroke={color}
              strokeWidth={isHighlighted ? 2 : 1}
              opacity={0.5}
            />

            {/* State point */}
            <circle
              cx={coord.x}
              cy={coord.y}
              r={isHighlighted ? 10 : 8}
              fill={color}
              stroke={isHighlighted ? "#000" : "none"}
              strokeWidth={2}
              opacity={0.9}
              style={{ cursor: onStateClick ? "pointer" : "default" }}
              onClick={() => onStateClick?.(state)}
            />

            {/* Probability label */}
            {showLabels && (
              <text
                x={coord.x}
                y={coord.y - 15}
                textAnchor="middle"
                fontSize={12}
                fontWeight={isHighlighted ? "bold" : "normal"}
                fill={color}
              >
                {String(state)} ({(prob * 100).toFixed(1)}%)
              </text>
            )}
          </g>
        );
      })}

      {/* Phase angle indicators */}
      {states.map((state, idx) => {
        const amp = variable.amplitudes.get(state)!;
        const phase = Math.atan2(amp.imag, amp.real);
        const color = COLORS[idx % COLORS.length];

        // Arc from 0 to phase
        const startAngle = 0;
        const endAngle = phase;
        const arcRadius = 30;

        const startX = centerX + arcRadius * Math.cos(startAngle);
        const startY = centerY - arcRadius * Math.sin(startAngle);
        const endX = centerX + arcRadius * Math.cos(endAngle);
        const endY = centerY - arcRadius * Math.sin(endAngle);

        const largeArc = Math.abs(endAngle - startAngle) > Math.PI ? 1 : 0;
        const sweep = endAngle > startAngle ? 0 : 1;

        return (
          <path
            key={`arc-${String(state)}`}
            d={`M ${startX} ${startY} A ${arcRadius} ${arcRadius} 0 ${largeArc} ${sweep} ${endX} ${endY}`}
            fill="none"
            stroke={color}
            strokeWidth={1}
            opacity={0.3}
          />
        );
      })}

      {/* Legend */}
      <text x={10} y={20} fontSize={14} fontWeight="bold" fill="#374151">
        Amplitude Spiral
      </text>
      <text x={10} y={40} fontSize={11} fill="#6b7280">
        Distance = √probability, Angle = phase
      </text>
    </svg>
  );
}
