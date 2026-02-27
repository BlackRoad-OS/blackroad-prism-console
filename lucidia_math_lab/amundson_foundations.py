"""Amundson Foundations — core constants and computations.

Transcribed from the handwritten notes of Alexa Louise Amundson.
Covers six foundational topics that bridge computability, quantum
mechanics, number theory, and signal analysis:

1. **Halting Problem** — Turing's diagonal argument showing no
   universal halt-decider exists.
2. **Schrödinger Equation** — time-dependent and time-independent
   quantum wave evolution, with a 1-D particle-in-a-box solver.
3. **Heisenberg Uncertainty** — the fundamental limit
   σ_x · σ_p ≥ ħ/2 verified for Gaussian wave packets.
4. **Möbius Function μ(n)** — the multiplicative arithmetic function
   central to inversion formulas and the Riemann hypothesis.
5. **Fine-Structure Constant α** — the dimensionless coupling
   constant α ≈ 1/137 that governs electromagnetic interaction
   strength, with hydrogen energy-level corrections.
6. **Fourier Transform of a Gaussian** — demonstrating that a
   Gaussian remains Gaussian under Fourier transform, with the
   reciprocal width relation σ_f = 1/(2πσ_t).
"""

from __future__ import annotations

import cmath
import math
from typing import Callable, List, Tuple

import numpy as np

# ---------------------------------------------------------------------------
# Physical constants (SI)
# ---------------------------------------------------------------------------
HBAR = 1.054571817e-34        # reduced Planck constant  (J·s)
H_PLANCK = 6.62607015e-34     # Planck constant          (J·s)
M_ELECTRON = 9.1093837015e-31 # electron mass            (kg)
E_CHARGE = 1.602176634e-19    # elementary charge        (C)
EPSILON_0 = 8.8541878128e-12  # vacuum permittivity      (F/m)
C_LIGHT = 299792458.0         # speed of light           (m/s)
K_BOLTZMANN = 1.380649e-23    # Boltzmann constant       (J/K)

# Fine-structure constant  α = e² / (4πε₀ ħc)
ALPHA = E_CHARGE**2 / (4.0 * math.pi * EPSILON_0 * HBAR * C_LIGHT)

# Bohr radius  a₀ = ħ / (m_e c α)
BOHR_RADIUS = HBAR / (M_ELECTRON * C_LIGHT * ALPHA)

# Rydberg energy  E_R = m_e c² α² / 2  ≈ 13.6 eV
RYDBERG_ENERGY_J = 0.5 * M_ELECTRON * C_LIGHT**2 * ALPHA**2
RYDBERG_ENERGY_EV = RYDBERG_ENERGY_J / E_CHARGE


# ===================================================================
# 1. Halting Problem — Turing's diagonal construction
# ===================================================================

class HaltingProblemDemo:
    """Demonstrate Turing's proof that no universal halt-decider exists.

    From the notes:
        "Assume H(P, I) decides halting. Construct D(P) that does the
         opposite of H(P, P). Then D(D) leads to contradiction. ∎"

    This class provides a constructive illustration:
    * :meth:`simulate` runs a program (callable) with a step limit.
    * :meth:`diagonal_argument` shows the contradiction.
    """

    @staticmethod
    def simulate(program: Callable[[], object], timeout_seconds: float = 1.0) -> bool:
        """Run *program* with a time budget and return True if it halts.

        This is a bounded simulation — it cannot solve the general
        halting problem, only approximate it within a budget.  Uses
        threading to enforce the timeout.
        """
        import threading

        result = [False]
        exc_info = [None]

        def _run():
            try:
                program()
                result[0] = True
            except Exception as e:
                exc_info[0] = e

        thread = threading.Thread(target=_run, daemon=True)
        thread.start()
        thread.join(timeout=timeout_seconds)
        return result[0]

    @staticmethod
    def diagonal_argument() -> str:
        """Return a prose proof of the halting problem undecidability.

        Follows the diagonal construction from the notes.
        """
        return (
            "Proof by contradiction (Turing, 1936):\n"
            "1. Assume a total computable function H(P, I) exists that\n"
            "   returns True iff program P halts on input I.\n"
            "2. Construct D(P):\n"
            "       if H(P, P): loop forever\n"
            "       else:       halt\n"
            "3. Consider D(D):\n"
            "   - If H(D, D) = True  → D loops  → D does NOT halt on D  → contradiction.\n"
            "   - If H(D, D) = False → D halts  → D DOES halt on D      → contradiction.\n"
            "4. Therefore H cannot exist. ∎"
        )



# ===================================================================
# 2. Schrödinger Equation — wave function evolution
# ===================================================================

def schrodinger_energy_levels(n: int, L: float, m: float = M_ELECTRON) -> float:
    """Energy eigenvalue for a 1-D infinite square well.

    From the notes:
        E_n = n² π² ħ² / (2 m L²)

    Parameters
    ----------
    n : int
        Quantum number (≥ 1).
    L : float
        Well width in metres.
    m : float
        Particle mass (default: electron mass).

    Returns
    -------
    Energy in joules.
    """
    if n < 1:
        raise ValueError("quantum number n must be >= 1")
    if L <= 0:
        raise ValueError("well width L must be positive")
    return (n**2 * math.pi**2 * HBAR**2) / (2.0 * m * L**2)


def schrodinger_wavefunction(n: int, L: float, x: np.ndarray) -> np.ndarray:
    """Normalised wave function ψ_n(x) for the infinite square well.

    From the notes:
        ψ_n(x) = √(2/L) sin(nπx/L)

    Parameters
    ----------
    n : int
        Quantum number (≥ 1).
    L : float
        Well width.
    x : array
        Positions at which to evaluate.

    Returns
    -------
    Array of ψ values.
    """
    if n < 1:
        raise ValueError("quantum number n must be >= 1")
    return np.sqrt(2.0 / L) * np.sin(n * np.pi * x / L)


def time_evolution_factor(energy: float, t: float) -> complex:
    """Return the time-evolution phase factor exp(-i E t / ħ).

    From the notes:  iħ ∂ψ/∂t = Ĥψ  →  ψ(t) = ψ(0) exp(-iEt/ħ)
    """
    return cmath.exp(-1j * energy * t / HBAR)


# ===================================================================
# 3. Heisenberg Uncertainty Principle
# ===================================================================

def gaussian_uncertainties(sigma_x: float) -> Tuple[float, float, float]:
    """Compute position/momentum uncertainties for a Gaussian packet.

    A minimum-uncertainty Gaussian has:
        σ_x given, σ_p = ħ / (2 σ_x)
        product σ_x σ_p = ħ / 2  (equality = minimum uncertainty)

    From the notes:
        "Δx · Δp ≥ ħ/2 — Gaussian saturates the bound."

    Returns
    -------
    (sigma_x, sigma_p, product)
    """
    if sigma_x <= 0:
        raise ValueError("sigma_x must be positive")
    sigma_p = HBAR / (2.0 * sigma_x)
    return sigma_x, sigma_p, sigma_x * sigma_p


def verify_uncertainty(sigma_x: float, sigma_p: float) -> bool:
    """Check whether σ_x · σ_p ≥ ħ/2 holds."""
    return sigma_x * sigma_p >= HBAR / 2.0 - 1e-50  # tiny tolerance


def gaussian_wavepacket(x: np.ndarray, x0: float, sigma: float, k0: float = 0.0) -> np.ndarray:
    """Normalised Gaussian wave packet in position space.

    ψ(x) = (2πσ²)^{-1/4} exp(-(x-x₀)²/(4σ²)) exp(ik₀x)

    From the notes: "The Gaussian is the ONLY state that saturates
    Heisenberg equality."
    """
    norm = (2.0 * np.pi * sigma**2) ** (-0.25)
    return norm * np.exp(-(x - x0)**2 / (4.0 * sigma**2)) * np.exp(1j * k0 * x)


# ===================================================================
# 4. Möbius Function μ(n)
# ===================================================================

def _smallest_prime_factor(n: int) -> int:
    """Return the smallest prime factor of n."""
    if n <= 1:
        return n
    if n % 2 == 0:
        return 2
    i = 3
    while i * i <= n:
        if n % i == 0:
            return i
        i += 2
    return n


def factorise(n: int) -> List[int]:
    """Return the prime factorisation of n as a sorted list."""
    if n < 1:
        raise ValueError("n must be >= 1")
    factors = []
    d = 2
    while d * d <= n:
        while n % d == 0:
            factors.append(d)
            n //= d
        d += 1
    if n > 1:
        factors.append(n)
    return factors


def mobius(n: int) -> int:
    """Compute the Möbius function μ(n).

    From the notes:
        μ(1) = 1
        μ(n) = 0       if n has a squared prime factor
        μ(n) = (-1)^k   if n is a product of k distinct primes

    Central to Möbius inversion and connected to the Riemann
    hypothesis via  Σ μ(k) for k=1..n  =  O(n^{1/2+ε}).
    """
    if n < 1:
        raise ValueError("n must be >= 1")
    if n == 1:
        return 1
    factors = factorise(n)
    # Check for squared factor
    for i in range(len(factors) - 1):
        if factors[i] == factors[i + 1]:
            return 0
    return (-1) ** len(factors)


def mobius_sieve(limit: int) -> List[int]:
    """Compute μ(n) for n = 0, 1, ..., limit using a sieve.

    Returns a list where result[n] = μ(n). result[0] is 0 by convention.
    """
    if limit < 0:
        raise ValueError("limit must be non-negative")
    mu = [0] * (limit + 1)
    if limit >= 1:
        mu[1] = 1
    for i in range(1, limit + 1):
        if mu[i] == 0 and i > 1:
            continue
        for j in range(2 * i, limit + 1, i):
            mu[j] -= mu[i]
        # Check for square factors
    # Proper sieve: use linear sieve approach
    mu2 = [0] * (limit + 1)
    if limit >= 1:
        mu2[1] = 1
    for n in range(2, limit + 1):
        mu2[n] = mobius(n)
    return mu2


def mertens(n: int) -> int:
    """Compute the Mertens function M(n) = Σ_{k=1}^{n} μ(k).

    From the notes: The Riemann hypothesis is equivalent to
    M(n) = O(n^{1/2+ε}) for every ε > 0.
    """
    if n < 1:
        return 0
    return sum(mobius(k) for k in range(1, n + 1))


# ===================================================================
# 5. Fine-Structure Constant α
# ===================================================================

def fine_structure_constant() -> float:
    """Return α = e² / (4πε₀ ħc) ≈ 1/137.036.

    From the notes:
        "α ≈ 1/137 — the dimensionless constant governing QED.
         Feynman: 'one of the greatest damn mysteries of physics.'"
    """
    return ALPHA


def hydrogen_energy(n: int, include_fine_structure: bool = False) -> float:
    """Energy of hydrogen level n in electron-volts.

    Base:  E_n = -13.6 eV / n²

    With fine-structure correction (from the notes):
        E_{n,j} = E_n [1 + α²/n² (n/(j+1/2) - 3/4)]

    Parameters
    ----------
    n : int
        Principal quantum number (≥ 1).
    include_fine_structure : bool
        If True, apply leading-order α² correction for j = n - 1/2.

    Returns
    -------
    Energy in eV (negative for bound states).
    """
    if n < 1:
        raise ValueError("n must be >= 1")
    E_n = -RYDBERG_ENERGY_EV / n**2
    if not include_fine_structure:
        return E_n
    j = n - 0.5  # highest j for given n
    correction = 1.0 + (ALPHA**2 / n**2) * (n / (j + 0.5) - 0.75)
    return E_n * correction


def sommerfeld_alpha_formula() -> str:
    """Return the Sommerfeld expression for α as rendered in the notes."""
    return "α = e² / (4π ε₀ ħ c) = e² / (2 ε₀ h c) ≈ 1/137.035999084"


# ===================================================================
# 6. Fourier Transform of a Gaussian
# ===================================================================

def gaussian(t: np.ndarray, sigma: float, mu: float = 0.0) -> np.ndarray:
    """Normalised Gaussian: g(t) = (1/(σ√(2π))) exp(-(t-μ)²/(2σ²))."""
    return (1.0 / (sigma * np.sqrt(2.0 * np.pi))) * np.exp(
        -0.5 * ((t - mu) / sigma) ** 2
    )


def gaussian_ft_analytic(f: np.ndarray, sigma: float) -> np.ndarray:
    """Analytic Fourier transform of a Gaussian with width σ.

    From the notes:
        F{g}(f) = exp(-2 π² σ² f²)

    A Gaussian transforms to a Gaussian — the widths are reciprocal:
        σ_t · σ_f = 1/(2π)    where σ_f = 1/(2πσ_t)
    """
    return np.exp(-2.0 * np.pi**2 * sigma**2 * f**2)


def demonstrate_fourier_gaussian(
    sigma: float = 1.0, N: int = 4096, dt: float = 0.01,
) -> dict:
    """Numerically verify that FT of a Gaussian is a Gaussian.

    From the notes: "Gaussian → Fourier → Gaussian.  Width inverts.
    This is the ONLY function that is its own Fourier transform (up
    to scaling)."

    Returns
    -------
    dict with keys:
        t, signal, freqs, fft_magnitude, analytic_ft, sigma_f, max_error
    """
    t = np.arange(N) * dt - (N * dt / 2)
    signal = gaussian(t, sigma)

    fft_vals = np.fft.fftshift(np.fft.fft(np.fft.ifftshift(signal))) * dt
    freqs = np.fft.fftshift(np.fft.fftfreq(N, d=dt))

    analytic = gaussian_ft_analytic(freqs, sigma)
    fft_mag = np.abs(fft_vals)

    # Normalise for comparison
    fft_mag_norm = fft_mag / np.max(fft_mag) if np.max(fft_mag) > 0 else fft_mag
    analytic_norm = analytic / np.max(analytic) if np.max(analytic) > 0 else analytic

    # Only compare where the signal is significant
    mask = analytic_norm > 0.01
    max_error = float(np.max(np.abs(fft_mag_norm[mask] - analytic_norm[mask])))

    sigma_f = 1.0 / (2.0 * np.pi * sigma)

    return {
        "t": t,
        "signal": signal,
        "freqs": freqs,
        "fft_magnitude": fft_mag,
        "analytic_ft": analytic,
        "sigma_f": sigma_f,
        "sigma_t_times_sigma_f": sigma * sigma_f,
        "max_error": max_error,
    }
