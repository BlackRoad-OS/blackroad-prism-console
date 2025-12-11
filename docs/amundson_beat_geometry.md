# Amundson Beat Geometry (A-Pack)

This note packages the recurring "beat" patterns that show up across transmission lines, optical moiré, and other rotating complex fields. Each item introduces a measurable quantity that can be lifted out of lab traces, phone photos, or Smith-chart loops.

## A1 — Universal Pitch
For any rotating complex field \(F(s) = R(s) e^{i\theta(s)}\), define the logarithmic pitch
\[
  c \equiv \frac{d \ln R}{d\theta}
\]
with units of nepers per radian. The scalar \(c\) captures how much amplitude decays (or grows) per unit phase advance, independent of the underlying coordinate \(s\).

## A2 — Constant-Coefficient Spirals (Uniform RF Line)
On a uniform transmission line with constant attenuation \(\alpha\) and phase constant \(\beta\),
\[
  \frac{d \ln R}{ds} = -\alpha, \qquad \frac{d\theta}{ds} = \beta.
\]
Combining these gives the Smith-chart pitch and quality factor proxy:
\[
  c = -\frac{\alpha}{\beta}, \qquad Q \approx -\frac{1}{2c} = \frac{\beta}{2\alpha}.
\]
The same \(c\) governs how the impedance vector spirals while it attenuates around the chart.

## A3 — Two-Dimensional Beat Fields (Moiré Core)
Superimposing two lattices with wavevectors \(\mathbf{k}_1\) and \(\mathbf{k}_2\) produces an interference envelope
\[
  I(\mathbf{x}) \approx 2\cos\!\Big(\tfrac{\Delta\mathbf{k}\cdot\mathbf{x}}{2}\Big) \cos\!\Big(\tfrac{\Sigma\mathbf{k}\cdot\mathbf{x}}{2}\Big),
\]
where \(\Delta\mathbf{k} = \mathbf{k}_1 - \mathbf{k}_2\) and \(\Sigma\mathbf{k} = \mathbf{k}_1 + \mathbf{k}_2\). Stripe spacing and orientation are controlled by the difference vector:
\[
  s = \frac{2\pi}{\lvert\Delta\mathbf{k}\rvert}, \qquad \text{angle} = \arg(\Delta\mathbf{k}) + \frac{\pi}{2}.
\]

## A4 — Perspective and Zoom Transforms
For a planar scene undergoing a local Jacobian transform \(J\) (homography, lens warp, or camera move), reciprocal lattice vectors transform contravariantly:
\[
  \Delta\mathbf{k}' \propto J^{-\mathsf{T}}\Delta\mathbf{k}.
\]
This predicts how tilting or zooming rotates interference bands and how their spacing scales.

## A5 — Blur as Attenuation
Applying Gaussian blur with width \(\sigma\) multiplies the modulation transfer function by
\[
  A'(k) = A(k) e^{-\tfrac{1}{2}\sigma^2 k^2}.
\]
Map this to an effective pitch along the phase coordinate via
\[
  c_{\text{eff}} = \frac{d\ln A'}{d\theta} = \frac{d\ln A'}{dk} \cdot \frac{dk}{d\theta}.
\]
In practice, defocusing a camera increases \(\sigma\), raises \(|c|\), and fades the moiré bands.

## A6 — Color Moiré
Sampling per color channel (for example, a Bayer filter) yields channel-specific beat vectors:
\[
  \Delta\mathbf{k}_{\text{RGB}} = \{\Delta\mathbf{k}_R,\, \Delta\mathbf{k}_G,\, \Delta\mathbf{k}_B\}.
\]
Differences between these vectors generate tinting in the observed fringes:
\[
  \text{tint} \propto \Delta\mathbf{k}_i - \Delta\mathbf{k}_j.
\]

## A7 — Directional Pitch
For a two-dimensional field
\[
  F(\mathbf{x}) = e^{\boldsymbol{\sigma}\cdot\mathbf{x}} e^{i\mathbf{k}\cdot\mathbf{x}},
\]
traversed along a path with unit tangent \(\mathbf{t}\), the directional pitch is
\[
  c(\mathbf{t}) = \frac{d\ln R}{d\theta} = \frac{\boldsymbol{\sigma}\cdot\mathbf{t}}{\mathbf{k}\cdot\mathbf{t}}.
\]
A single formula now covers transmission lines, surface waves, and image beats along any direction.

## Workflow Benefits
- The scalar \(c\) is directly measurable from Smith-chart spirals, VNA traces, or photographic interference bands.
- \(\Delta\mathbf{k}\) tracks how tilt, zoom, or lens distortion redirects moiré patterns (use A3–A4 for predictions).
- Tying \(c\) back to \(Q\) (via A2) and its directional generalization (A7) makes cross-domain comparisons immediate.
- Estimating \(c\) and \(\Delta\mathbf{k}\) from a single frame gives engineers actionable knobs for mitigation.

Together these pieces form the **Amundson Beat Geometry**, a compact, cross-domain framing for classic aliasing and spiral-loss phenomena.
