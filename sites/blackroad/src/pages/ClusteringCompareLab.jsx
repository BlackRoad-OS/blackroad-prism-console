import { useMemo, useState } from "react";
import ActiveReflection from "./ActiveReflection.jsx";

/**
 * Creates a linear congruential generator for pseudo-random numbers.
 * @param {number} seed - Initial seed value for the random number generator
 * @returns {function(): number} Function that returns pseudo-random number in [0,1)
 */
function rng(seed){ let s=seed|0||2025; return ()=> (s=(1664525*s+1013904223)>>>0)/2**32; }

/**
 * Generates a standard normal (Gaussian) random variable using Box-Muller transform.
 * @param {function(): number} r - Random number generator function
 * @returns {number} Random value from standard normal distribution
 */
function randn(r){ const u=Math.max(r(),1e-12), v=Math.max(r(),1e-12); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }

/**
 * Generates synthetic clustering data with k groups of normally distributed points.
 * @param {number} n - Total number of points to generate
 * @param {number} k - Number of clusters
 * @param {number} sep - Separation scale between cluster centers
 * @param {number} seed - Random seed for reproducibility
 * @returns {Array<[number, number]>} Array of 2D points
 */
function makeData(n, k, sep, seed){
  const r=rng(seed);
  const centers = Array.from({length:k},()=>[sep*(r()-0.5), sep*(r()-0.5)]);
  const pts=[];
  for(let i=0;i<n;i++){
    const c=centers[i%k];
    pts.push([ c[0] + 0.35*randn(r), c[1] + 0.35*randn(r) ]);
  }
  return pts;
}
/**
 * Performs k-means clustering on 2D points.
 * @param {Array<[number, number]>} X - Array of 2D points
 * @param {number} k - Number of clusters
 * @param {number} [iters=50] - Maximum number of iterations
 * @returns {{labels: Array<number>, centers: Array<[number, number]>}} Cluster assignments and centroids
 */
function kmeans(X, k, iters=50){
  const n=X.length; const idx=Array(n).fill(0);
  let C=X.slice(0,k).map(p=>p.slice());
  for(let it=0; it<iters; it++){
    // assign
    for(let i=0;i<n;i++){
      let best=0, bd=Infinity; for(let c=0;c<k;c++){ const d=(X[i][0]-C[c][0])**2+(X[i][1]-C[c][1])**2; if(d<bd){bd=d; best=c;} }
      idx[i]=best;
    }
    // update
    const sum=Array.from({length:k},()=>[0,0]); const cnt=Array(k).fill(0);
    for(let i=0;i<n;i++){ sum[idx[i]][0]+=X[i][0]; sum[idx[i]][1]+=X[i][1]; cnt[idx[i]]++; }
    for(let c=0;c<k;c++){ if(cnt[c]){ C[c][0]=sum[c][0]/cnt[c]; C[c][1]=sum[c][1]/cnt[c]; } }
  }
  return {labels:idx, centers:C};
}
/**
 * Performs spectral clustering using normalized graph Laplacian.
 * Constructs an affinity graph via RBF kernel, then embeds points in eigenspace and clusters.
 * @param {Array<[number, number]>} X - Array of 2D points
 * @param {number} k - Number of clusters
 * @param {number} [sigma=0.8] - Bandwidth parameter for RBF kernel
 * @returns {Array<number>} Cluster labels for each point
 */
function spectral(X, k, sigma=0.8){
  const n=X.length;
  const W=Array.from({length:n},()=>Array(n).fill(0));
  for(let i=0;i<n;i++) for(let j=i+1;j<n;j++){
    const d=(X[i][0]-X[j][0])**2+(X[i][1]-X[j][1])**2;
    const w=Math.exp(-d/(2*sigma*sigma)); W[i][j]=W[j][i]=w;
  }
  const D=Array(n).fill(0); for(let i=0;i<n;i++) D[i]=W[i].reduce((a,b)=>a+b,0);
  // normalized Laplacian Lsym = I - D^{-1/2} W D^{-1/2}; power iteration to get first k eigenvectors (skip trivial)
  // We'll build a simple embedding by (I - αL)^(T) * random, then k-means in embedding.
  const alpha=1/(Math.max(...D)+1e-9);
  const M=(v)=>{
    // (I - αL) v
    const y=Array(n).fill(0);
    for(let i=0;i<n;i++){
      let sum=0; for(let j=0;j<n;j++) sum += (i===j?D[i]:-W[i][j]) * v[j];
      y[i] = v[i] - alpha*sum;
    }
    // center & normalize
    const mean=y.reduce((a,b)=>a+b,0)/n; for(let i=0;i<n;i++) y[i]-=mean;
    const norm=Math.sqrt(y.reduce((a,b)=>a+b*b,0))||1; for(let i=0;i<n;i++) y[i]/=norm;
    return y;
  };
  // build k-dim features by iterating from k random seeds
  const r=()=>Array(n).fill(0).map(_=>Math.random()*2-1);
  const feats=Array.from({length:k},()=>{ let v=r(); for(let t=0;t<80;t++) v=M(v); return v; });
  const F=Array.from({length:n},(_,i)=> feats.map(f=>f[i]));
  return kmeans(F, k, 50).labels;
}

/**
 * Interactive lab comparing K-Means and Spectral clustering algorithms.
 * Allows users to adjust parameters and observe clustering behavior on synthetic data.
 * @returns {JSX.Element} The clustering comparison lab component
 */
export default function ClusteringCompareLab(){
  const [n,setN]=useState(300);
  const [k,setK]=useState(3);
  const [sep,setSep]=useState(3.2);
  const [seed,setSeed]=useState(7);
  const [sigma,setSigma]=useState(0.8);

  const data = useMemo(()=> makeData(n,k,sep,seed),[n,k,sep,seed]);
  const km = useMemo(()=> kmeans(data, k),[data,k]);
  const sp = useMemo(()=> spectral(data, k, sigma),[data,k,sigma]);

  return (
    <div className="p-4 space-y-3">
      <h2 className="text-xl font-semibold">K-Means vs Spectral — side-by-side</h2>
      <div className="grid" style={{gridTemplateColumns:"1fr 1fr", gap:16}}>
        <Scatter title="K-Means" pts={data} labels={km.labels} centers={km.centers}/>
        <Scatter title="Spectral" pts={data} labels={sp}/>
      </div>
      <div className="grid" style={{gridTemplateColumns:"1fr 320px", gap:16}}>
        <div />
        <section className="p-3 rounded-lg bg-white/5 border border-white/10">
          <Slider label="points" v={n} set={setN} min={80} max={1000} step={20}/>
          <Slider label="clusters k" v={k} set={setK} min={2} max={5} step={1}/>
          <Slider label="separation" v={sep} set={setSep} min={1.2} max={5.0} step={0.1}/>
          <Slider label="seed" v={seed} set={setSeed} min={1} max={9999} step={1}/>
          <Slider label="spectral σ" v={sigma} set={setSigma} min={0.2} max={1.6} step={0.05}/>
          <ActiveReflection
            title="Active Reflection — Clustering"
            storageKey="reflect_cluster_compare"
            prompts={[
              "Where does k-means fail (non-convex clusters) but spectral succeeds?",
              "How does increasing separation affect agreement between methods?",
              "Try k=2–4: when do both pick the same boundaries?"
            ]}
          />
        </section>
      </div>
    </div>
  );
}

/**
 * Renders a scatter plot visualization of clustered points.
 * @param {Object} props - Component props
 * @param {string} props.title - Title for the scatter plot
 * @param {Array<[number, number]>} props.pts - Array of 2D points
 * @param {Array<number>} [props.labels] - Cluster labels for each point
 * @param {Array<[number, number]>} [props.centers] - Cluster centroids to display
 * @returns {JSX.Element} The scatter plot component
 */
function Scatter({title, pts, labels, centers}){
  const W=640,H=360,pad=20;
  const xs=pts.map(p=>p[0]), ys=pts.map(p=>p[1]);
  const minX=Math.min(...xs), maxX=Math.max(...xs);
  const minY=Math.min(...ys), maxY=Math.max(...ys);
  const X=x=> pad+(x-minX)/(maxX-minX+1e-9)*(W-2*pad);
  const Y=y=> H-pad-(y-minY)/(maxY-minY+1e-9)*(H-2*pad);
  const palette=["#60a5fa","#f97316","#34d399","#f472b6","#facc15","#a855f7","#22d3ee","#f87171"];
  const colorForLabel=(label)=>{
    const idx = ((label ?? 0)%palette.length + palette.length)%palette.length;
    return palette[idx];
  };
  const uniqueLabels = labels ? Array.from(new Set(labels)) : [];
  return (
    <section className="p-3 rounded-lg bg-white/5 border border-white/10">
      <h3 className="font-semibold mb-2">{title}</h3>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`}>
        {pts.map((p,i)=>{
          const fill = labels?.length ? colorForLabel(labels[i]) : "#cbd5f5";
          return (
            <circle
              key={i}
              cx={X(p[0])}
              cy={Y(p[1])}
              r="3.5"
              fill={fill}
              stroke="rgba(15,23,42,0.6)"
              strokeWidth="0.8"
            />
          );
        })}
        {centers?.map((c,i)=>(
          <g key={`center-${i}`}>
            <circle
              cx={X(c[0])}
              cy={Y(c[1])}
              r="7"
              fill="none"
              stroke={colorForLabel(i)}
              strokeWidth="2"
            />
            <line x1={X(c[0])-6} y1={Y(c[1])} x2={X(c[0])+6} y2={Y(c[1])} stroke={colorForLabel(i)} strokeWidth="1.5"/>
            <line x1={X(c[0])} y1={Y(c[1])-6} x2={X(c[0])} y2={Y(c[1])+6} stroke={colorForLabel(i)} strokeWidth="1.5"/>
          </g>
        ))}
      </svg>
      {uniqueLabels.length ? (
        <div className="mt-2 flex flex-wrap gap-3 text-xs opacity-80">
          {uniqueLabels.map((lab)=> (
            <span key={lab} className="flex items-center gap-1">
              <span
                className="inline-block w-3 h-3 rounded-sm"
                style={{background: colorForLabel(lab)}}
              />
              Cluster {lab}
            </span>
          ))}
        </div>
      ) : null}
    </section>
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
  let digits=2;
  if(typeof step==='number'){
    if(step>=1) digits=0; else if(step>=0.1) digits=1;
  }
  const show=(typeof v==='number'&&Number.isFinite(v))?v.toFixed(digits):v;
  return (<div className="mb-2"><label className="text-sm opacity-80">{label}: <b>{show}</b></label>
    <input className="w-full" type="range" min={min} max={max} step={step}
           value={v} onChange={e=>set(parseFloat(e.target.value))}/></div>);
}

