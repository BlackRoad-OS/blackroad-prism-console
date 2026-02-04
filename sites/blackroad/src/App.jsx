import { useEffect, useState } from "react";
import { NavLink, Route, Routes } from "react-router-dom";
import Agents from "./pages/Agents.jsx";
import AutoDiffLab from "./pages/AutoDiffLab.jsx";
import Backroad from "./pages/Backroad.jsx";
import BezierShadedSurfaceLab from "./pages/BezierShadedSurfaceLab.jsx";
import BifurcationLab from "./pages/BifurcationLab.jsx";
import BlueNoiseTSPLab from "./pages/BlueNoiseTSPLab.jsx";
import BrushfirePathLab from "./pages/BrushfirePathLab.jsx";
import Canvas from "./pages/Canvas.jsx";
import Chat from "./pages/Chat.jsx";
import ConformalGridLab from "./pages/ConformalGridLab.jsx";
import ContinuedFractionsLab from "./pages/ContinuedFractionsLab.jsx";
import Desktop from "./pages/Desktop.jsx";
import Editor from "./pages/Editor.jsx";
import EigenmapsLab from "./pages/EigenmapsLab.jsx";
import EikonalLab from "./pages/EikonalLab.jsx";
import InfinityMath from "./pages/InfinityMath.jsx";
import Ising2DLab from "./pages/Ising2DLab.jsx";
import Kalman2DTrackerLab from "./pages/Kalman2DTrackerLab.jsx";
import KernelPCALab from "./pages/KernelPCALab.jsx";
import Lucidia from "./pages/Lucidia.jsx";
import LSystemLab from "./pages/LSystemLab.jsx";
import MinimalSurfaceLab from "./pages/MinimalSurfaceLab.jsx";
import NBodyLab from "./pages/NBodyLab.jsx";
import NotFound from "./pages/NotFound.jsx";
import OptimalTransportLab from "./pages/OptimalTransportLab.jsx";
import PCALab from "./pages/PCALab.jsx";
import PoissonBlendLab from "./pages/PoissonBlendLab.jsx";
import PoissonBoltzmannLab from "./pages/PoissonBoltzmannLab.jsx";
import PoissonDiskLab from "./pages/PoissonDiskLab.jsx";
import QuantumConsciousness from "./pages/QuantumConsciousness.jsx";
import QuatJuliaLab from "./pages/QuatJuliaLab.jsx";
import RidgeRegressionLab from "./pages/RidgeRegressionLab.jsx";
import RoadView from "./pages/RoadView.jsx";
import RSAToyLab from "./pages/RSAToyLab.jsx";
import StableFluidsLab from "./pages/StableFluidsLab.jsx";
import StatusPage from "./pages/StatusPage.jsx";
import Subscribe from "./pages/Subscribe.jsx";
import Terminal from "./pages/Terminal.jsx";
import VorticityStreamLab from "./pages/VorticityStreamLab.jsx";
import WaveletLab from "./pages/WaveletLab.jsx";

const NAV_LINKS = [
  { path: "chat", label: "Chat" },
  { path: "canvas", label: "Canvas" },
  { path: "editor", label: "Editor" },
  { path: "terminal", label: "Terminal" },
  { path: "roadview", label: "RoadView" },
  { path: "backroad", label: "Backroad" },
  { path: "agents", label: "Agents" },
  { path: "subscribe", label: "Subscribe" },
  { path: "creator-lightpath", label: "Creator lightpath" },
  { path: "lucidia", label: "Lucidia" },
  { path: "math", label: "Infinity Math", accent: true },
];

const CORE_ROUTES = [
  { path: "chat", element: <Chat /> },
  { path: "canvas", element: <Canvas /> },
  { path: "editor", element: <Editor /> },
  { path: "terminal", element: <Terminal /> },
  { path: "roadview", element: <RoadView /> },
  { path: "backroad", element: <Backroad /> },
  { path: "agents", element: <Agents /> },
  { path: "subscribe", element: <Subscribe /> },
  { path: "creator-lightpath", element: <CreatorLightpath /> },
  { path: "lucidia", element: <Lucidia /> },
  { path: "math", element: <InfinityMath /> },
  { path: "ot", element: <OptimalTransportLab /> },
  { path: "bifurcate", element: <BifurcationLab /> },
  { path: "cfrac", element: <ContinuedFractionsLab /> },
  { path: "qjulia", element: <QuatJuliaLab /> },
  { path: "fluids", element: <StableFluidsLab /> },
  { path: "autodiff", element: <AutoDiffLab /> },
  { path: "conformal", element: <ConformalGridLab /> },
  { path: "eikonal", element: <EikonalLab /> },
  { path: "poisson2", element: <PoissonDiskLab /> },
  { path: "lsys", element: <LSystemLab /> },
  { path: "minimal", element: <MinimalSurfaceLab /> },
  { path: "eigenmaps", element: <EigenmapsLab /> },
  { path: "blend", element: <PoissonBlendLab /> },
  { path: "nbody", element: <NBodyLab /> },
  { path: "wavelet", element: <WaveletLab /> },
  { path: "pb", element: <PoissonBoltzmannLab /> },
  { path: "ridge", element: <RidgeRegressionLab /> },
  { path: "kpca", element: <KernelPCALab /> },
  { path: "brushfire", element: <BrushfirePathLab /> },
  { path: "blue-tsp", element: <BlueNoiseTSPLab /> },
  { path: "bezier-lit", element: <BezierShadedSurfaceLab /> },
  { path: "kf-2d", element: <Kalman2DTrackerLab /> },
  { path: "vorticity", element: <VorticityStreamLab /> },
  { path: "ising", element: <Ising2DLab /> },
  { path: "pca", element: <PCALab /> },
  { path: "rsa", element: <RSAToyLab /> },
];

const legacyRoutes = [
  { path: "chat", label: "Chat", element: <Chat /> },
  { path: "canvas", label: "Canvas", element: <Canvas /> },
  { path: "editor", label: "Editor", element: <Editor /> },
  { path: "terminal", label: "Terminal", element: <Terminal /> },
  { path: "roadview", label: "RoadView", element: <RoadView /> },
  { path: "backroad", label: "Backroad", element: <Backroad /> },
  { path: "agents", label: "Agents", element: <Agents /> },
  { path: "subscribe", label: "Subscribe", element: <Subscribe /> },
  { path: "creator-lightpath", label: "Creator lightpath", element: <CreatorLightpath /> },
  { path: "lucidia", label: "Lucidia", element: <Lucidia /> },
  { path: "math", label: "∞ Infinity Math", accent: true, element: <InfinityMath /> },
  { path: "ising", label: "Ising 2D Lab", element: <Ising2DLab /> },
  { path: "pca", label: "PCA Lab", element: <PCALab /> },
  { path: "rsa", label: "RSA Toy Lab", element: <RSAToyLab /> },
  { path: "ot", label: "Optimal Transport Lab", element: <OptimalTransportLab /> },
  { path: "bifurcate", label: "Bifurcation Lab", element: <BifurcationLab /> },
  { path: "cfrac", label: "Continued Fractions Lab", element: <ContinuedFractionsLab /> },
  { path: "qjulia", label: "Quaternion Julia Lab", element: <QuatJuliaLab /> },
  { path: "fluids", label: "Stable Fluids Lab", element: <StableFluidsLab /> },
  { path: "autodiff", label: "AutoDiff Lab", element: <AutoDiffLab /> },
  { path: "conformal", label: "Conformal Grid Lab", element: <ConformalGridLab /> },
  { path: "eikonal", label: "Eikonal Lab", element: <EikonalLab /> },
  { path: "poisson2", label: "Poisson Disk Lab", element: <PoissonDiskLab /> },
  { path: "lsys", label: "L-System Lab", element: <LSystemLab /> },
  { path: "minimal", label: "Minimal Surface Lab", element: <MinimalSurfaceLab /> },
  { path: "eigenmaps", label: "Eigenmaps Lab", element: <EigenmapsLab /> },
  { path: "blend", label: "Poisson Blend Lab", element: <PoissonBlendLab /> },
  { path: "nbody", label: "N-Body Lab", element: <NBodyLab /> },
  { path: "wavelet", label: "Wavelet Lab", element: <WaveletLab /> },
  { path: "pb", label: "Poisson-Boltzmann Lab", element: <PoissonBoltzmannLab /> },
  { path: "ridge", label: "Ridge Regression Lab", element: <RidgeRegressionLab /> },
  { path: "kpca", label: "Kernel PCA Lab", element: <KernelPCALab /> },
  { path: "brushfire", label: "Brushfire Path Lab", element: <BrushfirePathLab /> },
  { path: "blue-tsp", label: "Blue Noise TSP Lab", element: <BlueNoiseTSPLab /> },
  { path: "bezier-lit", label: "Bezier Shaded Surface Lab", element: <BezierShadedSurfaceLab /> },
  { path: "kf-2d", label: "Kalman 2D Tracker Lab", element: <Kalman2DTrackerLab /> },
  { path: "vorticity", label: "Vorticity Stream Lab", element: <VorticityStreamLab /> },
];
import CreatorLightpath from "./pages/CreatorLightpath.jsx";

const PRIMARY_ROUTES = [
  { to: "/chat", label: "Chat", element: Chat },
  { to: "/canvas", label: "Canvas", element: Canvas },
  { to: "/editor", label: "Editor", element: Editor },
  { to: "/terminal", label: "Terminal", element: Terminal },
  { to: "/roadview", label: "RoadView", element: RoadView },
  { to: "/backroad", label: "Backroad", element: Backroad },
  { to: "/agents", label: "Agents", element: Agents },
  { to: "/subscribe", label: "Subscribe", element: Subscribe },
  { to: "/creator-lightpath", label: "Creator lightpath", element: CreatorLightpath },
  { to: "/lucidia", label: "Lucidia", element: Lucidia },
  { to: "/math", label: "Infinity Math", element: InfinityMath, gradient: true },
  { path: "status", element: <StatusPage /> },
];

const LAB_ROUTES = [
  { path: "ot", component: OptimalTransportLab },
  { path: "bifurcate", component: BifurcationLab },
  { path: "cfrac", component: ContinuedFractionsLab },
  { path: "qjulia", component: QuatJuliaLab },
  { path: "fluids", component: StableFluidsLab },
  { path: "autodiff", component: AutoDiffLab },
  { path: "conformal", component: ConformalGridLab },
  { path: "eikonal", component: EikonalLab },
  { path: "poisson2", component: PoissonDiskLab },
  { path: "lsys", component: LSystemLab },
  { path: "minimal", component: MinimalSurfaceLab },
  { path: "eigenmaps", component: EigenmapsLab },
  { path: "blend", component: PoissonBlendLab },
  { path: "nbody", component: NBodyLab },
  { path: "wavelet", component: WaveletLab },
  { path: "pb", component: PoissonBoltzmannLab },
  { path: "ridge", component: RidgeRegressionLab },
  { path: "kpca", component: KernelPCALab },
  { path: "brushfire", component: BrushfirePathLab },
  { path: "blue-tsp", component: BlueNoiseTSPLab },
  { path: "bezier-lit", component: BezierShadedSurfaceLab },
  { path: "kf-2d", component: Kalman2DTrackerLab },
  { path: "vorticity", component: VorticityStreamLab },
  { path: "ising", component: Ising2DLab },
  { path: "pca", component: PCALab },
  { path: "rsa", component: RSAToyLab },
];

const navLinkClassName = ({ isActive }) =>
  [
    "nav-link",
    "rounded-lg px-3 py-2 text-sm transition",
    isActive ? "bg-white/10 text-white" : "text-slate-200/80 hover:text-white",
  ].join(" ");
import { NavLink, Routes, Route } from 'react-router-dom';
import { useEffect, useState } from 'react';
import Chat from './pages/Chat.jsx';
import Canvas from './pages/Canvas.jsx';
import Editor from './pages/Editor.jsx';
import Terminal from './pages/Terminal.jsx';
import RoadView from './pages/RoadView.jsx';
import Backroad from './pages/Backroad.jsx';
import Subscribe from './pages/Subscribe.jsx';
import Lucidia from './pages/Lucidia.jsx';
import InfinityMath from './pages/InfinityMath.jsx';
import Agents from './pages/Agents.jsx';
import Desktop from './pages/Desktop.jsx';
import QuantumConsciousness from './pages/QuantumConsciousness.jsx';
import OptimalTransportLab from './pages/OptimalTransportLab.jsx';
import BifurcationLab from './pages/BifurcationLab.jsx';
import ContinuedFractionsLab from './pages/ContinuedFractionsLab.jsx';
import QuatJuliaLab from './pages/QuatJuliaLab.jsx';
import StableFluidsLab from './pages/StableFluidsLab.jsx';
import AutoDiffLab from './pages/AutoDiffLab.jsx';
import ConformalGridLab from './pages/ConformalGridLab.jsx';
import EikonalLab from './pages/EikonalLab.jsx';
import PoissonDiskLab from './pages/PoissonDiskLab.jsx';
import LSystemLab from './pages/LSystemLab.jsx';
import MinimalSurfaceLab from './pages/MinimalSurfaceLab.jsx';
import EigenmapsLab from './pages/EigenmapsLab.jsx';
import PoissonBlendLab from './pages/PoissonBlendLab.jsx';
import NBodyLab from './pages/NBodyLab.jsx';
import WaveletLab from './pages/WaveletLab.jsx';
import PoissonBoltzmannLab from './pages/PoissonBoltzmannLab.jsx';
import RidgeRegressionLab from './pages/RidgeRegressionLab.jsx';
import KernelPCALab from './pages/KernelPCALab.jsx';
import BrushfirePathLab from './pages/BrushfirePathLab.jsx';
import BlueNoiseTSPLab from './pages/BlueNoiseTSPLab.jsx';
import BezierShadedSurfaceLab from './pages/BezierShadedSurfaceLab.jsx';
import Kalman2DTrackerLab from './pages/Kalman2DTrackerLab.jsx';
import VorticityStreamLab from './pages/VorticityStreamLab.jsx';
import CodexPromptPage from './pages/CodexPrompt.jsx';

function useApiHealth() {
  const [state, setState] = useState({ ok: null, info: "" });

  useEffect(() => {
    let cancelled = false;

    const probe = async (path) => {
      try {
        const fetchFn = typeof globalThis.fetch === "function" ? globalThis.fetch : null;
        if (!fetchFn) {
          return { ok: false, info: "" };
        }
        const response = await fetchFn(path, { cache: "no-store" });
        const text = await response.text();
        let info = "";
        try {
          const json = JSON.parse(text);
          info = `${json.status || "ok"}${json.time ? ` • ${json.time}` : ""}`;
        } catch {
          info = "";
        }
        return { ok: response.ok, info };
      } catch {
        return { ok: false, info: "" };
      }
    };

    (async () => {
      let result = await probe("/api/health");
      if (!result.ok) {
        result = await probe("/api/health.json");
      }
      if (!cancelled) {
        setState(result);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);
import MaxFlowLab from "./pages/MaxFlowLab.jsx";
import BezierSurfaceLab from "./pages/BezierSurfaceLab.jsx";
import ClusteringCompareLab from "./pages/ClusteringCompareLab.jsx";
import MarchingSquaresLab from "./pages/MarchingSquaresLab.jsx";
import RRTStarLab from "./pages/RRTStarLab.jsx";
import FourierPainterLab from "./pages/FourierPainterLab.jsx";
import HilbertMortonLab from "./pages/HilbertMortonLab.jsx";
import IsingMaxCutLab from "./pages/IsingMaxCutLab.jsx";
import DrumWaveLab from "./pages/DrumWaveLab.jsx";
import PendulumLab from "./pages/PendulumLab.jsx";
import PowerJuliaLab from "./pages/PowerJuliaLab.jsx";
import PenroseToyLab from "./pages/PenroseToyLab.jsx";
import DLALab from "./pages/DLALab.jsx";
import SIRLab from "./pages/SIRLab.jsx";
import BezierBSplineLab from "./pages/BezierBSplineLab.jsx";
import SpectralClusteringLab from "./pages/SpectralClusteringLab.jsx";
import BeltramiTorusLab from "./pages/BeltramiTorusLab.jsx";
import SpectralPoissonLab from "./pages/SpectralPoissonLab.jsx";
import EllipsoidGeodesicLab from "./pages/EllipsoidGeodesicLab.jsx";
import QuasiConformalEggLab from "./pages/QuasiConformalEggLab.jsx";

import FastMarchTreeLab from "./pages/FastMarchTreeLab.jsx";
import HungarianLab from "./pages/HungarianLab.jsx";
import QuaternionRotLab from "./pages/QuaternionRotLab.jsx";
import ComplexBarycentricLab from "./pages/ComplexBarycentricLab.jsx";
<<<<<<< main
import AStarLab from "./pages/AStarLab.jsx";
import TSPLab from "./pages/TSPLab.jsx";
import GrayScottGalleryLab from "./pages/GrayScottGalleryLab.jsx";
import RansacPlane3DLab from "./pages/RansacPlane3DLab.jsx";
import PrimeGapsLab from "./pages/PrimeGapsLab.jsx";
import FareyTreeLab from "./pages/FareyTreeLab.jsx";
import FourierLab from "./pages/FourierLab.jsx";
import RiemannMappingToy from "./pages/RiemannMappingToy.jsx";
import OULab from "./pages/OULab.jsx";
import VoronoiLloydLab from "./pages/VoronoiLloydLab.jsx";
import BeliefPropagationLab from "./pages/BeliefPropagationLab.jsx";
import RRTSmoothLab from "./pages/RRTSmoothLab.jsx";
import DiffusionMapsLab from "./pages/DiffusionMapsLab.jsx";
import PerlinTerrainLab from "./pages/PerlinTerrainLab.jsx";
import PDELiveLab from "./pages/PDELiveLab.jsx";
import EikonalPathLab from "./pages/EikonalPathLab.jsx";
import PowerDiagramLab from "./pages/PowerDiagramLab.jsx";
import FourierOpticsLab from "./pages/FourierOpticsLab.jsx";
import CircleInversionLab from "./pages/CircleInversionLab.jsx";
<<<<<<< main
import LaplaceConductorsLab from "./pages/LaplaceConductorsLab.jsx";
import PoincarePendulumLab from "./pages/PoincarePendulumLab.jsx";
import CatMapLab from "./pages/CatMapLab.jsx";
import IsoSliceLab from "./pages/IsoSliceLab.jsx";
=======
import SpectralGraphLab from "./pages/SpectralGraphLab.jsx";
import ComplexPotentialsLab from "./pages/ComplexPotentialsLab.jsx";
import PowerLloydLab from "./pages/PowerLloydLab.jsx";
import OTLab from "./pages/OTLab.jsx";
import CahnHilliardLab from "./pages/CahnHilliardLab.jsx";
>>>>>>> origin/codex/add-react-pages-and-routes-zm01mq
=======
import Monitoring from "./pages/Monitoring.jsx";
>>>>>>> origin/codex/add-real-time-monitoring-dashboard-to-prism-ui

function useApiHealth(){
  const [state,setState]=useState({ok:null, info:""});
  useEffect(()=>{ let dead=false;
    (async()=>{
      const probe = async (path)=>{
        try{
          const r = await fetch(path,{cache:"no-store"});
          const t = await r.text();
          let info=""; try{ const j=JSON.parse(t); info=`${j.status||"ok"} • ${j.time||""}`; }catch{}
          return {ok:r.ok, info};
        }catch{ return {ok:false, info:""} }
      };
      let res = await probe("/api/health");
      if(!res.ok) res = await probe("/api/health.json");
      if(!dead) setState(res);
    })(); return ()=>{dead=true};
  },[]);
  return state;
}

function StatusPill() {
  const { ok, info } = useApiHealth();
  const tone = ok == null ? "opacity-60" : ok ? "text-green-400" : "text-red-400";
  const label = ok == null ? "Checking API…" : ok ? "API healthy" : "API error";

  return <span className={`text-xs uppercase tracking-wide ${tone}`}>{info ? `${label} — ${info}` : label}</span>;
export default function App(){
  return (
    <Routes>
      <Route path="/" element={<Desktop/>} />
      <Route path="/quantum-consciousness" element={<QuantumConsciousness/>} />
      <Route path="/*" element={<LegacyApp/>} />
    </Routes>
  );
}

function LegacyApp() {
  return (
    <div className="min-h-screen grid gap-4 p-4 md:grid-cols-[240px_1fr]">
      <aside className="sidebar p-4">
        <div className="brand-logo text-2xl font-semibold">BlackRoad.io</div>
        <nav className="mt-6 flex flex-col gap-2">
          {NAV_LINKS.map(({ path, label, accent }) => (
            <NavLink key={path} className={navLinkClassName} to={`/${path}`}>
              {accent ? (
                <span
                  className="font-semibold"
                  style={{
                    background: "linear-gradient(90deg,#FF4FD8,#0096FF,#FDBA2D)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  ∞
                </span>
              ) : null}
              {accent ? " " : null}
              {label}
            </NavLink>
          ))}
    <div className="min-h-screen grid md:grid-cols-[240px_1fr] gap-4 p-4">
      <aside className="sidebar p-3">
        <div className="brand-logo text-2xl mb-4">BlackRoad.io</div>
        <nav className="flex flex-col gap-2">
          <NavLink className="nav-link" to="/chat">Chat</NavLink>
          <NavLink className="nav-link" to="/canvas">Canvas</NavLink>
          <NavLink className="nav-link" to="/editor">Editor</NavLink>
          <NavLink className="nav-link" to="/terminal">Terminal</NavLink>
          <NavLink className="nav-link" to="/roadview">RoadView</NavLink>
          <NavLink className="nav-link" to="/backroad">Backroad</NavLink>
          <NavLink className="nav-link" to="/agents">Agents</NavLink>
          <NavLink className="nav-link" to="/subscribe">Subscribe</NavLink>
          <NavLink className="nav-link" to="/lucidia">Lucidia</NavLink>
<<<<<<< main
          <NavLink className="nav-link" to="/math">
            <span
              style={{
                background: "linear-gradient(90deg,#FF4FD8,#0096FF,#FDBA2D)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              ∞
            </span>{" "}
            Infinity Math
          </NavLink>
          <NavLink className="nav-link" to="/quantum-consciousness">
            Quantum Consciousness
          </NavLink>
=======
          <NavLink className="nav-link" to="/monitoring">Monitoring</NavLink>
>>>>>>> origin/codex/add-real-time-monitoring-dashboard-to-prism-ui
        </nav>
        <div className="mt-8">
          <StatusPill />
        </div>
      </aside>

      <main className="space-y-4">
        <header className="panel flex items-center justify-between p-4">
          <h1 className="brand-gradient text-xl font-semibold">Creator Ops Portal</h1>
          <a className="btn-primary text-sm" href="/api/health" rel="noreferrer" target="_blank">
            View API JSON
          </a>
        </header>

        <section className="card">
          <Routes>
            <Route index element={<Chat />} />
            {CORE_ROUTES.map(({ path, element }) => (
              <Route key={path} path={path} element={element} />
            ))}
            {LAB_ROUTES.map(({ path, component: Component }) => (
              <Route key={path} path={path} element={<Component />} />
            ))}
            <Route path="*" element={<NotFound />} />
            <Route path="/" element={<Chat/>} />
            <Route path="/chat" element={<Chat/>} />
            <Route path="/canvas" element={<Canvas/>} />
            <Route path="/editor" element={<Editor/>} />
            <Route path="/terminal" element={<Terminal/>} />
            <Route path="/roadview" element={<RoadView/>} />
            <Route path="/backroad" element={<Backroad/>} />
            <Route path="/agents" element={<Agents/>} />
            <Route path="/subscribe" element={<Subscribe/>} />
            <Route path="/lucidia" element={<Lucidia/>} />
<<<<<<< main
            <Route path="/math" element={<InfinityMath/>} />
            <Route path="/ot" element={<OptimalTransportLab/>} />
            <Route path="/bifurcate" element={<BifurcationLab/>} />
            <Route path="/cfrac" element={<ContinuedFractionsLab/>} />
            <Route path="/qjulia" element={<QuatJuliaLab/>} />
            <Route path="/fluids" element={<StableFluidsLab/>} />
            <Route path="/autodiff" element={<AutoDiffLab/>} />
            <Route path="/conformal" element={<ConformalGridLab/>} />
            <Route path="/maxflow" element={<MaxFlowLab/>} />
            <Route path="/bezier3d" element={<BezierSurfaceLab/>} />
            <Route path="/cluster2" element={<ClusteringCompareLab/>} />
            <Route path="/implicit" element={<MarchingSquaresLab/>} />
            <Route path="/rrt-smooth" element={<RRTSmoothLab/>} />
            <Route path="/diffmaps" element={<DiffusionMapsLab/>} />
            <Route path="/terrain" element={<PerlinTerrainLab/>} />
            <Route path="/pde" element={<PDELiveLab/>} />
            <Route path="/eikonal" element={<EikonalLab/>} />
            <Route path="/poisson2" element={<PoissonDiskLab/>} />
            <Route path="/lsys" element={<LSystemLab/>} />
            <Route path="/minimal" element={<MinimalSurfaceLab/>} />
<<<<<<< main
            <Route path="/rrtstar" element={<RRTStarLab/>} />
            <Route path="/epicycles" element={<FourierPainterLab/>} />
            <Route path="/hilbert" element={<HilbertMortonLab/>} />
            <Route path="/maxcut" element={<IsingMaxCutLab/>} />
            <Route path="/drum" element={<DrumWaveLab/>} />
            <Route path="/pendulum" element={<PendulumLab/>} />
            <Route path="/pzoo" element={<PowerJuliaLab/>} />
            <Route path="/penrose" element={<PenroseToyLab/>} />
            <Route path="/dla" element={<DLALab/>} />
            <Route path="/sir" element={<SIRLab/>} />
            <Route path="/curves" element={<BezierBSplineLab/>} />
            <Route path="/spec" element={<SpectralClusteringLab/>} />
            <Route path="/beltrami" element={<BeltramiTorusLab/>} />
            <Route path="/poisson" element={<SpectralPoissonLab/>} />
            <Route path="/ellipsoid" element={<EllipsoidGeodesicLab/>} />
            <Route path="/qc-egg" element={<QuasiConformalEggLab/>} />
            <Route path="/fmm-tree" element={<FastMarchTreeLab/>} />
            <Route path="/hungarian" element={<HungarianLab/>} />
            <Route path="/quat" element={<QuaternionRotLab/>} />
            <Route path="/bary" element={<ComplexBarycentricLab/>} />
            <Route path="/eigenmaps" element={<EigenmapsLab/>} />
            <Route path="/blend" element={<PoissonBlendLab/>} />
            <Route path="/nbody" element={<NBodyLab/>} />
            <Route path="/wavelet" element={<WaveletLab/>} />
            <Route path="/astar" element={<AStarLab/>} />
            <Route path="/tsp" element={<TSPLab/>} />
            <Route path="/gs-gallery" element={<GrayScottGalleryLab/>} />
            <Route path="/plane3d" element={<RansacPlane3DLab/>} />
            <Route path="/primes" element={<PrimeGapsLab/>} />
            <Route path="/farey" element={<FareyTreeLab/>} />
            <Route path="/fourier" element={<FourierLab/>} />
            <Route path="/riemann" element={<RiemannMappingToy/>} />
            <Route path="/ou" element={<OULab/>} />
            <Route path="/vor" element={<VoronoiLloydLab/>} />
            <Route path="/belief" element={<BeliefPropagationLab/>} />
            <Route path="/geo" element={<EikonalPathLab/>} />
            <Route path="/power" element={<PowerDiagramLab/>} />
            <Route path="/optics" element={<FourierOpticsLab/>} />
            <Route path="/invert" element={<CircleInversionLab/>} />
            <Route path="/laplace" element={<LaplaceConductorsLab/>} />
            <Route path="/poincare" element={<PoincarePendulumLab/>} />
            <Route path="/catmap" element={<CatMapLab/>} />
            <Route path="/isoslice" element={<IsoSliceLab/>} />
=======
            <Route path="/spectral-graph" element={<SpectralGraphLab/>} />
            <Route path="/potentials" element={<ComplexPotentialsLab/>} />
            <Route path="/power-lloyd" element={<PowerLloydLab/>} />
            <Route path="/ot" element={<OTLab/>} />
            <Route path="/cahn" element={<CahnHilliardLab/>} />
>>>>>>> origin/codex/add-react-pages-and-routes-zm01mq
            <Route path="chat" element={<Chat/>} />
            <Route path="canvas" element={<Canvas/>} />
            <Route path="editor" element={<Editor/>} />
            <Route path="terminal" element={<Terminal/>} />
            <Route path="roadview" element={<RoadView/>} />
            <Route path="backroad" element={<Backroad/>} />
            <Route path="subscribe" element={<Subscribe/>} />
            <Route path="lucidia" element={<Lucidia/>} />
            <Route path="math" element={<InfinityMath/>} />
            <Route path="ot" element={<OptimalTransportLab/>} />
            <Route path="bifurcate" element={<BifurcationLab/>} />
            <Route path="cfrac" element={<ContinuedFractionsLab/>} />
            <Route path="qjulia" element={<QuatJuliaLab/>} />
            <Route path="fluids" element={<StableFluidsLab/>} />
            <Route path="autodiff" element={<AutoDiffLab/>} />
            <Route path="conformal" element={<ConformalGridLab/>} />
            <Route path="maxflow" element={<MaxFlowLab/>} />
            <Route path="bezier3d" element={<BezierSurfaceLab/>} />
            <Route path="cluster2" element={<ClusteringCompareLab/>} />
            <Route path="implicit" element={<MarchingSquaresLab/>} />
            <Route path="rrt-smooth" element={<RRTSmoothLab/>} />
            <Route path="diffmaps" element={<DiffusionMapsLab/>} />
            <Route path="terrain" element={<PerlinTerrainLab/>} />
            <Route path="pde" element={<PDELiveLab/>} />
            <Route path="eikonal" element={<EikonalLab/>} />
            <Route path="poisson2" element={<PoissonDiskLab/>} />
            <Route path="lsys" element={<LSystemLab/>} />
            <Route path="minimal" element={<MinimalSurfaceLab/>} />
<<<<<<< main
            <Route path="rrtstar" element={<RRTStarLab/>} />
            <Route path="epicycles" element={<FourierPainterLab/>} />
            <Route path="hilbert" element={<HilbertMortonLab/>} />
            <Route path="maxcut" element={<IsingMaxCutLab/>} />
            <Route path="drum" element={<DrumWaveLab/>} />
            <Route path="pendulum" element={<PendulumLab/>} />
            <Route path="pzoo" element={<PowerJuliaLab/>} />
            <Route path="penrose" element={<PenroseToyLab/>} />
            <Route path="dla" element={<DLALab/>} />
            <Route path="sir" element={<SIRLab/>} />
            <Route path="curves" element={<BezierBSplineLab/>} />
            <Route path="spec" element={<SpectralClusteringLab/>} />
            <Route path="beltrami" element={<BeltramiTorusLab/>} />
            <Route path="poisson" element={<SpectralPoissonLab/>} />
            <Route path="ellipsoid" element={<EllipsoidGeodesicLab/>} />
            <Route path="qc-egg" element={<QuasiConformalEggLab/>} />
            <Route path="fmm-tree" element={<FastMarchTreeLab/>} />
            <Route path="hungarian" element={<HungarianLab/>} />
            <Route path="quat" element={<QuaternionRotLab/>} />
            <Route path="bary" element={<ComplexBarycentricLab/>} />
            <Route path="eigenmaps" element={<EigenmapsLab/>} />
            <Route path="blend" element={<PoissonBlendLab/>} />
            <Route path="nbody" element={<NBodyLab/>} />
            <Route path="wavelet" element={<WaveletLab/>} />
            <Route path="astar" element={<AStarLab/>} />
            <Route path="tsp" element={<TSPLab/>} />
            <Route path="gs-gallery" element={<GrayScottGalleryLab/>} />
            <Route path="plane3d" element={<RansacPlane3DLab/>} />
            <Route path="primes" element={<PrimeGapsLab/>} />
            <Route path="farey" element={<FareyTreeLab/>} />
            <Route path="fourier" element={<FourierLab/>} />
            <Route path="riemann" element={<RiemannMappingToy/>} />
            <Route path="ou" element={<OULab/>} />
            <Route path="vor" element={<VoronoiLloydLab/>} />
            <Route path="belief" element={<BeliefPropagationLab/>} />
            <Route path="geo" element={<EikonalPathLab/>} />
            <Route path="power" element={<PowerDiagramLab/>} />
            <Route path="optics" element={<FourierOpticsLab/>} />
            <Route path="invert" element={<CircleInversionLab/>} />
            <Route path="laplace" element={<LaplaceConductorsLab/>} />
            <Route path="poincare" element={<PoincarePendulumLab/>} />
            <Route path="catmap" element={<CatMapLab/>} />
            <Route path="isoslice" element={<IsoSliceLab/>} />
=======
            <Route path="spectral-graph" element={<SpectralGraphLab/>} />
            <Route path="potentials" element={<ComplexPotentialsLab/>} />
            <Route path="power-lloyd" element={<PowerLloydLab/>} />
            <Route path="ot" element={<OTLab/>} />
            <Route path="cahn" element={<CahnHilliardLab/>} />
>>>>>>> origin/codex/add-react-pages-and-routes-zm01mq
=======
            <Route path="/monitoring" element={<Monitoring/>} />
>>>>>>> origin/codex/add-real-time-monitoring-dashboard-to-prism-ui
            <Route path="*" element={<div>Not found</div>} />
            <Route path="/" element={<Chat />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/canvas" element={<Canvas />} />
            <Route path="/editor" element={<Editor />} />
            <Route path="/terminal" element={<Terminal />} />
            <Route path="/roadview" element={<RoadView />} />
            <Route path="/backroad" element={<Backroad />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/subscribe" element={<Subscribe />} />
            <Route path="/lucidia" element={<Lucidia />} />
            <Route path="/math" element={<InfinityMath />} />
            <Route path="/codex/:slug" element={<CodexPromptPage />} />
            <Route path="/ot" element={<OptimalTransportLab />} />
            <Route path="/bifurcate" element={<BifurcationLab />} />
            <Route path="/cfrac" element={<ContinuedFractionsLab />} />
            <Route path="/qjulia" element={<QuatJuliaLab />} />
            <Route path="/fluids" element={<StableFluidsLab />} />
            <Route path="/autodiff" element={<AutoDiffLab />} />
            <Route path="/conformal" element={<ConformalGridLab />} />
            <Route path="/eikonal" element={<EikonalLab />} />
            <Route path="/poisson2" element={<PoissonDiskLab />} />
            <Route path="/lsys" element={<LSystemLab />} />
            <Route path="/minimal" element={<MinimalSurfaceLab />} />
            <Route path="/eigenmaps" element={<EigenmapsLab />} />
            <Route path="/blend" element={<PoissonBlendLab />} />
            <Route path="/nbody" element={<NBodyLab />} />
            <Route path="/wavelet" element={<WaveletLab />} />
            <Route path="/pb" element={<PoissonBoltzmannLab />} />
            <Route path="/ridge" element={<RidgeRegressionLab />} />
            <Route path="/kpca" element={<KernelPCALab />} />
             <Route path="/brushfire" element={<BrushfirePathLab />} />
             <Route path="/blue-tsp" element={<BlueNoiseTSPLab />} />
             <Route path="/bezier-lit" element={<BezierShadedSurfaceLab />} />
             <Route path="/kf-2d" element={<Kalman2DTrackerLab />} />
             <Route path="/vorticity" element={<VorticityStreamLab />} />
            <Route path="chat" element={<Chat />} />
            <Route path="canvas" element={<Canvas />} />
            <Route path="editor" element={<Editor />} />
            <Route path="terminal" element={<Terminal />} />
            <Route path="roadview" element={<RoadView />} />
            <Route path="backroad" element={<Backroad />} />
            <Route path="subscribe" element={<Subscribe />} />
            <Route path="lucidia" element={<Lucidia />} />
            <Route path="math" element={<InfinityMath />} />
            <Route path="codex/:slug" element={<CodexPromptPage />} />
            <Route path="ot" element={<OptimalTransportLab />} />
            <Route path="bifurcate" element={<BifurcationLab />} />
            <Route path="cfrac" element={<ContinuedFractionsLab />} />
            <Route path="qjulia" element={<QuatJuliaLab />} />
            <Route path="fluids" element={<StableFluidsLab />} />
            <Route path="autodiff" element={<AutoDiffLab />} />
            <Route path="conformal" element={<ConformalGridLab />} />
            <Route path="eikonal" element={<EikonalLab />} />
            <Route path="poisson2" element={<PoissonDiskLab />} />
            <Route path="lsys" element={<LSystemLab />} />
            <Route path="minimal" element={<MinimalSurfaceLab />} />
            <Route path="eigenmaps" element={<EigenmapsLab />} />
            <Route path="blend" element={<PoissonBlendLab />} />
            <Route path="nbody" element={<NBodyLab />} />
            <Route path="wavelet" element={<WaveletLab />} />
            <Route path="pb" element={<PoissonBoltzmannLab />} />
            <Route path="ridge" element={<RidgeRegressionLab />} />
            <Route path="kpca" element={<KernelPCALab />} />
             <Route path="brushfire" element={<BrushfirePathLab />} />
             <Route path="blue-tsp" element={<BlueNoiseTSPLab />} />
             <Route path="bezier-lit" element={<BezierShadedSurfaceLab />} />
             <Route path="kf-2d" element={<Kalman2DTrackerLab />} />
             <Route path="vorticity" element={<VorticityStreamLab />} />
             <Route path="*" element={<div>Not found</div>} />
          </Routes>
        </section>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Desktop />} />
      <Route path="/quantum-consciousness" element={<QuantumConsciousness />} />
      <Route path="/*" element={<LegacyApp />} />
    </Routes>
  );
}
