import { useEffect, useMemo, useRef, useState, forwardRef } from "react";
import ActiveReflection from "./ActiveReflection.jsx";

/**
 * Breadth-first search to find an augmenting path in the residual graph.
 * @param {Array<Array<number>>} res - Residual capacity matrix
 * @param {number} s - Source node index
 * @param {number} t - Sink node index
 * @returns {{par: Array<number>, flow: number}} Parent array for path reconstruction and bottleneck flow
 */
function bfs(res, s, t){
  const n=res.length, q=[s], par=Array(n).fill(-1); par[s]=-2;
  const cap=Array(n).fill(0); cap[s]=Infinity;
  while(q.length){
    const u=q.shift();
    for(let v=0; v<n; v++){
      if(par[v]===-1 && res[u][v]>1e-9){
        par[v]=u; cap[v]=Math.min(cap[u], res[u][v]);
        if(v===t) return {par, flow:cap[v]};
        q.push(v);
      }
    }
  }
  return {par, flow:0};
}
/**
 * Computes maximum flow using the Edmonds-Karp algorithm.
 * Also identifies the minimum cut by finding reachable nodes in the residual graph.
 * @param {Array<Array<number>>} C - Capacity matrix
 * @param {number} s - Source node index
 * @param {number} t - Sink node index
 * @returns {{flow: number, cutLeft: Array<boolean>, cutRight: Array<boolean>, paths: Array<Object>}} Max flow value, cut partitions, and augmenting paths
 */
function edmondsKarp(C, s, t){
  const n=C.length, R=C.map(r=>r.slice());
  let flow=0, paths=[];
  while(true){
    const {par, flow:f}=bfs(R,s,t);
    if(f<=0) break;
    flow+=f; paths.push({par, f});
    let v=t; while(v!==s){ const u=par[v]; R[u][v]-=f; R[v][u]+=f; v=u; }
  }
  // min cut by reachable in residual
  const vis=Array(n).fill(false); const stack=[s]; vis[s]=true;
  while(stack.length){ const u=stack.pop(); for(let v=0; v<n; v++) if(!vis[v] && R[u][v]>1e-9){ vis[v]=true; stack.push(v); } }
  const cutLeft = vis, cutRight = vis.map(x=>!x);
  return {flow, cutLeft, cutRight, paths};
}

/**
 * Interactive lab for visualizing max-flow/min-cut with Edmonds-Karp algorithm.
 * Supports node dragging, edge capacity editing, and step-by-step augmenting path visualization.
 * @returns {JSX.Element} The max-flow lab component
 */
export default function MaxFlowLab(){
  const [nodes,setNodes]=useState([
    {x:100,y:200,label:"s"},
    {x:260,y:100,label:"1"},
    {x:260,y:300,label:"2"},
    {x:420,y:100,label:"3"},
    {x:420,y:300,label:"4"},
    {x:580,y:200,label:"t"},
  ]);
  const [edges,setEdges]=useState([
    [0,1,8],[0,2,10],[1,3,4],[1,2,2],[2,4,8],[3,5,10],[4,5,8],[3,4,2]
  ]); // [u,v,cap]
  const [result,setResult]=useState(null);
  const [lastAug,setLastAug]=useState(null);

  const n = nodes.length;
  const C = useMemo(()=>{
    const M=Array.from({length:n},()=>Array(n).fill(0));
    for(const [u,v,c] of edges) M[u][v]=c;
    return M;
  },[edges,n]);

  const run = ()=>{
    const r = edmondsKarp(C, 0, n-1);
    setResult(r);
    setLastAug(null);
  };

  // click edge to edit cap
  const svgRef=useRef(null);
  const onEdgeClick=(u,v)=>{
    const c = prompt(`Capacity for ${u}->${v}`, String(C[u][v]||0));
    if(c==null) return;
    const cap = Math.max(0, parseFloat(c)||0);
    setEdges(es=>{
      const idx=es.findIndex(e=>e[0]===u && e[1]===v);
      if(idx>=0){ const copy=es.slice(); copy[idx]=[u,v,cap]; return copy; }
      return es.concat([[u,v,cap]]);
    });
  };

  // drag nodes
  const dragRef = useRef(null);
  const downRef = useRef(false);
  const nodesRef = useRef(nodes);
  useEffect(()=>{ nodesRef.current = nodes; });
  useEffect(()=>{
    const svg = svgRef.current; if(!svg) return;
    const downH=(e)=>{
      const {x,y} = clientToSvg(e, svg);
      const id = nodesRef.current.findIndex(p=> (p.x-x)**2+(p.y-y)**2 < 18**2);
      if(id>=0){ downRef.current=true; dragRef.current=id; }
    };
    const moveH=(e)=>{
      if(!downRef.current || dragRef.current==null) return;
      const {x,y} = clientToSvg(e, svg);
      const id = dragRef.current;
      setNodes(ns=> ns.map((p,i)=> i===id ? {...p,x,y} : p));
    };
    const upH=()=>{ downRef.current=false; dragRef.current=null; };
    svg.addEventListener("mousedown",downH);
    window.addEventListener("mousemove",moveH);
    window.addEventListener("mouseup",upH);
    return ()=>{ svg.removeEventListener("mousedown",downH); window.removeEventListener("mousemove",moveH); window.removeEventListener("mouseup",upH); };
  },[]);

  // augmenting path step-by-step
  const step = ()=>{
    const r = edmondsKarp(C, 0, n-1);
    setResult(r);
    const {paths} = r;
    if(!paths.length){ setLastAug(null); return; }
    const idx = lastAug==null ? 0 : Math.min(paths.length-1, lastAug+1);
    setLastAug(idx);
  };

  return (
    <div className="p-4 space-y-3">
      <h2 className="text-xl font-semibold">Max-Flow / Min-Cut — Edmonds–Karp</h2>
      <Graph ref={svgRef} nodes={nodes} edges={edges} C={C} result={result} lastAug={lastAug} onEdgeClick={onEdgeClick}/>
      <div className="grid" style={{gridTemplateColumns:"1fr 340px", gap:16}}>
        <section className="p-3 rounded-lg bg-white/5 border border-white/10">
          <button className="px-3 py-1 rounded bg-white/10 border border-white/10" onClick={run}>Run Max-Flow</button>
          <button className="ml-2 px-3 py-1 rounded bg-white/10 border border-white/10" onClick={step}>Step Augment Path</button>
          <p className="text-sm mt-2">Max flow = <b>{result?.flow?.toFixed?.(2) ?? "-"}</b></p>
          <p className="text-xs opacity-70">Tip: click an edge label to change capacity; drag nodes to reposition.</p>
        </section>
        <ActiveReflection
          title="Active Reflection — Max-Flow"
          storageKey="reflect_maxflow"
          prompts={[
            "Which edges saturate at optimum? Are they exactly the min-cut crossing?",
            "Do parallel routes help more than a single high-capacity edge?",
            "When you increase one capacity, where does the flow reroute?"
          ]}
        />
      </div>
    </div>
  );
}

/**
 * Renders the flow network graph with nodes, directed edges, and min-cut visualization.
 * @param {Object} props - Component props
 * @param {Array<Object>} props.nodes - Array of node objects with x, y, label
 * @param {Array<[number, number, number]>} props.edges - Array of edges [source, target, capacity]
 * @param {Array<Array<number>>} props.C - Capacity matrix
 * @param {Object} [props.result] - Max-flow computation result
 * @param {number} [props.lastAug] - Index of currently highlighted augmenting path
 * @param {function(number, number): void} props.onEdgeClick - Callback when edge label is clicked
 * @param {React.Ref} ref - Forwarded ref to the SVG element
 * @returns {JSX.Element} The graph visualization component
 */
const Graph = forwardRef(function Graph({nodes, edges, C, result, lastAug, onEdgeClick}, ref){
  const W=800,H=400, pad=20;
  const augEdges = useMemo(()=>{
    if(lastAug==null || !result?.paths?.length) return [];
    const {par} = result.paths[lastAug];
    const list=[];
    let v=nodes.length-1;
    while(par[v]!==-2 && par[v]!==-1){ list.push([par[v], v]); v=par[v]; }
    return list.map(e=> e.join("->"));
  },[result,lastAug,nodes.length]);

  return (
    <section className="p-3 rounded-lg bg-white/5 border border-white/10">
      <svg ref={ref} width="100%" viewBox={`0 0 ${W} ${H}`}>
        <rect x="0" y="0" width={W} height={H} fill="none"/>
        {edges.map(([u,v,c],i)=>{
          const a=nodes[u], b=nodes[v];
          const dx=b.x-a.x, dy=b.y-a.y;
          const L=Math.hypot(dx,dy)||1e-9;
          const nx=dx/L, ny=dy/L;
          const offX = -ny*8, offY = nx*8;
          const mx=(a.x+b.x)/2 + offX, my=(a.y+b.y)/2 + offY;
          const isAug = augEdges.includes(`${u}->${v}`);
          return (
            <g key={i} opacity={1}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={isAug?3:2}/>
              {/* arrow head */}
              <polygon points={`${b.x-10*nx-4*ny},${b.y-10*ny+4*nx} ${b.x},${b.y} ${b.x-10*nx+4*ny},${b.y-10*ny-4*nx}`} />
              <text x={mx} y={my} fontSize="12" onClick={()=>onEdgeClick(u,v)} style={{cursor:"pointer"}}>
                {C[u][v].toFixed(1)}
              </text>
            </g>
          );
        })}
        {nodes.map((p,i)=>(
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="12"/>
            <text x={p.x-4} y={p.y+4} fontSize="12">{p.label ?? i}</text>
          </g>
        ))}
        {/* min cut shading */}
        {result?.cutLeft && nodes.map((p,i)=> result.cutLeft[i] ? <circle key={`c${i}`} cx={p.x} cy={p.y} r="16" opacity="0.08"/> : null)}
      </svg>
    </section>
  );
});

/**
 * Converts client mouse coordinates to SVG coordinate space.
 * @param {MouseEvent} e - Mouse event
 * @param {SVGElement} svg - SVG element
 * @returns {{x: number, y: number}} Coordinates in SVG space
 */
function clientToSvg(e, svg){
  const pt = svg.createSVGPoint(); pt.x=e.clientX; pt.y=e.clientY;
  const screenCTM = svg.getScreenCTM(); const inv=screenCTM.inverse();
  const loc = pt.matrixTransform(inv); return {x:loc.x, y:loc.y};
}

