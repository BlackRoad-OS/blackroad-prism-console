import { useEffect, useMemo, useRef, useState } from "react";
import ActiveReflection from "./ActiveReflection.jsx";

/**
 * Evaluates the i-th cubic Bernstein basis polynomial at parameter t.
 * @param {number} i - Basis function index (0-3)
 * @param {number} t - Parameter value in [0,1]
 * @returns {number} Basis function value
 */
function B(i,t){ // cubic Bernstein
  if(i===0) return (1-t)**3;
  if(i===1) return 3*t*(1-t)**2;
  if(i===2) return 3*t*t*(1-t);
  if(i===3) return t**3;
  return 0;
}
/**
 * Evaluates a bicubic Bézier surface at parameters (u, v).
 * @param {Array<Array<number>>} P - 4x4 control net (height values)
 * @param {number} u - First parameter in [0,1]
 * @param {number} v - Second parameter in [0,1]
 * @returns {number} Surface height at (u, v)
 */
function evalSurface(P, u, v){
  let z=0; for(let i=0;i<4;i++) for(let j=0;j<4;j++) z += P[i][j]*B(i,u)*B(j,v); return z;
}

/**
 * Interactive lab for exploring bicubic Bézier surfaces.
 * Users can drag control points to modify the surface shape in real-time.
 * @returns {JSX.Element} The Bézier surface lab component
 */
export default function BezierSurfaceLab(){
  const [P,setP]=useState(()=>{
    const base=[ [0,0,0,0],[0,0.4,0.4,0],[0,0.4,0.4,0],[0,0,0,0] ];
    return base.map(r=>r.slice());
  });
  const dragRef = useRef(null);
  const downRef = useRef(false);
  const PRef = useRef(P);
  useEffect(()=>{ PRef.current = P; },[P]);

  const W=640,H=360, pad=30;
  const X=(u)=> pad + u*(W-2*pad);
  const Y=(v)=> H-pad - v*(H-2*pad);

  const surf = useMemo(()=>{
    const K=30; const lines=[];
    for(let k=0;k<=K;k++){
      const u=k/K; const poly=[];
      for(let j=0;j<=K;j++){ const v=j/K; const z=evalSurface(P,u,v); poly.push([X(v), Y((z+1)/2)]); }
      lines.push(poly);
    }
    return lines;
  },[P]);

  const svgRef=useRef(null);
  useEffect(()=>{
    const svg=svgRef.current; if(!svg) return;
    const hit=(x,y)=>{
      // control grid at (i,j) located at (u=i/3, v=j/3); visual marker at bottom plane
      for(let i=0;i<4;i++) for(let j=0;j<4;j++){
        const px=X(j/3), py=Y((PRef.current[i][j]+1)/2);
        if((px-x)**2 + (py-y)**2 < 9**2) return [i,j];
      }
      return null;
    };
    const downH=(e)=>{ downRef.current=true; const {x,y}=clientToSvg(e,svg); const h=hit(x,y); if(h) dragRef.current=h; };
    const moveH=(e)=>{ if(!downRef.current || !dragRef.current) return; const {x,y}=clientToSvg(e,svg);
      const [i,j]=dragRef.current; const val = 2*( (H-pad - y)/(H-2*pad) ) - 1; // invert Y mapping
      setP(prev=>{ const copy=prev.map(r=>r.slice()); copy[i][j]=Math.max(-1,Math.min(1,val)); return copy; });
    };
    const upH=()=>{ downRef.current=false; dragRef.current=null; };
    svg.addEventListener("mousedown",downH);
    window.addEventListener("mousemove",moveH);
    window.addEventListener("mouseup",upH);
    return ()=>{ svg.removeEventListener("mousedown",downH); window.removeEventListener("mousemove",moveH); window.removeEventListener("mouseup",upH); };
  },[]);

  return (
    <div className="p-4 space-y-3">
      <h2 className="text-xl font-semibold">Bézier Surface — bicubic control net</h2>
      <section className="p-3 rounded-lg bg-white/5 border border-white/10">
        <svg ref={svgRef} width="100%" viewBox={`0 0 ${W} ${H}`}>
          <rect x="0" y="0" width={W} height={H} fill="none"/>
          {/* isolines */}
          {surf.map((poly,i)=><polyline key={i} points={poly.map(p=>p.join(",")).join(" ")} fill="none" strokeWidth="1"/>)}
          {/* control net (markers at their z) */}
          {Array.from({length:4},(_,i)=> i).map(i=> Array.from({length:4},(_,j)=> j).map(j=>{
            const px=X(j/3), py=Y((P[i][j]+1)/2);
            return <g key={`p-${i}-${j}`}><circle cx={px} cy={py} r="6"/><text x={px+8} y={py-8} fontSize="10">P{i}{j}</text></g>;
          }))}
        </svg>
      </section>
      <ActiveReflection
        title="Active Reflection — Bézier Surface"
        storageKey="reflect_bezier_surface"
        prompts={[
          "Raise a corner vs middle: how does the surface bend and where do isolines bunch?",
          "Symmetry: set P₁₂=P₂₁, etc. Do you see mirror planes?",
          "Why do Bernstein polynomials guarantee convex-hull containment?"
        ]}
      />
    </div>
  );
}
/**
 * Converts client mouse coordinates to SVG coordinate space.
 * @param {MouseEvent} e - Mouse event
 * @param {SVGElement} svg - SVG element
 * @returns {{x: number, y: number}} Coordinates in SVG space
 */
function clientToSvg(e,svg){ const pt=svg.createSVGPoint(); pt.x=e.clientX; pt.y=e.clientY; const inv=svg.getScreenCTM().inverse(); const p=pt.matrixTransform(inv); return {x:p.x,y:p.y}; }

