import { useMemo, useRef, useEffect, useState } from "react";
import ActiveReflection from "./ActiveReflection.jsx";

/**
 * Implicit function definitions for various 2D curves.
 * @param {string} kind - Curve type: "circle", "heart", "lemni", or "rose"
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {number} Function value (negative inside, positive outside)
 */
function F(kind, x, y){
  if(kind==="circle") return x*x + y*y - 1;
  if(kind==="heart")  return (x*x + y*y - 1)**3 - x*x*y*y*y;
  if(kind==="lemni")  return (x*x + y*y)**2 - 2*(x*x - y*y);
  if(kind==="rose")   return Math.sin(3*Math.atan2(y,x)) - Math.hypot(x,y)+0.6;
  return x*x + y*y - 1;
}

/**
 * Marching squares algorithm for extracting iso-contours from implicit functions.
 * Tessellates the domain into a grid and computes line segments approximating the level set.
 * @param {string} kind - Curve type to evaluate
 * @param {number} N - Grid resolution (N×N cells)
 * @param {number} [iso=0] - Iso-value to extract
 * @returns {Array<Array<[number, number]>>} Array of line segments (each segment is [pointA, pointB])
 */
function marching(kind, N, iso=0){
  // grid in [-1.5,1.5]^2
  const L=1.5; const h=2*L/N;
  const lines=[];
  for(let i=0;i<N;i++){
    for(let j=0;j<N;j++){
      const x=-L + j*h, y=-L + i*h;
      const s = [
        F(kind,x,y) < iso ? 1:0,
        F(kind,x+h,y) < iso ? 1:0,
        F(kind,x+h,y+h) < iso ? 1:0,
        F(kind,x,y+h) < iso ? 1:0
      ];
      const code = s[0] | (s[1]<<1) | (s[2]<<2) | (s[3]<<3);
      if(code===0 || code===15) continue;
      const edge = (a,b)=>{ // linear interp on edge a->b (0: (x,y)->(x+h,y); 1: (x+h,y)->(x+h,y+h); 2: (x+h,y+h)->(x,y+h); 3: (x,y+h)->(x,y))
        const P=[[x,y],[x+h,y],[x+h,y+h],[x,y+h]];
        const fa=F(kind,P[a][0],P[a][1]), fb=F(kind,P[b][0],P[b][1]);
        const t = (iso-fa)/((fb-fa)||1e-12);
        return [ P[a][0] + t*(P[b][0]-P[a][0]), P[a][1] + t*(P[b][1]-P[a][1]) ];
      };
      // Cases (as line segments)
      const table = {
        1:[[3,0]], 2:[[0,1]], 3:[[3,1]], 4:[[1,2]], 5:[[3,0],[1,2]], 6:[[0,2]],
        7:[[3,2]], 8:[[2,3]], 9:[[0,2]], 10:[[1,3],[0,2]], 11:[[1,3]], 12:[[1,3]], 13:[[0,1]], 14:[[3,0]]
      };
      const segs = table[code] || [];
      for(const [ea,eb] of segs){
        const A = edge(ea, (ea+1)%4);
        const B = edge(eb, (eb+1)%4);
        lines.push([A,B]);
      }
    }
  }
  return lines;
}

/**
 * Interactive lab demonstrating the marching squares algorithm for implicit curves.
 * Users can select different curve types and adjust grid resolution.
 * @returns {JSX.Element} The marching squares lab component
 */
export default function MarchingSquaresLab(){
  const [kind,setKind]=useState("heart");
  const [N,setN]=useState(64);
  const segments = useMemo(()=> marching(kind,N,0),[kind,N]);

  const W=640,H=360,pad=20, L=1.5;
  const X=x=> pad + (x+L)/(2*L)*(W-2*pad);
  const Y=y=> H-pad - (y+L)/(2*L)*(H-2*pad);

  return (
    <div className="p-4 space-y-3">
      <h2 className="text-xl font-semibold">Implicit Curves — Marching Squares</h2>
      <section className="p-3 rounded-lg bg-white/5 border border-white/10">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
          <rect x="0" y="0" width={W} height={H} fill="none"/>
          {segments.map(([[x1,y1],[x2,y2]],i)=> <line key={i} x1={X(x1)} y1={Y(y1)} x2={X(x2)} y2={Y(y2)} strokeWidth="2"/>) }
        </svg>
      </section>
      <div className="grid" style={{gridTemplateColumns:"1fr 320px", gap:16}}>
        <div />
        <section className="p-3 rounded-lg bg-white/5 border border-white/10">
          <Radio name="kind" value={kind} set={setKind} opts={[["heart","heart"],["circle","circle"],["lemni","lemniscate"],["rose","rose"]]} />
          <Slider label="grid N" v={N} set={setN} min={24} max={160} step={8}/>
          <ActiveReflection
            title="Active Reflection — Marching Squares"
            storageKey="reflect_march"
            prompts={[
              "Increase N: where does the curve smooth out most?",
              "Which shapes create self-intersections or multiple components?",
              "Why is linear interpolation good enough for crisp edges?"
            ]}
          />
        </section>
      </div>
    </div>
  );
}
/**
 * Renders a labeled range slider control.
 * @param {Object} props - Component props
 * @param {string} props.label - Label text for the slider
 * @param {number} props.v - Current value
 * @param {function(number): void} props.set - Callback to update value
 * @param {number} props.min - Minimum value
 * @param {number} props.max - Maximum value
 * @param {number} props.step - Step increment
 * @returns {JSX.Element} The slider component
 */
function Slider({label,v,set,min,max,step}){
  const show=(typeof v==='number'&&v.toFixed)?v.toFixed(0):v;
  return (<div className="mb-2"><label className="text-sm opacity-80">{label}: <b>{show}</b></label>
  <input className="w-full" type="range" min={min} max={max} step={step}
    value={v} onChange={e=>set(parseFloat(e.target.value))}/></div>);
}
/**
 * Renders a radio button group for selecting options.
 * @param {Object} props - Component props
 * @param {string} props.name - Name attribute for radio group
 * @param {string} props.value - Currently selected value
 * @param {function(string): void} props.set - Callback to update selection
 * @param {Array<[string, string]>} props.opts - Array of [value, label] pairs
 * @returns {JSX.Element} The radio group component
 */
function Radio({name,value,set,opts}){
  return (<div className="flex gap-3 text-sm">
    {opts.map(([val,lab])=><label key={val} className="flex items-center gap-1">
      <input type="radio" name={name} checked={value===val} onChange={()=>set(val)}/>{lab}
    </label>)}
  </div>);
}

