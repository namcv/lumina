import type { SourceMapOutput } from './graph.js';

export interface HtmlGraphOptions {
  minImporters?: number;
  title?: string;
}

export function generateHtmlGraph(sourceMap: SourceMapOutput, opts: HtmlGraphOptions = {}): string {
  const { minImporters = 0, title = 'Dependency Graph' } = opts;

  const graphData = JSON.stringify(sourceMap.files);

  const cycleEdgeSet = new Set<string>();
  const cycleNodeSet = new Set<string>();
  for (const cycle of sourceMap.cycles) {
    for (let i = 0; i < cycle.length - 1; i++) {
      cycleEdgeSet.add(`${cycle[i]}||${cycle[i + 1]}`);
      cycleNodeSet.add(cycle[i]);
    }
  }
  const duplicateNodeSet = new Set<string>();
  for (const dup of sourceMap.duplicates) {
    for (const f of dup.files) duplicateNodeSet.add(f);
  }

  const meta = JSON.stringify({
    generated: sourceMap.generated,
    root: sourceMap.root,
    framework: sourceMap.framework,
    totalFiles: sourceMap.totalFiles,
    cycleCount: sourceMap.cycles.length,
    duplicateCount: sourceMap.duplicates.length,
  });
  const CYCLE_EDGES     = JSON.stringify([...cycleEdgeSet]);
  const CYCLE_NODES     = JSON.stringify([...cycleNodeSet]);
  const DUPLICATE_NODES = JSON.stringify([...duplicateNodeSet]);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${title}</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"></script>
<style>
/* ── reset & base ── */
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#f2f2f7;
  --surface:rgba(255,255,255,0.85);
  --surface-solid:#ffffff;
  --border:rgba(0,0,0,0.08);
  --border-strong:rgba(0,0,0,0.14);
  --text:#1d1d1f;
  --text-2:#6e6e73;
  --text-3:#aeaeb2;
  --accent:#0071e3;
  --accent-bg:rgba(0,113,227,0.1);
  --red:#ff3b30;
  --orange:#ff9f0a;
  --yellow:#ffd60a;
  --green:#30d158;
  --teal:#32ade6;
  --purple:#bf5af2;
  --indigo:#5e5ce6;
  --radius:12px;
  --radius-sm:8px;
  --radius-xs:6px;
  --shadow-sm:0 1px 3px rgba(0,0,0,.06),0 1px 2px rgba(0,0,0,.04);
  --shadow:0 4px 16px rgba(0,0,0,.08),0 1px 4px rgba(0,0,0,.04);
  --shadow-lg:0 12px 40px rgba(0,0,0,.12),0 4px 12px rgba(0,0,0,.06);
  --blur:saturate(180%) blur(20px);
}
body{
  font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Helvetica Neue',sans-serif;
  background:var(--bg);
  color:var(--text);
  height:100vh;
  overflow:hidden;
  display:flex;
  flex-direction:column;
  -webkit-font-smoothing:antialiased;
}

/* ── toolbar ── */
#toolbar{
  height:52px;
  background:var(--surface);
  backdrop-filter:var(--blur);
  -webkit-backdrop-filter:var(--blur);
  border-bottom:1px solid var(--border);
  display:flex;
  align-items:center;
  gap:10px;
  padding:0 16px;
  flex-shrink:0;
  position:relative;
  z-index:10;
}
#app-icon{
  width:28px;height:28px;
  background:linear-gradient(135deg,var(--indigo),var(--purple));
  border-radius:7px;
  display:flex;align-items:center;justify-content:center;
  font-size:15px;
  flex-shrink:0;
  box-shadow:0 2px 8px rgba(94,92,230,.35);
}
#app-title{
  font-size:13px;
  font-weight:600;
  color:var(--text);
  letter-spacing:-.01em;
  white-space:nowrap;
}
#search-wrap{
  position:relative;
  flex:1;
  max-width:280px;
  margin-left:4px;
}
#search-wrap svg{
  position:absolute;
  left:9px;top:50%;transform:translateY(-50%);
  opacity:.4;
  pointer-events:none;
}
#search{
  width:100%;
  padding:6px 10px 6px 30px;
  background:rgba(0,0,0,0.06);
  border:1px solid transparent;
  border-radius:20px;
  color:var(--text);
  font-size:13px;
  outline:none;
  transition:all .2s;
  font-family:inherit;
}
#search:focus{
  background:#fff;
  border-color:var(--accent);
  box-shadow:0 0 0 3px rgba(0,113,227,.15);
}
#search::placeholder{color:var(--text-3)}

.divider{width:1px;height:22px;background:var(--border-strong);flex-shrink:0;margin:0 2px}

/* ── pill group ── */
.pill-group{
  display:flex;
  background:rgba(0,0,0,0.06);
  border-radius:20px;
  padding:2px;
  gap:1px;
  flex-shrink:0;
}
.pill-btn{
  padding:4px 12px;
  border-radius:16px;
  border:none;
  background:transparent;
  color:var(--text-2);
  font-size:12px;
  font-weight:500;
  cursor:pointer;
  transition:all .15s;
  white-space:nowrap;
  font-family:inherit;
}
.pill-btn:hover{color:var(--text);background:rgba(0,0,0,.05)}
.pill-btn.active{
  background:var(--surface-solid);
  color:var(--text);
  box-shadow:var(--shadow-sm);
}

/* ── filter chips ── */
#filter-bar{
  height:40px;
  background:var(--surface);
  backdrop-filter:var(--blur);
  -webkit-backdrop-filter:var(--blur);
  border-bottom:1px solid var(--border);
  display:flex;
  align-items:center;
  gap:6px;
  padding:0 16px;
  flex-shrink:0;
  overflow-x:auto;
}
#filter-bar::-webkit-scrollbar{display:none}
.filter-label{font-size:11px;color:var(--text-3);white-space:nowrap;margin-right:2px;font-weight:500;letter-spacing:.02em;text-transform:uppercase}
.chip{
  padding:3px 10px;
  border-radius:20px;
  border:1px solid var(--border-strong);
  background:transparent;
  color:var(--text-2);
  font-size:12px;
  font-weight:500;
  cursor:pointer;
  white-space:nowrap;
  transition:all .15s;
  font-family:inherit;
  flex-shrink:0;
}
.chip:hover{background:rgba(0,0,0,.05);color:var(--text)}
.chip.active{background:var(--accent);border-color:var(--accent);color:#fff;box-shadow:0 2px 8px rgba(0,113,227,.3)}
.chip.warn{border-color:rgba(255,159,10,.4);color:var(--orange)}
.chip.warn.active{background:var(--orange);border-color:var(--orange);color:#fff;box-shadow:0 2px 8px rgba(255,159,10,.35)}
.chip.danger{border-color:rgba(255,59,48,.35);color:var(--red)}
.chip.danger.active{background:var(--red);border-color:var(--red);color:#fff;box-shadow:0 2px 8px rgba(255,59,48,.35)}
.chip.dup{border-color:rgba(255,159,10,.4);color:var(--orange)}
.chip.dup.active{background:var(--orange);border-color:var(--orange);color:#fff}

/* ── controls row ── */
#controls-row{
  display:flex;
  align-items:center;
  gap:8px;
  margin-left:auto;
  flex-shrink:0;
}
.ctrl-label{font-size:12px;color:var(--text-2);white-space:nowrap}
.num-input{
  width:44px;
  padding:4px 6px;
  background:rgba(0,0,0,.06);
  border:1px solid transparent;
  border-radius:var(--radius-xs);
  color:var(--text);
  font-size:12px;
  outline:none;
  text-align:center;
  font-family:inherit;
  transition:all .15s;
}
.num-input:focus{background:#fff;border-color:var(--accent)}
.toggle-label{
  display:flex;align-items:center;gap:5px;
  font-size:12px;color:var(--text-2);cursor:pointer;
}
#stat-badge{
  font-size:11px;
  color:var(--text-3);
  background:rgba(0,0,0,.05);
  padding:3px 8px;
  border-radius:10px;
  white-space:nowrap;
}

/* ── main layout ── */
#main{display:flex;flex:1;overflow:hidden;position:relative}
#canvas{flex:1;position:relative;overflow:hidden;background:var(--bg)}
svg{width:100%;height:100%}

/* ── grid bg ── */
#canvas::before{
  content:'';
  position:absolute;inset:0;
  background-image:radial-gradient(circle,rgba(0,0,0,.08) 1px,transparent 1px);
  background-size:24px 24px;
  pointer-events:none;
}

/* ── sidebar ── */
#sidebar{
  width:300px;
  background:var(--surface-solid);
  border-left:1px solid var(--border);
  display:flex;
  flex-direction:column;
  flex-shrink:0;
  overflow:hidden;
}
#sidebar-header{
  padding:14px 16px 10px;
  border-bottom:1px solid var(--border);
  flex-shrink:0;
}
#sidebar-header h2{
  font-size:13px;
  font-weight:600;
  color:var(--text);
  letter-spacing:-.01em;
}
#sidebar-body{
  flex:1;
  overflow-y:auto;
  padding:12px 16px 16px;
  display:flex;
  flex-direction:column;
  gap:14px;
}
#sidebar-body::-webkit-scrollbar{width:4px}
#sidebar-body::-webkit-scrollbar-thumb{background:var(--border-strong);border-radius:2px}
#detail-empty{
  color:var(--text-3);
  font-size:13px;
  text-align:center;
  padding:24px 0;
  line-height:1.6;
}
#detail-empty .empty-icon{font-size:32px;display:block;margin-bottom:8px;opacity:.5}

.section{display:flex;flex-direction:column;gap:6px}
.section-title{
  font-size:10px;
  font-weight:600;
  color:var(--text-3);
  text-transform:uppercase;
  letter-spacing:.08em;
}
.section-value{font-size:13px;color:var(--text);word-break:break-all;line-height:1.4}
.type-badge{
  display:inline-flex;
  align-items:center;
  gap:5px;
  padding:3px 9px;
  border-radius:20px;
  font-size:12px;
  font-weight:500;
  width:fit-content;
}
.metrics-grid{
  display:grid;
  grid-template-columns:1fr 1fr 1fr;
  gap:6px;
}
.metric-card{
  background:var(--bg);
  border-radius:var(--radius-sm);
  padding:8px;
  text-align:center;
}
.metric-val{font-size:17px;font-weight:600;color:var(--text);line-height:1.2}
.metric-key{font-size:10px;color:var(--text-3);margin-top:2px}
.flags{display:flex;flex-direction:column;gap:4px}
.flag-item{
  display:flex;align-items:center;gap:6px;
  font-size:12px;padding:5px 8px;
  border-radius:var(--radius-xs);
  background:var(--bg);
}

.file-list{
  display:flex;flex-direction:column;gap:2px;
  max-height:130px;overflow-y:auto;
}
.file-list::-webkit-scrollbar{width:3px}
.file-list::-webkit-scrollbar-thumb{background:var(--border-strong);border-radius:2px}
.file-item{
  font-size:11px;
  color:var(--text-2);
  padding:3px 7px;
  border-radius:var(--radius-xs);
  cursor:pointer;
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
  transition:all .1s;
  font-family:'SF Mono',Menlo,monospace;
}
.file-item:hover{background:var(--accent-bg);color:var(--accent)}

.http-list{display:flex;flex-direction:column;gap:3px;max-height:130px;overflow-y:auto}
.http-row{display:flex;align-items:center;gap:6px;padding:2px 0}
.method-pill{
  font-size:9px;font-weight:700;
  padding:2px 6px;border-radius:4px;
  flex-shrink:0;font-family:'SF Mono',Menlo,monospace;
}
.GET{background:#e8f9f0;color:#1a7f4b}
.POST{background:#eef2ff;color:#3730a3}
.PUT{background:#fff8e6;color:#92400e}
.DELETE{background:#fef2f2;color:#991b1b}
.PATCH{background:#f5f0ff;color:#6d28d9}
.QUERY{background:#f0fdf4;color:#166534}
.http-url{font-size:11px;color:var(--text-2);font-family:'SF Mono',Menlo,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* ── legend ── */
#sidebar-footer{
  border-top:1px solid var(--border);
  padding:12px 16px;
  flex-shrink:0;
}
.legend{display:grid;grid-template-columns:1fr 1fr;gap:5px}
.legend-item{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-2)}
.dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.hint{
  margin-top:8px;
  font-size:10px;color:var(--text-3);
  line-height:1.6;
  padding:8px;
  background:var(--bg);
  border-radius:var(--radius-xs);
}

/* ── svg elements ── */
.hull{stroke-width:1.5;stroke-dasharray:5,3}
.link{stroke-opacity:.45;stroke-width:1;fill:none}
.link.dep{stroke:#c7c7cc;marker-end:url(#arr-dep)}
.link.http{stroke:#30d158;stroke-width:1.5;stroke-dasharray:5,3;stroke-opacity:.7;marker-end:url(#arr-http)}
.link.cycle-edge{stroke:#ff3b30!important;stroke-opacity:.9!important;stroke-width:2!important}
.link.highlighted{stroke-opacity:1!important;stroke-width:2!important}
.node circle{stroke-width:1.5;cursor:pointer;transition:filter .15s}
.node:hover circle{filter:brightness(1.1)}
.node.selected circle{stroke-width:3;stroke:#fff;filter:drop-shadow(0 2px 6px rgba(0,0,0,.2))}
.node.dimmed circle{opacity:.15}
.node.dimmed text{opacity:.1}
.node text{
  font-size:9px;
  fill:var(--text-2);
  pointer-events:none;
  paint-order:stroke;
  stroke:#f2f2f7;
  stroke-width:3px;
  font-family:-apple-system,sans-serif;
}
.node.selected text,.node.hi text{fill:var(--text);font-size:10px;font-weight:500}
.cluster-label{
  font-size:12px;font-weight:600;
  fill:var(--text-3);
  pointer-events:none;
  font-family:-apple-system,sans-serif;
}
</style>
</head>
<body>

<!-- ── Toolbar ── -->
<div id="toolbar">
  <div id="app-icon">⬡</div>
  <span id="app-title">${title}</span>

  <div id="search-wrap">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
    </svg>
    <input id="search" type="text" placeholder="Search files…" autocomplete="off" spellcheck="false"/>
  </div>

  <div class="divider"></div>

  <div class="pill-group" id="mode-group">
    <button class="pill-btn active" data-mode="force">Force</button>
    <button class="pill-btn" data-mode="cluster">Cluster</button>
    <button class="pill-btn" data-mode="heatmap">Import heat</button>
    <button class="pill-btn" data-mode="complexity">Complexity</button>
    <button class="pill-btn" data-mode="risk">Risk</button>
  </div>

  <div class="divider"></div>

  <div id="controls-row">
    <span class="ctrl-label">Min imports</span>
    <input class="num-input" id="threshold" type="number" min="0" value="${minImporters}"/>
    <label class="toggle-label">
      <input id="show-http" type="checkbox" checked/> HTTP edges
    </label>
    <span id="stat-badge">–</span>
  </div>
</div>

<!-- ── Filter bar ── -->
<div id="filter-bar">
  <span class="filter-label">Show</span>
  <button class="chip active"  data-filter="">All</button>
  <button class="chip"         data-filter="react-component">Components</button>
  <button class="chip"         data-filter="react-hook">Hooks</button>
  <button class="chip"         data-filter="react-context">Contexts</button>
  <button class="chip"         data-filter="nestjs-module">Modules</button>
  <button class="chip"         data-filter="nestjs-controller">Controllers</button>
  <button class="chip"         data-filter="nestjs-service">Services</button>
  <button class="chip"         data-filter="http-caller">HTTP Callers</button>
  <button class="chip warn"    data-filter="alone">Alone</button>
  <button class="chip danger"  data-filter="cycles">Cycles</button>
  <button class="chip dup"     data-filter="duplicates">Duplicates</button>
</div>

<!-- ── Main ── -->
<div id="main">
  <div id="canvas">
    <svg id="svg">
      <defs>
        <marker id="arr-dep" viewBox="0 -3 6 6" refX="20" refY="0" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0,-3L6,0L0,3" fill="#c7c7cc"/>
        </marker>
        <marker id="arr-http" viewBox="0 -3 6 6" refX="20" refY="0" markerWidth="5" markerHeight="5" orient="auto">
          <path d="M0,-3L6,0L0,3" fill="#30d158"/>
        </marker>
      </defs>
    </svg>
  </div>

  <div id="sidebar">
    <div id="sidebar-header">
      <h2>Inspector</h2>
    </div>
    <div id="sidebar-body">
      <div id="detail-empty">
        <span class="empty-icon">⬡</span>
        Click a node to<br/>inspect it
      </div>
      <div id="detail-panel" style="display:none;flex-direction:column;gap:14px">

        <div class="section">
          <span class="section-title">File</span>
          <span class="section-value" id="d-file" style="font-family:'SF Mono',Menlo,monospace;font-size:11px"></span>
        </div>

        <div class="section">
          <span class="section-title">Type</span>
          <span class="type-badge" id="d-type"></span>
        </div>

        <div class="section">
          <span class="section-title">Metrics</span>
          <div class="metrics-grid">
            <div class="metric-card">
              <div class="metric-val" id="m-complexity">–</div>
              <div class="metric-key">Complexity</div>
            </div>
            <div class="metric-card">
              <div class="metric-val" id="m-risk">–</div>
              <div class="metric-key">Risk</div>
            </div>
            <div class="metric-card">
              <div class="metric-val" id="m-churn">–</div>
              <div class="metric-key">Commits</div>
            </div>
          </div>
        </div>

        <div class="section" id="flags-section" style="display:none">
          <span class="section-title">Flags</span>
          <div class="flags" id="d-flags"></div>
        </div>

        <div class="section">
          <span class="section-title">Imported by (<span id="d-by-count">0</span>)</span>
          <div class="file-list" id="d-imported-by"></div>
        </div>

        <div class="section">
          <span class="section-title">Imports (<span id="d-imports-count">0</span>)</span>
          <div class="file-list" id="d-imports"></div>
        </div>

        <div class="section" id="http-section" style="display:none">
          <span class="section-title">HTTP Calls</span>
          <div class="http-list" id="d-http"></div>
        </div>

        <div class="section" id="routes-section" style="display:none">
          <span class="section-title">NestJS Routes</span>
          <div class="http-list" id="d-routes"></div>
        </div>

      </div>
    </div>

    <div id="sidebar-footer">
      <div class="legend">
        <div class="legend-item"><div class="dot" style="background:#5e5ce6"></div>Component</div>
        <div class="legend-item"><div class="dot" style="background:#32ade6"></div>Hook</div>
        <div class="legend-item"><div class="dot" style="background:#ff9f0a"></div>Context</div>
        <div class="legend-item"><div class="dot" style="background:#30d158"></div>Module</div>
        <div class="legend-item"><div class="dot" style="background:#0071e3"></div>Controller</div>
        <div class="legend-item"><div class="dot" style="background:#bf5af2"></div>Service</div>
        <div class="legend-item"><div class="dot" style="background:#ff375f"></div>HTTP Caller</div>
        <div class="legend-item"><div class="dot" style="background:#aeaeb2"></div>Other</div>
      </div>
      <div class="hint">
        Scroll to zoom · Drag to pan<br/>Click node to inspect · ⌘ click deselect
      </div>
    </div>
  </div>
</div>

<script>
// ── Data ────────────────────────────────────────────────────────────────────
const FILES          = ${graphData};
const META           = ${meta};
const CYCLE_EDGE_SET = new Set(${CYCLE_EDGES});
const CYCLE_NODE_SET = new Set(${CYCLE_NODES});
const DUP_NODE_SET   = new Set(${DUPLICATE_NODES});

// ── Colors ──────────────────────────────────────────────────────────────────
const TYPE_COLOR = {
  'react-component':   '#5e5ce6',
  'react-hook':        '#32ade6',
  'react-context':     '#ff9f0a',
  'nestjs-module':     '#30d158',
  'nestjs-controller': '#0071e3',
  'nestjs-service':    '#bf5af2',
  'nestjs-guard':      '#ff6369',
  'nestjs-interceptor':'#ff9f0a',
  'nestjs-pipe':       '#34c759',
  'unknown':           '#aeaeb2',
};

const CLUSTER_LABEL = {
  'react-component':'Components','react-hook':'Hooks',
  'react-context':'Contexts','nestjs-module':'Modules',
  'nestjs-controller':'Controllers','nestjs-service':'Services',
  'nestjs-guard':'Guards','nestjs-interceptor':'Interceptors',
  'nestjs-pipe':'Pipes','unknown':'Other',
};

// ── Heatmap scales ──────────────────────────────────────────────────────────
const maxImport  = Math.max(...Object.values(FILES).map(f=>f.importedByCount),1);
const maxComplex = Math.max(...Object.values(FILES).map(f=>f.complexity||0),1);
const maxRisk    = Math.max(...Object.values(FILES).map(f=>f.riskScore||0),1);

function heat(v, max, from='#e8f0fe', mid='#fbbc04', to='#ea4335') {
  const t = Math.min(v/max,1);
  return t<.5 ? d3.interpolate(from,mid)(t*2) : d3.interpolate(mid,to)((t-.5)*2);
}

function nodeColor(d) {
  if(mode==='heatmap')    return heat(d.importedByCount, maxImport, '#e8f0fe','#fbbc04','#ea4335');
  if(mode==='complexity') return heat(d.complexity||0,  maxComplex,'#e8fdf3','#fbbc04','#ea4335');
  if(mode==='risk')       return heat(d.riskScore||0,   maxRisk,   '#f0f9ff','#fbbc04','#ea4335');
  if(CYCLE_NODE_SET.has(d.id)) return '#ff3b30';
  if(DUP_NODE_SET.has(d.id))   return '#ff9f0a';
  return d.hasQueryHook||d.httpCalls.length>0 ? '#ff375f' : (TYPE_COLOR[d.type]||'#aeaeb2');
}
function nodeStroke(d) {
  const c = d3.color(nodeColor(d));
  return c ? c.brighter(.8).formatHex() : '#fff';
}
function nodeR(d) { return Math.max(6, Math.min(24, 6 + d.importedByCount * 1.5)); }

// ── State ───────────────────────────────────────────────────────────────────
let mode='force', threshold=${minImporters}, typeFilter='', search='', showHttp=true;

// ── SVG setup ───────────────────────────────────────────────────────────────
const svg   = d3.select('#svg');
const W     = ()=>document.getElementById('canvas').clientWidth;
const H     = ()=>document.getElementById('canvas').clientHeight;
const zoomG = svg.append('g');
const zoomer= d3.zoom().scaleExtent([0.04,6]).on('zoom',e=>zoomG.attr('transform',e.transform));
svg.call(zoomer);
svg.on('click',()=>deselect());

let hullG,linkG,nodeG,sim;

// ── Build data ───────────────────────────────────────────────────────────────
function buildData(){
  const nodes=[],dep=[],http=[];
  for(const [id,d] of Object.entries(FILES)){
    const hasHttp=d.httpCalls.length>0||d.hasQueryHook;
    if(typeFilter==='alone'){
      if(d.importedByCount>0) continue;
      if(d.imports.length===0&&d.type==='unknown') continue;
    } else if(typeFilter==='cycles'){
      if(!CYCLE_NODE_SET.has(id)) continue;
    } else if(typeFilter==='duplicates'){
      if(!DUP_NODE_SET.has(id)) continue;
    } else {
      if(d.importedByCount<threshold) continue;
      if(typeFilter==='http-caller'&&!hasHttp) continue;
      if(typeFilter&&typeFilter!=='http-caller'&&d.type!==typeFilter) continue;
    }
    if(search&&!id.toLowerCase().includes(search)) continue;
    nodes.push({
      id,type:d.type,
      importedByCount:d.importedByCount,importsCount:d.imports.length,
      complexity:d.complexity||0,riskScore:d.riskScore||0,gitChurn:d.gitChurn||0,
      httpCalls:d.httpCalls,nestjsRoutes:d.nestjsRoutes,hasQueryHook:d.hasQueryHook,
      unusedExports:d.unusedExports||[],
      inCycle:CYCLE_NODE_SET.has(id),isDup:DUP_NODE_SET.has(id),
    });
  }
  const ids=new Set(nodes.map(n=>n.id));
  for(const [id,d] of Object.entries(FILES)){
    if(!ids.has(id)) continue;
    for(const imp of d.imports){
      if(ids.has(imp)) dep.push({source:id,target:imp,kind:'dep',isCycle:CYCLE_EDGE_SET.has(\`\${id}||\${imp}\`)});
    }
    if(showHttp&&d.httpCalls.length>0){
      for(const call of d.httpCalls){
        for(const [tid,td] of Object.entries(FILES)){
          if(!ids.has(tid)||tid===id) continue;
          if(td.nestjsRoutes?.some(r=>r.url===call.url||r.method===call.method))
            http.push({source:id,target:tid,kind:'http'});
        }
      }
    }
  }
  return {nodes,dep,http};
}

// ── Render ───────────────────────────────────────────────────────────────────
function render(){
  zoomG.selectAll('*').remove();
  if(sim) sim.stop();

  hullG=zoomG.append('g');
  linkG=zoomG.append('g');
  nodeG=zoomG.append('g');

  const {nodes,dep,http}=buildData();
  const all=[...dep,...http];

  document.getElementById('stat-badge').textContent=
    \`\${nodes.length} / \${META.totalFiles} files\`;

  // cluster layout
  const types=[...new Set(nodes.map(n=>n.type))];
  const cx=W()/2,cy=H()/2;
  const cc={};
  types.forEach((t,i)=>{
    const a=(2*Math.PI*i/types.length)-Math.PI/2;
    const r=Math.min(cx,cy)*.5;
    cc[t]={x:cx+r*Math.cos(a),y:cy+r*Math.sin(a)};
  });

  // links
  const lSel=linkG.selectAll('line').data(all).join('line')
    .attr('class',d=>\`link \${d.kind}\${d.isCycle?' cycle-edge':''}\`);

  // nodes
  const nSel=nodeG.selectAll('g').data(nodes,d=>d.id).join('g')
    .attr('class','node')
    .call(d3.drag()
      .on('start',(e,d)=>{if(!e.active)sim.alphaTarget(.3).restart();d.fx=d.x;d.fy=d.y})
      .on('drag', (e,d)=>{d.fx=e.x;d.fy=e.y})
      .on('end',  (e,d)=>{if(!e.active)sim.alphaTarget(0);d.fx=null;d.fy=null})
    )
    .on('click',(e,d)=>{e.stopPropagation();selectNode(d,nodes,all,lSel,nSel)});

  nSel.append('circle')
    .attr('r',nodeR)
    .attr('fill',d=>nodeColor(d))
    .attr('stroke',d=>nodeStroke(d));

  nSel.append('text')
    .attr('dy',d=>nodeR(d)+10)
    .attr('text-anchor','middle')
    .text(d=>d.id.split('/').pop());

  function updateHulls(){
    hullG.selectAll('*').remove();
    if(mode!=='cluster') return;
    const byType=d3.group(nodes,n=>n.type);
    for(const [t,grp] of byType){
      if(grp.length<2) continue;
      const pts=grp.map(n=>[n.x??0,n.y??0]);
      const hull=d3.polygonHull(pts); if(!hull) continue;
      const pad=32;
      const pcx=d3.mean(pts,p=>p[0]),pcy=d3.mean(pts,p=>p[1]);
      const padded=hull.map(([px,py])=>{
        const dx=px-pcx,dy=py-pcy,dist=Math.sqrt(dx*dx+dy*dy)||1;
        return [px+dx/dist*pad,py+dy/dist*pad];
      });
      const col=TYPE_COLOR[t]||'#aeaeb2';
      hullG.append('path').datum(padded)
        .attr('class','hull')
        .attr('fill',col+'18')
        .attr('stroke',col+'55')
        .attr('d',d=>'M'+d.join('L')+'Z');
      hullG.append('text').attr('class','cluster-label')
        .attr('x',d3.mean(pts,p=>p[0]))
        .attr('y',d3.min(pts,p=>p[1])-pad-4)
        .attr('text-anchor','middle')
        .attr('fill',col+'99')
        .text(CLUSTER_LABEL[t]||t||'Other');
    }
  }

  sim=d3.forceSimulation(nodes)
    .force('link',d3.forceLink(all).id(d=>d.id).distance(mode==='cluster'?110:80))
    .force('charge',d3.forceManyBody().strength(mode==='cluster'?-220:-110))
    .force('collision',d3.forceCollide().radius(d=>nodeR(d)+6))
    .force('center',d3.forceCenter(cx,cy));

  if(mode==='cluster'){
    sim.force('cx',d3.forceX(d=>cc[d.type]?.x??cx).strength(.22));
    sim.force('cy',d3.forceY(d=>cc[d.type]?.y??cy).strength(.22));
  }

  sim.on('tick',()=>{
    lSel.attr('x1',d=>d.source.x).attr('y1',d=>d.source.y)
        .attr('x2',d=>d.target.x).attr('y2',d=>d.target.y);
    nSel.attr('transform',d=>\`translate(\${d.x},\${d.y})\`);
    updateHulls();
  });
}

// ── Select ───────────────────────────────────────────────────────────────────
function selectNode(d,nodes,links,lSel,nSel){
  const conn=new Set([d.id]);
  links.forEach(l=>{
    const s=l.source.id??l.source,t=l.target.id??l.target;
    if(s===d.id)conn.add(t);if(t===d.id)conn.add(s);
  });
  nSel.classed('selected',n=>n.id===d.id);
  nSel.classed('dimmed',n=>!conn.has(n.id));
  nSel.classed('hi',n=>conn.has(n.id)&&n.id!==d.id);
  lSel.classed('highlighted',l=>(l.source.id??l.source)===d.id||(l.target.id??l.target)===d.id);

  const raw=FILES[d.id];
  document.getElementById('detail-empty').style.display='none';
  const panel=document.getElementById('detail-panel');
  panel.style.display='flex';

  // file
  document.getElementById('d-file').textContent=d.id;

  // type badge
  const badge=document.getElementById('d-type');
  const col=TYPE_COLOR[d.type]||'#aeaeb2';
  badge.textContent=d.type.replace('react-','').replace('nestjs-','');
  badge.style.cssText=\`background:\${col}18;color:\${col};border:1px solid \${col}44\`;

  // metrics
  document.getElementById('m-complexity').textContent=d.complexity??'–';
  document.getElementById('m-risk').textContent=d.riskScore>0?d.riskScore:'–';
  document.getElementById('m-churn').textContent=d.gitChurn>0?d.gitChurn:'–';

  // flags
  const flagsEl=document.getElementById('d-flags');
  const flagsSec=document.getElementById('flags-section');
  flagsEl.innerHTML='';
  const flags=[];
  if(d.inCycle)    flags.push({icon:'🔴',label:'Part of circular dependency',bg:'#fff1f0',color:'#ff3b30'});
  if(d.isDup)      flags.push({icon:'🔁',label:'Duplicate filename',bg:'#fff8ed',color:'#ff9f0a'});
  if(d.unusedExports?.length) flags.push({icon:'🗑',label:\`\${d.unusedExports.length} unused export(s)\`,bg:'#f5f5f7',color:'#6e6e73'});
  if(d.hasQueryHook||d.httpCalls.length>0) flags.push({icon:'🌐',label:'Makes HTTP calls',bg:'#f0fdf4',color:'#30d158'});
  if(d.importedByCount===0&&d.type!=='unknown') flags.push({icon:'⚠️',label:'Not imported anywhere',bg:'#fff8ed',color:'#ff9f0a'});
  flags.forEach(f=>{
    const div=document.createElement('div');
    div.className='flag-item';
    div.style.cssText=\`background:\${f.bg};color:\${f.color}\`;
    div.innerHTML=\`<span>\${f.icon}</span><span style="font-size:11px">\${f.label}</span>\`;
    flagsEl.appendChild(div);
  });
  flagsSec.style.display=flags.length?'':'none';

  // imports
  document.getElementById('d-by-count').textContent=d.importedByCount;
  document.getElementById('d-imports-count').textContent=d.importsCount;
  const importedBy=links.filter(l=>(l.target.id??l.target)===d.id&&l.kind==='dep').map(l=>l.source.id??l.source);
  const imports   =links.filter(l=>(l.source.id??l.source)===d.id&&l.kind==='dep').map(l=>l.target.id??l.target);
  renderFileList('d-imported-by',importedBy,nodes,links,lSel,nSel);
  renderFileList('d-imports',    imports,   nodes,links,lSel,nSel);

  // HTTP calls
  const httpSec=document.getElementById('http-section');
  const httpEl =document.getElementById('d-http');
  const calls=raw?.httpCalls||[];
  if(calls.length>0||raw?.hasQueryHook){
    httpSec.style.display='';
    httpEl.innerHTML='';
    if(raw?.hasQueryHook){
      const r=document.createElement('div');r.className='http-row';
      r.innerHTML='<span class="method-pill QUERY">QUERY</span><span class="http-url">useQuery / useMutation</span>';
      httpEl.appendChild(r);
    }
    calls.forEach(c=>{
      const r=document.createElement('div');r.className='http-row';
      r.innerHTML=\`<span class="method-pill \${c.method}">\${c.method}</span><span class="http-url" title="\${c.url}">\${c.url}</span>\`;
      httpEl.appendChild(r);
    });
  } else httpSec.style.display='none';

  // NestJS routes
  const routeSec=document.getElementById('routes-section');
  const routeEl =document.getElementById('d-routes');
  const routes=raw?.nestjsRoutes||[];
  if(routes.length>0){
    routeSec.style.display='';
    routeEl.innerHTML='';
    routes.forEach(r=>{
      const el=document.createElement('div');el.className='http-row';
      el.innerHTML=\`<span class="method-pill \${r.method}">\${r.method}</span><span class="http-url">\${r.url}</span>\`;
      routeEl.appendChild(el);
    });
  } else routeSec.style.display='none';
}

function renderFileList(id,files,nodes,links,lSel,nSel){
  const el=document.getElementById(id);
  el.innerHTML='';
  if(!files.length){el.innerHTML='<span style="color:var(--text-3);font-size:11px;padding:2px 7px">none</span>';return;}
  files.forEach(f=>{
    const div=document.createElement('div');
    div.className='file-item';div.title=f;
    div.textContent=f.split('/').slice(-2).join('/');
    div.onclick=()=>{const n=nodes.find(n=>n.id===f);if(n)selectNode(n,nodes,links,lSel,nSel)};
    el.appendChild(div);
  });
}

function deselect(){
  if(nodeG) nodeG.selectAll('.node').classed('selected dimmed hi',false);
  if(linkG) linkG.selectAll('.link').classed('highlighted',false);
  document.getElementById('detail-empty').style.display='block';
  document.getElementById('detail-panel').style.display='none';
}

// ── Badge counts ─────────────────────────────────────────────────────────────
const aloneCount=Object.entries(FILES).filter(([,d])=>
  d.importedByCount===0&&!(d.imports.length===0&&d.type==='unknown')).length;
document.querySelector('[data-filter="alone"]').textContent=\`Alone (\${aloneCount})\`;
document.querySelector('[data-filter="cycles"]').textContent=\`Cycles (\${META.cycleCount})\`;
document.querySelector('[data-filter="duplicates"]').textContent=\`Duplicates (\${META.duplicateCount})\`;

// ── Controls ─────────────────────────────────────────────────────────────────
document.querySelectorAll('.pill-btn').forEach(b=>b.addEventListener('click',()=>{
  mode=b.dataset.mode;
  document.querySelectorAll('.pill-btn').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  render();
}));
document.querySelectorAll('.chip').forEach(b=>b.addEventListener('click',()=>{
  typeFilter=b.dataset.filter;
  document.querySelectorAll('.chip').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  document.getElementById('threshold').disabled=typeFilter==='alone'||typeFilter==='cycles'||typeFilter==='duplicates';
  render();
}));
document.getElementById('search').addEventListener('input',e=>{search=e.target.value.trim().toLowerCase();render()});
document.getElementById('threshold').addEventListener('change',e=>{threshold=parseInt(e.target.value)||0;render()});
document.getElementById('show-http').addEventListener('change',e=>{showHttp=e.target.checked;render()});
window.addEventListener('resize',()=>{if(sim)sim.force('center',d3.forceCenter(W()/2,H()/2)).alpha(.1).restart()});

render();
</script>
</body>
</html>`;
}
