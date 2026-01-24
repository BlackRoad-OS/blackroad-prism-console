/**
 * SuperpositionDemo: Interactive demonstration of BlackRoad/Amundson framework
 *
 * Demonstrates:
 * - Creating superposed beliefs
 * - Measuring with different strengths
 * - Temperature transformations
 * - Coherence budget tracking
 * - Real-time visualization
 */

import React, { useState } from "react";
import {
  SuperposedVariable,
  Agent,
  Orchestrator,
  CoherenceBudget,
  complex,
  type MeasurementConfig,
} from "../../../../packages/superposition/src";
import { SuperpositionViewer } from "../components/superposition/SuperpositionViewer";

export function SuperpositionDemo() {
  // Initial belief: "Should we launch RoadChain?"
  const [agent, setAgent] = useState(() => {
    const belief = new SuperposedVariable(
      new Map([
        ["Launch", complex(0.6, 0.3)],
        ["Don't Launch", complex(0.5, -0.4)],
      ])
    );

    const a = new Agent();
    a.addBelief("launch_roadchain", belief);
    return a;
  });

  const [orchestrator] = useState(() => new Orchestrator(new CoherenceBudget(100)));

  const [measurementStrength, setMeasurementStrength] = useState(0.5);
  const [temperature, setTemperature] = useState(1.0);
  const [history, setHistory] = useState<string[]>([]);

  const currentBelief = agent.getBelief<string>("launch_roadchain");

  const performMeasurement = (outcome: string) => {
    if (!currentBelief) return;

    const config: MeasurementConfig = {
      strength: measurementStrength,
      costMultiplier: 1.0,
    };

    const [result, success] = orchestrator.measure(agent, "launch_roadchain", config, "belief", outcome);

    if (success) {
      const msg = `Measured "${result}" with strength ${measurementStrength.toFixed(2)}. Budget: ${orchestrator.getBudget().toFixed(2)}`;
      setHistory((h) => [msg, ...h]);
      // Force re-render
      setAgent(new Agent(agent.getBeliefNames().reduce((acc, name) => {
        const b = agent.getBelief(name);
        if (b) acc.set(name, b);
        return acc;
      }, new Map()), agent.identities || undefined));
    } else {
      const msg = "Measurement failed: insufficient coherence budget";
      setHistory((h) => [msg, ...h]);
    }
  };

  const applyTemperature = () => {
    if (!currentBelief) return;

    const transformed = currentBelief.withTemperature(temperature);
    agent.addBelief("launch_roadchain", transformed);

    const msg = `Applied temperature T=${temperature.toFixed(2)}. ${
      temperature < 1 ? "Sharpened" : temperature > 1 ? "Flattened" : "No change"
    }`;
    setHistory((h) => [msg, ...h]);
    setAgent(new Agent(agent.getBeliefNames().reduce((acc, name) => {
      const b = agent.getBelief(name);
      if (b) acc.set(name, b);
      return acc;
    }, new Map()), agent.identities || undefined));
  };

  const resetState = () => {
    const belief = new SuperposedVariable(
      new Map([
        ["Launch", complex(0.6, 0.3)],
        ["Don't Launch", complex(0.5, -0.4)],
      ])
    );

    const a = new Agent();
    a.addBelief("launch_roadchain", belief);
    setAgent(a);
    orchestrator.resetBudget(100);
    orchestrator.clearHistory();
    setHistory([]);
  };

  if (!currentBelief) {
    return <div>No belief loaded</div>;
  }

  return (
    <div style={{ padding: "2rem", maxWidth: "1400px", margin: "0 auto", fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ margin: 0, fontSize: "2rem", fontWeight: 700, color: "#111827" }}>
          BlackRoad / Amundson Superposition Demo
        </h1>
        <p style={{ marginTop: "0.5rem", color: "#6b7280", fontSize: "1rem" }}>
          Interactive demonstration of quantum-inspired agent beliefs
        </p>
      </div>

      {/* Main Content Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "2rem" }}>
        {/* Left: Visualization */}
        <div>
          <SuperpositionViewer
            variable={currentBelief}
            title='Belief: "Should we launch RoadChain?"'
            showSpiral={true}
            onMeasure={(state) => performMeasurement(state as string)}
          />
        </div>

        {/* Right: Controls and History */}
        <div>
          {/* Budget Status */}
          <div
            style={{
              padding: "1rem",
              background: "#f9fafb",
              borderRadius: "0.5rem",
              border: "1px solid #e5e7eb",
              marginBottom: "1.5rem",
            }}
          >
            <h3 style={{ margin: "0 0 1rem 0", fontSize: "1rem", fontWeight: 600, color: "#374151" }}>
              Coherence Budget
            </h3>
            <div style={{ fontSize: "2rem", fontWeight: 700, color: "#111827" }}>
              {orchestrator.getBudget().toFixed(2)}
            </div>
            <div
              style={{
                marginTop: "0.5rem",
                height: "8px",
                background: "#e5e7eb",
                borderRadius: "4px",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${Math.min(orchestrator.getBudget(), 100)}%`,
                  background: orchestrator.getBudget() > 20 ? "#10b981" : "#ef4444",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
          </div>

          {/* Measurement Controls */}
          <div
            style={{
              padding: "1rem",
              background: "#f9fafb",
              borderRadius: "0.5rem",
              border: "1px solid #e5e7eb",
              marginBottom: "1.5rem",
            }}
          >
            <h3 style={{ margin: "0 0 1rem 0", fontSize: "1rem", fontWeight: 600, color: "#374151" }}>
              Measurement Strength
            </h3>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={measurementStrength}
              onChange={(e) => setMeasurementStrength(parseFloat(e.target.value))}
              style={{ width: "100%", marginBottom: "0.5rem" }}
            />
            <div style={{ fontSize: "0.875rem", color: "#6b7280" }}>
              μ = {measurementStrength.toFixed(2)} {measurementStrength < 0.3 ? "(soft)" : measurementStrength > 0.9 ? "(hard)" : "(medium)"}
            </div>
          </div>

          {/* Temperature Controls */}
          <div
            style={{
              padding: "1rem",
              background: "#fef3c7",
              borderRadius: "0.5rem",
              border: "1px solid #fde68a",
              marginBottom: "1.5rem",
            }}
          >
            <h3 style={{ margin: "0 0 1rem 0", fontSize: "1rem", fontWeight: 600, color: "#78350f" }}>
              Temperature Transform
            </h3>
            <input
              type="range"
              min="0.1"
              max="3"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(parseFloat(e.target.value))}
              style={{ width: "100%", marginBottom: "0.5rem" }}
            />
            <div style={{ fontSize: "0.875rem", color: "#92400e", marginBottom: "0.75rem" }}>
              T = {temperature.toFixed(2)} {temperature < 1 ? "(sharpen)" : temperature > 1 ? "(flatten)" : "(neutral)"}
            </div>
            <button
              onClick={applyTemperature}
              style={{
                width: "100%",
                padding: "0.5rem",
                background: "#f59e0b",
                color: "white",
                border: "none",
                borderRadius: "0.375rem",
                fontSize: "0.875rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Apply Temperature
            </button>
          </div>

          {/* Reset */}
          <button
            onClick={resetState}
            style={{
              width: "100%",
              padding: "0.75rem",
              background: "#ef4444",
              color: "white",
              border: "none",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: "pointer",
              marginBottom: "1.5rem",
            }}
          >
            Reset Demo
          </button>

          {/* History */}
          <div
            style={{
              padding: "1rem",
              background: "#f9fafb",
              borderRadius: "0.5rem",
              border: "1px solid #e5e7eb",
            }}
          >
            <h3 style={{ margin: "0 0 1rem 0", fontSize: "1rem", fontWeight: 600, color: "#374151" }}>
              Event History
            </h3>
            <div style={{ maxHeight: "300px", overflowY: "auto" }}>
              {history.length === 0 ? (
                <div style={{ fontSize: "0.875rem", color: "#9ca3af", fontStyle: "italic" }}>
                  No events yet. Perform a measurement or temperature transform.
                </div>
              ) : (
                history.map((msg, idx) => (
                  <div
                    key={idx}
                    style={{
                      fontSize: "0.75rem",
                      color: "#374151",
                      padding: "0.5rem",
                      background: idx === 0 ? "#e0e7ff" : "transparent",
                      borderRadius: "0.25rem",
                      marginBottom: "0.25rem",
                    }}
                  >
                    {msg}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer Explanation */}
      <div
        style={{
          marginTop: "2rem",
          padding: "1.5rem",
          background: "#eff6ff",
          borderRadius: "0.5rem",
          border: "1px solid #bfdbfe",
        }}
      >
        <h3 style={{ margin: "0 0 1rem 0", fontSize: "1rem", fontWeight: 600, color: "#1e3a8a" }}>
          What You're Seeing
        </h3>
        <ul style={{ margin: 0, paddingLeft: "1.5rem", color: "#1e40af", fontSize: "0.875rem", lineHeight: "1.6" }}>
          <li>
            <strong>Probabilities:</strong> Computed via Born rule (|amplitude|²) - BlackRoad equation
          </li>
          <li>
            <strong>Entropy:</strong> Shannon entropy measuring uncertainty - BlackRoad equation
          </li>
          <li>
            <strong>Phase Gap:</strong> Maximum phase difference between states - Amundson equation
          </li>
          <li>
            <strong>Contradiction K(t):</strong> Energy cost of conflicting beliefs (C × e^(λ|Δ|)) - Amundson equation
          </li>
          <li>
            <strong>Spiral Plot:</strong> Each state's position encodes magnitude (distance) and phase (angle)
          </li>
          <li>
            <strong>Measurements:</strong> Soft (μ &lt; 1) cause partial collapse, Hard (μ ≈ 1) cause full collapse
          </li>
          <li>
            <strong>Temperature:</strong> T &lt; 1 sharpens (more peaked), T &gt; 1 flattens (more uniform)
          </li>
        </ul>
      </div>
    </div>
  );
}
