/**
 * SuperpositionViewer: Comprehensive view of superposed variable state
 *
 * Shows:
 * - Probabilities (Born rule)
 * - Shannon entropy
 * - Phase gap (Amundson)
 * - Contradiction energy (Amundson)
 * - Spiral plot visualization
 */

import React, { useMemo } from "react";
import { SuperposedVariable, phaseGap, contradictionEnergy } from "../../../../../packages/superposition/src";
import { SpiralPlot } from "./SpiralPlot";

interface SuperpositionViewerProps<T = string> {
  variable: SuperposedVariable<T>;
  title?: string;
  showSpiral?: boolean;
  onMeasure?: (state: T, strength: number) => void;
}

export function SuperpositionViewer<T = string>({
  variable,
  title = "Superposed Variable",
  showSpiral = true,
  onMeasure,
}: SuperpositionViewerProps<T>) {
  const stats = useMemo(() => {
    const probs = variable.probabilities();
    const entropy = variable.entropy();
    const gap = phaseGap(variable.amplitudes);

    // Calculate contradiction energy
    // Δ = difference between highest and lowest probability
    const probValues = Array.from(probs.values());
    const maxProb = Math.max(...probValues);
    const minProb = Math.min(...probValues);
    const delta = maxProb - minProb;
    const K = contradictionEnergy(1.0, delta, 2.0);

    // Get states sorted by probability
    const sortedStates = Array.from(probs.entries()).sort((a, b) => b[1] - a[1]);

    return {
      probs,
      entropy,
      gap,
      K,
      delta,
      sortedStates,
      maxStates: variable.states().length,
      maxEntropy: Math.log2(variable.states().length),
    };
  }, [variable]);

  return (
    <div className="superposition-viewer" style={{ fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: "1rem" }}>
        <h3 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600, color: "#111827" }}>{title}</h3>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: showSpiral ? "1fr 1fr" : "1fr", gap: "1.5rem" }}>
        {/* Statistics Panel */}
        <div>
          {/* Probabilities */}
          <div style={{ marginBottom: "1.5rem" }}>
            <h4 style={{ margin: "0 0 0.5rem 0", fontSize: "0.875rem", fontWeight: 600, color: "#374151" }}>
              Probabilities (Born Rule)
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {stats.sortedStates.map(([state, prob]) => (
                <div key={String(state)} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "0.875rem",
                        color: "#111827",
                        marginBottom: "0.25rem",
                        fontWeight: 500,
                      }}
                    >
                      {String(state)}
                    </div>
                    <div
                      style={{
                        height: "6px",
                        background: "#e5e7eb",
                        borderRadius: "3px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${prob * 100}%`,
                          background: "#3b82f6",
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>
                  </div>
                  <div style={{ fontSize: "0.875rem", color: "#6b7280", fontWeight: 500, minWidth: "60px", textAlign: "right" }}>
                    {(prob * 100).toFixed(2)}%
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Metrics */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            {/* Shannon Entropy (BlackRoad) */}
            <div
              style={{
                padding: "1rem",
                background: "#f9fafb",
                borderRadius: "0.5rem",
                border: "1px solid #e5e7eb",
              }}
            >
              <div style={{ fontSize: "0.75rem", color: "#6b7280", marginBottom: "0.25rem", fontWeight: 500 }}>
                Shannon Entropy
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#111827" }}>
                {stats.entropy.toFixed(3)}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: "0.25rem" }}>
                max: {stats.maxEntropy.toFixed(3)} bits
              </div>
              <div style={{ fontSize: "0.625rem", color: "#3b82f6", marginTop: "0.5rem", fontStyle: "italic" }}>
                BlackRoad
              </div>
            </div>

            {/* Phase Gap (Amundson) */}
            <div
              style={{
                padding: "1rem",
                background: "#fef3c7",
                borderRadius: "0.5rem",
                border: "1px solid #fde68a",
              }}
            >
              <div style={{ fontSize: "0.75rem", color: "#92400e", marginBottom: "0.25rem", fontWeight: 500 }}>
                Phase Gap
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#78350f" }}>
                {stats.gap.toFixed(3)}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#b45309", marginTop: "0.25rem" }}>
                {((stats.gap * 180) / Math.PI).toFixed(1)}°
              </div>
              <div style={{ fontSize: "0.625rem", color: "#d97706", marginTop: "0.5rem", fontStyle: "italic" }}>
                Amundson
              </div>
            </div>

            {/* Contradiction Energy (Amundson) */}
            <div
              style={{
                padding: "1rem",
                background: "#fce7f3",
                borderRadius: "0.5rem",
                border: "1px solid #fbcfe8",
              }}
            >
              <div style={{ fontSize: "0.75rem", color: "#831843", marginBottom: "0.25rem", fontWeight: 500 }}>
                Contradiction K(t)
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#9f1239" }}>
                {stats.K.toFixed(3)}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#be123c", marginTop: "0.25rem" }}>
                Δ = {stats.delta.toFixed(3)}
              </div>
              <div style={{ fontSize: "0.625rem", color: "#e11d48", marginTop: "0.5rem", fontStyle: "italic" }}>
                Amundson
              </div>
            </div>

            {/* State Count */}
            <div
              style={{
                padding: "1rem",
                background: "#f0fdf4",
                borderRadius: "0.5rem",
                border: "1px solid #bbf7d0",
              }}
            >
              <div style={{ fontSize: "0.75rem", color: "#14532d", marginBottom: "0.25rem", fontWeight: 500 }}>
                State Count
              </div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#15803d" }}>
                {stats.maxStates}
              </div>
              <div style={{ fontSize: "0.75rem", color: "#16a34a", marginTop: "0.25rem" }}>
                superposed
              </div>
            </div>
          </div>

          {/* Measurement Controls */}
          {onMeasure && (
            <div style={{ marginTop: "1.5rem" }}>
              <h4 style={{ margin: "0 0 0.5rem 0", fontSize: "0.875rem", fontWeight: 600, color: "#374151" }}>
                Perform Measurement
              </h4>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                {stats.sortedStates.map(([state]) => (
                  <button
                    key={String(state)}
                    onClick={() => onMeasure(state, 1.0)}
                    style={{
                      padding: "0.5rem 1rem",
                      background: "#3b82f6",
                      color: "white",
                      border: "none",
                      borderRadius: "0.375rem",
                      fontSize: "0.875rem",
                      fontWeight: 500,
                      cursor: "pointer",
                    }}
                  >
                    Measure: {String(state)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Spiral Plot */}
        {showSpiral && (
          <div>
            <SpiralPlot variable={variable} width={400} height={400} showLabels={true} />
          </div>
        )}
      </div>
    </div>
  );
}
