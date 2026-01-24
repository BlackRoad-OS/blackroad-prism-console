/**
 * BlackRoad / Amundson Superposition Module (TypeScript)
 *
 * Quantum-inspired framework for agent beliefs and identities
 */

export * from "./SuperposedVariable";
export * from "./Agent";
export * from "./Orchestrator";
export * from "./utils";

export { SuperposedVariable } from "./SuperposedVariable";
export { Agent } from "./Agent";
export { Orchestrator, CoherenceBudget } from "./Orchestrator";
export type { MeasurementConfig, MeasurementRecord, MeasurementMode } from "./Orchestrator";
