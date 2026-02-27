"""Tests for lucidia_math_lab.amundson_foundations.

Validates the six foundational topics from Alexa Louise Amundson's notes.
"""

from __future__ import annotations

import math

import numpy as np
import pytest

from lucidia_math_lab.amundson_foundations import (
    ALPHA,
    BOHR_RADIUS,
    HBAR,
    RYDBERG_ENERGY_EV,
    HaltingProblemDemo,
    demonstrate_fourier_gaussian,
    factorise,
    fine_structure_constant,
    gaussian,
    gaussian_ft_analytic,
    gaussian_uncertainties,
    gaussian_wavepacket,
    hydrogen_energy,
    mertens,
    mobius,
    mobius_sieve,
    schrodinger_energy_levels,
    schrodinger_wavefunction,
    sommerfeld_alpha_formula,
    time_evolution_factor,
    verify_uncertainty,
)


# -------------------------------------------------------------------
# 1. Halting Problem
# -------------------------------------------------------------------
class TestHaltingProblem:
    def test_halting_program_detected(self):
        """A program that returns immediately should be detected as halting."""
        assert HaltingProblemDemo.simulate(lambda: 42) is True

    def test_non_halting_detected(self):
        """A busy loop should exhaust the time budget."""
        import time
        def loop_forever():
            while True:
                time.sleep(0.001)
        assert HaltingProblemDemo.simulate(loop_forever, timeout_seconds=0.1) is False

    def test_diagonal_argument_returns_proof(self):
        proof = HaltingProblemDemo.diagonal_argument()
        assert "contradiction" in proof.lower()
        assert "∎" in proof


# -------------------------------------------------------------------
# 2. Schrödinger Equation
# -------------------------------------------------------------------
class TestSchrodinger:
    def test_ground_state_energy(self):
        """E_1 for L=1e-10 m should be on the order of eV."""
        E1 = schrodinger_energy_levels(1, 1e-10)
        E1_eV = E1 / 1.602176634e-19
        assert 1 < E1_eV < 100  # reasonable eV range for atomic scale

    def test_energy_scales_as_n_squared(self):
        L = 1e-9
        E1 = schrodinger_energy_levels(1, L)
        E2 = schrodinger_energy_levels(2, L)
        E3 = schrodinger_energy_levels(3, L)
        assert abs(E2 / E1 - 4.0) < 1e-10
        assert abs(E3 / E1 - 9.0) < 1e-10

    def test_wavefunction_normalisation(self):
        """∫|ψ|² dx = 1 over [0, L]."""
        L = 1.0
        x = np.linspace(0, L, 10_000)
        psi = schrodinger_wavefunction(1, L, x)
        integral = np.trapezoid(psi**2, x)
        assert abs(integral - 1.0) < 1e-4

    def test_orthogonality(self):
        """∫ψ_1 ψ_2 dx = 0."""
        L = 1.0
        x = np.linspace(0, L, 10_000)
        psi1 = schrodinger_wavefunction(1, L, x)
        psi2 = schrodinger_wavefunction(2, L, x)
        overlap = np.trapezoid(psi1 * psi2, x)
        assert abs(overlap) < 1e-4

    def test_invalid_quantum_number(self):
        with pytest.raises(ValueError):
            schrodinger_energy_levels(0, 1.0)

    def test_time_evolution_is_unitary(self):
        """The time-evolution phase factor has unit magnitude."""
        E = schrodinger_energy_levels(1, 1e-10)
        factor = time_evolution_factor(E, 1e-15)
        assert abs(abs(factor) - 1.0) < 1e-12


# -------------------------------------------------------------------
# 3. Heisenberg Uncertainty
# -------------------------------------------------------------------
class TestHeisenberg:
    def test_minimum_uncertainty(self):
        """Gaussian saturates the bound: σ_x σ_p = ħ/2."""
        sigma_x, sigma_p, product = gaussian_uncertainties(1e-10)
        assert abs(product - HBAR / 2.0) < 1e-50

    def test_verify_passes_for_gaussian(self):
        sx, sp, _ = gaussian_uncertainties(1e-10)
        assert verify_uncertainty(sx, sp) is True

    def test_verify_fails_below_bound(self):
        """Artificially small uncertainties violate the principle."""
        assert verify_uncertainty(1e-40, 1e-40) is False

    def test_wavepacket_normalisation(self):
        """∫|ψ|² dx ≈ 1."""
        x = np.linspace(-5, 5, 20_000)
        psi = gaussian_wavepacket(x, 0.0, 1.0)
        integral = np.trapezoid(np.abs(psi)**2, x)
        assert abs(integral - 1.0) < 1e-3


# -------------------------------------------------------------------
# 4. Möbius Function
# -------------------------------------------------------------------
class TestMobius:
    def test_mu_1(self):
        assert mobius(1) == 1

    def test_primes_give_minus_one(self):
        for p in [2, 3, 5, 7, 11, 13]:
            assert mobius(p) == -1, f"μ({p}) should be -1"

    def test_square_free_two_primes(self):
        """μ(pq) = 1 for distinct primes p, q."""
        assert mobius(6) == 1    # 2 × 3
        assert mobius(10) == 1   # 2 × 5
        assert mobius(15) == 1   # 3 × 5

    def test_squared_factor_gives_zero(self):
        assert mobius(4) == 0    # 2²
        assert mobius(12) == 0   # 2² × 3
        assert mobius(18) == 0   # 2 × 3²

    def test_mu_30(self):
        """30 = 2 × 3 × 5 → 3 distinct primes → μ = -1."""
        assert mobius(30) == -1

    def test_factorise(self):
        assert factorise(1) == []
        assert factorise(12) == [2, 2, 3]
        assert factorise(30) == [2, 3, 5]

    def test_mertens_known_values(self):
        """M(1)=1, M(2)=0, M(3)=-1, M(4)=-1, ..."""
        assert mertens(1) == 1
        assert mertens(2) == 0
        assert mertens(3) == -1

    def test_sieve_matches_pointwise(self):
        sieve = mobius_sieve(50)
        for n in range(1, 51):
            assert sieve[n] == mobius(n), f"sieve disagrees at n={n}"


# -------------------------------------------------------------------
# 5. Fine-Structure Constant
# -------------------------------------------------------------------
class TestFineStructure:
    def test_alpha_value(self):
        """α ≈ 1/137.036."""
        assert abs(fine_structure_constant() - 1.0 / 137.036) < 1e-5

    def test_alpha_matches_module_constant(self):
        assert fine_structure_constant() == ALPHA

    def test_hydrogen_ground_state(self):
        """E_1 ≈ -13.6 eV."""
        E1 = hydrogen_energy(1)
        assert abs(E1 - (-13.6)) < 0.1

    def test_hydrogen_scaling(self):
        """E_n = -13.6/n²."""
        E1 = hydrogen_energy(1)
        E2 = hydrogen_energy(2)
        assert abs(E2 - E1 / 4) < 0.01

    def test_fine_structure_correction(self):
        """Fine-structure shifts energy slightly."""
        E_base = hydrogen_energy(2, include_fine_structure=False)
        E_corrected = hydrogen_energy(2, include_fine_structure=True)
        # Correction is small — order α²
        assert E_corrected != E_base
        relative_shift = abs((E_corrected - E_base) / E_base)
        assert relative_shift < 1e-3  # sub-percent correction

    def test_bohr_radius(self):
        """a₀ ≈ 5.29e-11 m."""
        assert abs(BOHR_RADIUS - 5.29e-11) < 1e-12

    def test_rydberg_energy(self):
        """E_R ≈ 13.6 eV."""
        assert abs(RYDBERG_ENERGY_EV - 13.6) < 0.1

    def test_sommerfeld_formula_string(self):
        s = sommerfeld_alpha_formula()
        assert "137" in s
        assert "α" in s


# -------------------------------------------------------------------
# 6. Fourier Transform of a Gaussian
# -------------------------------------------------------------------
class TestFourierGaussian:
    def test_gaussian_normalisation(self):
        """∫g(t) dt = 1."""
        t = np.linspace(-10, 10, 100_000)
        g = gaussian(t, sigma=1.0)
        integral = np.trapezoid(g, t)
        assert abs(integral - 1.0) < 1e-4

    def test_ft_at_zero(self):
        """F{g}(0) = 1 for a normalised Gaussian."""
        assert abs(gaussian_ft_analytic(np.array([0.0]), sigma=1.0)[0] - 1.0) < 1e-12

    def test_reciprocal_width(self):
        """σ_t × σ_f = 1/(2π)."""
        result = demonstrate_fourier_gaussian(sigma=1.0)
        expected = 1.0 / (2.0 * math.pi)
        assert abs(result["sigma_t_times_sigma_f"] - expected) < 1e-12

    def test_numerical_matches_analytic(self):
        """Numerical FFT should closely match the analytic FT."""
        result = demonstrate_fourier_gaussian(sigma=0.5, N=8192, dt=0.005)
        assert result["max_error"] < 0.05

    def test_wider_gaussian_narrower_ft(self):
        """Doubling σ_t should halve σ_f."""
        r1 = demonstrate_fourier_gaussian(sigma=1.0)
        r2 = demonstrate_fourier_gaussian(sigma=2.0)
        assert abs(r2["sigma_f"] - r1["sigma_f"] / 2.0) < 1e-12
