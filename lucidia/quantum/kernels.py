"""Quantum kernel utilities."""

from __future__ import annotations

from typing import Any, Optional

import numpy as np
from qiskit_machine_learning.algorithms import PegasosQSVC

try:  # qiskit-machine-learning < 0.7
    from qiskit_machine_learning.kernels import QuantumKernel
except ImportError:  # pragma: no cover - compatibility path
    from qiskit_machine_learning.kernels import FidelityQuantumKernel as QuantumKernel

from .backends import AerCPUBackend, QuantumBackend


def fit_qsvc(
    x: np.ndarray,
    y: np.ndarray,
    kernel_opts: Optional[dict[str, Any]] = None,
    backend: Optional[QuantumBackend] = None,
) -> PegasosQSVC:
    """Train a PegasosQSVC on the given data using a local quantum kernel."""

    backend = backend or AerCPUBackend()
    kernel = QuantumKernel(quantum_instance=backend.simulator, **(kernel_opts or {}))
    model = PegasosQSVC(quantum_kernel=kernel)
    model.fit(x, y)
    return model
