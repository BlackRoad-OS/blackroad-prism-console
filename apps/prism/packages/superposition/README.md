# @prism/superposition

TypeScript implementation of the BlackRoad / Amundson superposition framework for quantum-inspired agent beliefs and identities.

This is a direct port of the Python `br_superposition` module with added React visualization components.

## Overview

The module implements two categories of equations:

### BlackRoad Equations (Established Quantum Mechanics)
- **Born Rule**: `pᵢ = |aᵢ|²` - Probability from amplitude
- **Shannon Entropy**: `H = -Σ pᵢ log₂(pᵢ)` - Uncertainty measure
- **Normalization**: `Σ |aᵢ|² = 1` - Amplitude constraint
- **Measurement Collapse**: Projective measurement causing state collapse

### Amundson Equations (Novel Extensions)
- **Contradiction Energy**: `K(t) = C × exp(λ × |Δ|)` - Cost of contradictions
- **Phase Gap**: `max |θᵢ - θⱼ|` - Coherence measure across states
- **Temperature Transform**: `pᵢ(T) ∝ pᵢ^(1/T)` - Distribution sharpening/flattening
- **Partial Collapse**: `p'ᵢ = (1-μ)pᵢ + μqᵢ` - Soft measurement backaction
- **Spiral Mapping**: Polar visualization of superposition states

## Core API

### SuperposedVariable

```typescript
import { SuperposedVariable, complex } from "@prism/superposition";

// Create a superposed belief
const belief = new SuperposedVariable(new Map([
  ["true", complex(0.6, 0.3)],
  ["false", complex(0.5, -0.4)]
]));

// Get probabilities (Born rule)
const probs = belief.probabilities();

// Calculate entropy
const entropy = belief.entropy();

// Apply temperature transform
const sharpened = belief.withTemperature(0.5);  // Sharper
const flattened = belief.withTemperature(2.0);  // Flatter
```

### Agent

```typescript
import { Agent, SuperposedVariable, complex } from "@prism/superposition";

const agent = new Agent();

// Add beliefs
const belief = new SuperposedVariable(new Map([
  ["launch", complex(0.7, 0)],
  ["wait", complex(0.3, 0)]
]));
agent.addBelief("decision", belief);

// Hard measurement (full collapse)
const outcome = agent.measureHard("decision");

// Soft measurement (partial collapse)
const softOutcome = agent.measureSoft("decision", 0.1);
```

### Orchestrator

```typescript
import { Orchestrator, CoherenceBudget } from "@prism/superposition";

// Create orchestrator with budget
const orchestrator = new Orchestrator(new CoherenceBudget(100));

// Configure measurement
const config = {
  strength: 0.1,  // Soft measurement
  temperatureShift: undefined,
  costMultiplier: 1.0
};

// Perform measurement
const [outcome, success] = orchestrator.measure(
  agent,
  "decision",
  config,
  "belief"
);

// Check remaining budget
const budget = orchestrator.getBudget();
```

## React Components

### SpiralPlot

Visualizes superposition states in polar coordinates:

```tsx
import { SpiralPlot } from "@prism/web/components/superposition";

<SpiralPlot
  variable={beliefVariable}
  width={400}
  height={400}
  showLabels={true}
  highlightState="true"
  onStateClick={(state) => console.log(state)}
/>
```

### SuperpositionViewer

Comprehensive view with statistics and spiral plot:

```tsx
import { SuperpositionViewer } from "@prism/web/components/superposition";

<SuperpositionViewer
  variable={beliefVariable}
  title="Agent Belief State"
  showSpiral={true}
  onMeasure={(state, strength) => performMeasurement(state, strength)}
/>
```

## Demo Page

See `apps/prism/apps/web/src/pages/SuperpositionDemo.tsx` for a complete interactive demonstration.

The demo shows:
- Real-time probability visualization
- Entropy and phase gap calculations
- Soft vs hard measurements
- Temperature transforms
- Coherence budget tracking
- Spiral plot visualization

## Utility Functions

```typescript
import {
  phaseGap,
  contradictionEnergy,
  spiralMapping,
  beliefDistance
} from "@prism/superposition";

// Phase gap (coherence measure)
const gap = phaseGap(amplitudes);

// Contradiction energy
const K = contradictionEnergy(1.0, 0.5, 2.0);

// Spiral coordinates for visualization
const coords = spiralMapping(amplitudes);

// Distance between beliefs (Hellinger)
const distance = beliefDistance(belief1, belief2);
```

## Integration with Lucidia

The spiral plot visualization can be integrated into the Lucidia viewer to show real-time agent belief states during execution.

To add to Lucidia:
1. Import `SuperpositionViewer` in your Lucidia dashboard
2. Connect it to agent state updates via WebSocket or polling
3. Display alongside trace and event timelines

## Differences from Python Version

- Complex numbers are represented as `{real, imag}` objects
- Maps are used instead of Python dictionaries
- TypeScript provides static typing for better IDE support
- React components provide browser-based visualization
- All core algorithms remain mathematically identical

## Testing

```bash
# Run tests (when implemented)
npm test
```

## See Also

- Python version: `/br_superposition/`
- Demo: Run the Prism web app and navigate to `/superposition-demo`
- Docs: `docs/BLACKROAD_AMUNDSON_SPEC.md` (if available)
