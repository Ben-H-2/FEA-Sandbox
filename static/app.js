const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const NODE_RADIUS = 3;
const NODE_SELECTION_RADIUS = 16;
const ELEMENT_SELECTION_RADIUS = 16;
const LOGICAL_WIDTH = 900;
const LOGICAL_HEIGHT = 600;
const REFINE_WARNING_THRESHOLD = 5;
const warningOverlay = document.getElementById("warning-modal-overlay");
const dontShowAgainCheckbox = document.getElementById("warning-dont-show-again");
const PERSIST_DONT_SHOW_AGAIN = false;
const MIN_SOLVE_SAMPLES = 4;
const LEGEND_TICK_COUNT = 6;
const SHOW_HOVER_TOOLTIP = true;
const MATERIAL_FILL_ALPHA = 0.3;
const GRID_SPACING = 20;
const NODE_SNAP_RADIUS = 10;
const EDGE_SNAP_RADIUS = 8;
const GRID_SNAP_RADIUS = 10;
const GRID_COLOUR = "rgba(0,0,0,0.08)";
const NODE_DEFAULT_COLOUR = "#3b9dd9";
const NODE_FIXED_COLOUR = "#16a34a";
const NODE_FORCE_COLOUR = "#f59e0b";
const NODE_SELECTED_RING = "#1a1c1f";
const NODE_SELECTED_RING_SIZE = 1.5;
const EDGE_DEFAULT_COLOUR = "#374151";
const EDGE_FIXED_COLOUR = "#16a34a";
const EDGE_FORCE_COLOUR = "#f59e0b";
const SNAP_MARKER_COLOUR = "#44aa99";
const REGION_COLOUR = "#7c3aed";
const HOLE_COLOUR = "#ef4444";

let nodes = []; 
let elements = []; 
let nextNodeId = 0;
let mode = "node";
let gridEnabled = true;
let snapEnabled = true;
let lastSnapPoint = null; 
let materials = {};
let currentMaterial = "steel";
let selectedNodeIds = [];
let showStress = false;
let showDeformed = false;
let showOutlines = false;
let lastResult = null;
let editingNode = null; 
let editingEdge = null;
let editingElement = null;
let edgeRules = [];
let currentPolygonPoints = [];
let polygonShapes = [];
let polygonShapeType = "region";
let scale = 1;
let deformationScale = 50;
let stressScaleMode = "linear";

function updateModeButtons() {
    const nodeButton = document.getElementById("mode-node");
    const triangleButton = document.getElementById("mode-triangle");
    const rectangleButton = document.getElementById("mode-rectangle")
    const automeshButton = document.getElementById("mode-automesh")

    if (nodeButton) {
        nodeButton.classList.toggle("active", mode === "node");
    }
    if (triangleButton) {
        triangleButton.classList.toggle("active", mode === "triangle");
    }
    if (rectangleButton) {
        rectangleButton.classList.toggle("active", mode == "rectangle")
    }
    if (automeshButton){
        automeshButton.classList.toggle("active", mode == "automesh")
    }
}

function setMode(newMode) { 
    selectedNodeIds = []
    mode = newMode;
    if (mode == "automesh"){
        currentPolygonPoints = []
    }
    draw()
    updateModeButtons();
}

function syncToggleButton(buttonId, isActive) {
    const btn = document.getElementById(buttonId);
    if (btn) {
        btn.classList.toggle("active", isActive);
    }
}

function syncShapeTypeBadge() {
    const badge = document.getElementById("shape-type-badge");
    if (badge) {
        badge.textContent = polygonShapeType === "region" ? "Region" : "Hole";
    }
}

const gridButton = document.getElementById("toggle-grid-btn");
const snapButton = document.getElementById("toggle-snap-btn");
if (gridButton) {
    gridButton.onclick = () => {
        gridEnabled = !gridEnabled;
        syncToggleButton("toggle-grid-btn", gridEnabled);
        draw();
    };
}
if (snapButton) {
    syncToggleButton("toggle-grid-btn", gridEnabled);
    syncToggleButton("toggle-snap-btn", snapEnabled);
    snapButton.onclick = () => {
        snapEnabled = !snapEnabled;
        syncToggleButton("toggle-snap-btn", snapEnabled);
        draw();
    };
}

const nodeButton = document.getElementById("mode-node");
const triangleButton = document.getElementById("mode-triangle");
const rectangleButton = document.getElementById("mode-rectangle")
const automeshButton = document.getElementById("mode-automesh")

if (nodeButton) {
    nodeButton.onclick = () => setMode("node");
}
if (triangleButton) {
    triangleButton.onclick = () => setMode("triangle");
}
if (rectangleButton) {
    rectangleButton.onclick = () => setMode("rectangle")
}
if (automeshButton) {
    automeshButton.onclick = () => setMode("automesh");
}
updateModeButtons();

function hexToRgba(hex, alpha) {
    const h = hex.replace("#", "");
    const r = parseInt(h.substring(0, 2), 16);
    const g = parseInt(h.substring(2, 4), 16);
    const b = parseInt(h.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function populateMaterialOptions(selectEl, selectedValue) {
    selectEl.innerHTML = "";
    for (const name of Object.keys(materials)) {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name.charAt(0).toUpperCase() + name.slice(1);
        selectEl.appendChild(opt);
    }
    selectEl.value = selectedValue;
}

async function loadMaterials() {
    try {
        const response = await fetch("/materials");
        materials = await response.json();
    } catch (err) {
        console.error("Failed to load materials, falling back to steel only:", err);
        materials = { steel: { E: 200e9, nu: 0.30 } };
    }
    const select = document.getElementById("material-select");
    if (!select) return;
    populateMaterialOptions(select, currentMaterial);
}

loadMaterials();

const materialSelect = document.getElementById("material-select");
if (materialSelect) {
    materialSelect.onchange = () => {
        currentMaterial = materialSelect.value;
    };
}

function resizeCanvas() {
    const availableWidth = window.innerWidth;
    const availableHeight = window.innerHeight;
    scale = Math.min(availableWidth / LOGICAL_WIDTH, availableHeight / LOGICAL_HEIGHT);
    canvas.width = availableWidth;
    canvas.height = availableHeight;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    draw();
}

window.addEventListener("resize", resizeCanvas);
resizeCanvas();

window.addEventListener("beforeunload", saveMeshSnapshot);

window.addEventListener("load", () => {
    const snapshot = loadMeshSnapshot();
    if (snapshot && snapshot.nodes.length > 0 && nodes.length === 0) {
        const restore = confirm("A mesh from your last session was found (possibly from a crash). Restore it?");
        if (restore) {
            nodes = snapshot.nodes;
            elements = snapshot.elements;
            edgeRules = snapshot.edgeRules;
            nextNodeId = snapshot.nextNodeId;
            polygonShapes = snapshot.polygonShapes || [];
            draw();
        }
    }
});

function findNodeNear(x, y, radius = NODE_SELECTION_RADIUS) { 
    for (const node of nodes) { 
        const dx = node.x - x;
        const dy = node.y - y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= radius) {
            return node;
        }
    }
    return null;   
}

function findEdgeNear(x, y, radius = NODE_SELECTION_RADIUS) {
    let closestEdge = null;
    let closestDist = radius;

    for (const el of elements) {
        const ids = el.node_ids;
        const edgePairs = [
            [ids[0], ids[1]],
            [ids[1], ids[2]],
            [ids[2], ids[0]]
        ];

        for (const [idA, idB] of edgePairs) {
            const a = nodes.find(n => n.id === idA);
            const b = nodes.find(n => n.id === idB);
            if (!a || !b) continue;

            const dist = pointToSegmentDistance(x, y, a.x, a.y, b.x, b.y);
            if (dist <= closestDist) {
                closestDist = dist;
                const a = Math.min(idA, idB);
                const b = Math.max(idA, idB);

                closestEdge = {
                    node_a_id: a,
                    node_b_id: b
                };  
            }
        }
    }

    return closestEdge;
}

function findElementNear(x, y) {
    for (const el of elements) {
        if (el.type !== "triangle") continue;
        const [a, b, c] = el.node_ids.map(id => nodes.find(n => n.id === id));
        if (!a || !b || !c) continue;

        const denom = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
        if (denom === 0) continue;
        const w1 = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / denom;
        const w2 = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / denom;
        const w3 = 1 - w1 - w2;

        if (w1 >= 0 && w2 >= 0 && w3 >= 0) return el;
    }
    return null;
}

function distToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx, cy = ay + t * dy;
    return { dist: Math.hypot(px - cx, py - cy), x: cx, y: cy };
}

function findNearestEdgePoint(x, y, radius) {
    let best = null;
    for (const el of elements) {
        const pts = el.node_ids.map(id => nodes.find(n => n.id === id)).filter(Boolean);
        for (let i = 0; i < pts.length; i++) {
            const a = pts[i], b = pts[(i + 1) % pts.length];
            const hit = distToSegment(x, y, a.x, a.y, b.x, b.y);
            if (hit.dist <= radius && (!best || hit.dist < best.dist)) {
                best = { dist: hit.dist, x: hit.x, y: hit.y };
            }
        }
    }
    return best;
}

function findNearestGridPoint(x, y, radius) {
    const gx = Math.round(x / GRID_SPACING) * GRID_SPACING;
    const gy = Math.round(y / GRID_SPACING) * GRID_SPACING;
    const dist = Math.hypot(x - gx, y - gy);
    return dist <= radius ? { dist, x: gx, y: gy } : null;
}

function getSnapPoint(x, y) {
    if (!snapEnabled) return { x, y, node: null };

    const node = findNodeNear(x, y, NODE_SNAP_RADIUS);
    if (node) return { x: node.x, y: node.y, node };

    const edgeHit = findNearestEdgePoint(x, y, EDGE_SNAP_RADIUS);
    if (edgeHit) return { x: edgeHit.x, y: edgeHit.y, node: null };

    if (gridEnabled) {
        const gridHit = findNearestGridPoint(x, y, GRID_SNAP_RADIUS);
        if (gridHit) return { x: gridHit.x, y: gridHit.y, node: null };
    }

    return { x, y, node: null };
}

function pointToSegmentDistance(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;

    if (lengthSq === 0) {
        const ddx = px - ax, ddy = py - ay;
        return Math.sqrt(ddx * ddx + ddy * ddy);
    }

    let t = ((px - ax) * dx + (py - ay) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));

    const closestX = ax + t * dx;
    const closestY = ay + t * dy;

    const ddx = px - closestX;
    const ddy = py - closestY;
    return Math.sqrt(ddx * ddx + ddy * ddy);
}

function getEffectiveNodeState(nodeId) {
    let isFixedX = false, isFixedY = false;
    let forceX = 0, forceY = 0;

    for (const rule of edgeRules) {
        if (rule.node_a_id !== nodeId && rule.node_b_id !== nodeId) continue;

        if (rule.type === "fix") {
            if (rule.fix_x) isFixedX = true;
            if (rule.fix_y) isFixedY = true;
        } else if (rule.type === "force") {
            forceX += rule.force_x;
            forceY += rule.force_y;
        }
    }

    return { isFixedX, isFixedY, forceX, forceY };
}

function getEdgeRuleForElementEdge(idA, idB) {
    const a = Math.min(idA, idB);
    const b = Math.max(idA, idB);
    return edgeRules.find(r => r.node_a_id === a && r.node_b_id === b);
}

function pointsCoincide(p1, p2, epsilon = 1e-6) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.sqrt(dx * dx + dy * dy) <= epsilon;
}

function pointInTriangle(px, py, ax, ay, bx, by, cx, cy) {
    const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
    const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
    const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);

    const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
    const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);

    return !(hasNeg && hasPos);
}

function pointInPolygon(px, py, polygon) {
    let counter = 0
    for (let i = 0; i < polygon.length; i++){
        const currentCoord = polygon[i];
        const nextCoord = polygon[(i+1)%polygon.length];
        if (!((py>currentCoord.y && py>nextCoord.y) || (py<currentCoord.y && py<nextCoord.y))){
            const t = (py - currentCoord.y) / (nextCoord.y - currentCoord.y);
            const x_crossing = currentCoord.x + t * (nextCoord.x - currentCoord.x);
            if (x_crossing > px){
                counter++;
            }
        }
    }
    return (counter%2 == 1);
}

function findBoundingBox(polygon){
    let max_x= polygon[0].x;
    let min_x= polygon[0].x;
    let max_y= polygon[0].y;
    let min_y= polygon[0].y;
    for (let i = 0; i<polygon.length; i++){
        if (polygon[i].x > max_x){
            max_x = polygon[i].x;
        }
        if (polygon[i].x < min_x){
            min_x = polygon[i].x;
        }
        if (polygon[i].y > max_y){
            max_y = polygon[i].y;
        }
        if (polygon[i].y < min_y){
            min_y = polygon[i].y;
        }
        
    }
    return {min_x,max_x,min_y,max_y};
}

function boxesOverlap(boxA, boxB, BoundsA = null){
    const boxAbounds = BoundsA || findBoundingBox(boxA);
    const boxBbounds = findBoundingBox(boxB);
    if ((boxAbounds.min_x<boxBbounds.max_x) && (boxAbounds.min_y<boxBbounds.max_y) && (boxBbounds.min_x<boxAbounds.max_x) && (boxBbounds.min_y<boxAbounds.max_y)){
        return true
    }
    return false
}

function segmentsIntersect(A,B,C,D){
    const AB = {x: (A.x-B.x),y: (A.y-B.y)};
    const CD = {x: (C.x-D.x),y: (C.y-D.y)};
    const AC = {x: (A.x-C.x),y: (A.y-C.y)};
    const AD = {x: (A.x-D.x),y: (A.y-D.y)};
    const CA = {x: (C.x-A.x),y: (C.y-A.y)};
    const CB = {x: (C.x-B.x),y: (C.y-B.y)};

    const crossprodABAC = (AB.x*AC.y)-(AC.x*AB.y);
    const crossprodABAD = (AB.x*AD.y)-(AD.x*AB.y);

    const crossprodCDCA = (CD.x*CA.y)-(CA.x*CD.y);
    const crossprodCDCB = (CD.x*CB.y)-(CB.x*CD.y);

    if ((Math.sign(crossprodABAC) !== Math.sign(crossprodABAD)) && (Math.sign(crossprodCDCA) !== Math.sign(crossprodCDCB))){
        
        // TODO: currently blocks T-junction/hanging-node cases (vertex touching
        // another element's edge without matching a vertex) same as real overlap.
        // Once splitElement() function exists, handle by auto-splitting the
        // element instead of blocking placement outright.

        return true
    }
    else{
        return false
    }
}

function trianglesShareEdgeWithoutOverlap(triangle1, triangle2) {
    const shared = triangle1.filter(id => triangle2.includes(id));

    if (shared.length !== 2) {
        return false;
    }
    const third1 = triangle1.find(id => !shared.includes(id));
    const third2 = triangle2.find(id => !shared.includes(id));

    const a = nodes.find(n => n.id === shared[0]);
    const b = nodes.find(n => n.id === shared[1]);
    const p = nodes.find(n => n.id === third1);
    const q = nodes.find(n => n.id === third2);

    const side1 =
        (b.x - a.x) * (p.y - a.y) -
        (b.y - a.y) * (p.x - a.x);
    const side2 =
        (b.x - a.x) * (q.y - a.y) -
        (b.y - a.y) * (q.x - a.x);
    return side1 * side2 < 0;
}

function polygonsOverlap(polygona,polygonb,onlyedges = false, BoundsA = null){
    if (boxesOverlap(polygona,polygonb, BoundsA) == false){
        return false
    }
    for (let edge = 0; edge<polygona.length; edge++){
        for (let edge2 = 0; edge2<polygonb.length; edge2++){
            let intersect = segmentsIntersect(polygona[edge],polygona[(edge+1)%polygona.length],polygonb[edge2],polygonb[(edge2+1)%polygonb.length])
            if (intersect == true){
                return true
            }
        }
    }
    if (onlyedges == true) {
        return false;
    }

    const aTouchesB = polygonb.some(v => pointsCoincide(polygona[0], v));
    const bTouchesA = polygona.some(v => pointsCoincide(polygonb[0], v));

    if (!aTouchesB && pointInPolygon(polygona[0].x, polygona[0].y, polygonb)) {
        return true;
    }
    if (!bTouchesA && pointInPolygon(polygonb[0].x, polygonb[0].y, polygona)) {
        return true;
    }
    return false;
}

function findResultElementAt(x, y) {
    if (!lastResult) return null;
    const nodeById = new Map(lastResult.nodes.map(n => [n.id, n]));

    for (let i = 0; i < lastResult.elements.length; i++) {
        const [idA, idB, idC] = lastResult.elements[i].node_ids;
        const a = nodeById.get(idA), b = nodeById.get(idB), c = nodeById.get(idC);
        if (!a || !b || !c) continue;

        const pa = showDeformed
            ? {x: a.posx + lastResult.displacements[idA*2]*deformationScale, y: a.posy + lastResult.displacements[idA*2+1]*deformationScale}
            : {x: a.posx, y: a.posy};
        const pb = showDeformed
            ? {x: b.posx + lastResult.displacements[idB*2]*deformationScale, y: b.posy + lastResult.displacements[idB*2+1]*deformationScale}
            : {x: b.posx, y: b.posy};
        const pc = showDeformed
            ? {x: c.posx + lastResult.displacements[idC*2]*deformationScale, y: c.posy + lastResult.displacements[idC*2+1]*deformationScale}
            : {x: c.posx, y: c.posy};

        if (pointInTriangle(x, y, pa.x, pa.y, pb.x, pb.y, pc.x, pc.y)) {
            return { index: i, stress: lastResult.von_mises[i] };
        }
    }
    return null;
}

function findArticulationNodes() {
    const adjacency = new Map();
    const addEdge = (a, b) => {
        if (!adjacency.has(a)) adjacency.set(a, new Set());
        if (!adjacency.has(b)) adjacency.set(b, new Set());
        adjacency.get(a).add(b);
        adjacency.get(b).add(a);
    };

    elements.forEach(el => {
        const [a, b, c] = el.node_ids;
        addEdge(a, b);
        addEdge(b, c);
        addEdge(c, a);
    });

    const visited = new Set();
    const disc = new Map();
    const low = new Map();
    const articulation = new Set();
    let timer = 0;

    function dfs(u, parent) {
        visited.add(u);
        disc.set(u, timer);
        low.set(u, timer);
        timer++;
        let children = 0;

        for (const v of adjacency.get(u) || []) {
            if (v === parent) continue;
            if (visited.has(v)) {
                low.set(u, Math.min(low.get(u), disc.get(v)));
            } else {
                children++;
                dfs(v, u);
                low.set(u, Math.min(low.get(u), low.get(v)));
                if (parent !== null && low.get(v) >= disc.get(u)) {
                    articulation.add(u);
                }
            }
        }
        if (parent === null && children > 1) {
            articulation.add(u);
        }
    }

    for (const nodeId of adjacency.keys()) {
        if (!visited.has(nodeId)) {
            dfs(nodeId, null);
        }
    }

    return articulation;
}

function checkStructuralWarnings() {
    const warnings = [];

    const usedNodeIds = new Set(elements.flatMap(el => el.node_ids));
    const usedNodes = nodes.filter(n => usedNodeIds.has(n.id));

    const hasAnyFix = usedNodes.some(n => {
        const effective = getEffectiveNodeState(n.id);
        return n.is_fixed_x || n.is_fixed_y || effective.isFixedX || effective.isFixedY;
    });

    if (!hasAnyFix) {
        warnings.push("No nodes are fixed. The structure has nothing holding it in place and may translate or rotate freely instead of producing meaningful stress results.");
    }

    const articulationNodes = findArticulationNodes();
    if (articulationNodes.size > 0) {
        warnings.push(`${articulationNodes.size} node(s) connect otherwise separate parts of the mesh through a single point. These act like hinges and may let the structure rotate or fly apart unrealistically unless properly constrained.`);
    }

    return warnings;
}

function stresscolour(value, maxValue, minValue = 0) {
    let t;
    if (stressScaleMode === "log") {
        const safeMin = minValue > 0 ? minValue : (maxValue > 0 ? maxValue * 1e-6 : 1e-6);
        const safeMax = maxValue > safeMin ? maxValue : safeMin * 10;
        const safeValue = value > safeMin ? value : safeMin;
        const logMin = Math.log(safeMin);
        const logMax = Math.log(safeMax);
        t = logMax > logMin ? (Math.log(safeValue) - logMin) / (logMax - logMin) : 0;
    } else {
        t = maxValue > 0 ? value / maxValue : 0;
    }
    t = Math.max(0, Math.min(1, t));
    const r = Math.floor(255 * t);
    const b = Math.floor(255 * (1 - t));
    return `rgb(${r}, 0, ${b})`;
}

function formatStressValue(v) {
    if (v === 0) return "0";
    const abs = Math.abs(v);
    if (abs >= 100000 || abs < 0.01) return v.toExponential(2);
    return v.toFixed(2);
}

function valueAtFraction(frac, maxStress, minStress) {
    if (stressScaleMode === "log") {
        const safeMin = minStress > 0 ? minStress : (maxStress > 0 ? maxStress * 1e-6 : 1e-6);
        const safeMax = maxStress > safeMin ? maxStress : safeMin * 10;
        const logMin = Math.log(safeMin);
        const logMax = Math.log(safeMax);
        return Math.exp(logMin + frac * (logMax - logMin));
    }
    return frac * maxStress;
}

function updateStressLegend(maxStress, minStress) {
    const legend = document.getElementById("stress-legend");
    const canvas = document.getElementById("legend-bar-canvas");
    const ticksContainer = document.getElementById("legend-ticks");
    if (!legend || !canvas) return;

    legend.style.display = "block";

    const barCtx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;

    for (let px = 0; px < width; px++) {
        const frac = px / (width - 1);
        const value = valueAtFraction(frac, maxStress, minStress);
        barCtx.fillStyle = stresscolour(value, maxStress, minStress);
        barCtx.fillRect(px, 0, 1, height);
    }

    ticksContainer.innerHTML = "";
    for (let i = 0; i < LEGEND_TICK_COUNT; i++) {
        const frac = i / (LEGEND_TICK_COUNT - 1);
        const value = valueAtFraction(frac, maxStress, minStress);

        const tick = document.createElement("span");
        tick.textContent = formatStressValue(value);
        tick.style.position = "absolute";
        tick.style.left = `${frac * 100}%`;
        tick.style.transform = frac === 0 ? "translateX(0%)" : (frac === 1 ? "translateX(-100%)" : "translateX(-50%)");
        tick.style.whiteSpace = "nowrap";
        ticksContainer.appendChild(tick);
    }
}

function hideStressLegend() {
    const legend = document.getElementById("stress-legend");
    if (legend) legend.style.display = "none";
}

function drawResultMesh() { 
    const resultNodes = lastResult.nodes; 
    const resultElements = lastResult.elements; 
    const vonMises = lastResult.von_mises;
    const displacements = lastResult.displacements; 

    const maxStress = Math.max(...vonMises);
    const positiveStresses = vonMises.filter(v => v > 0);
    const minStress = positiveStresses.length ? Math.min(...positiveStresses) : 0;
    updateStressLegend(maxStress, minStress);

    const nodeById = new Map(resultNodes.map(n => [n.id, n]));

    resultElements.forEach((el, i) => {
        const [idA, idB, idC] = el.node_ids;
        const a = nodeById.get(idA);
        const b = nodeById.get(idB);
        const c = nodeById.get(idC);
        if (!a || !b || !c) return;

        const posA = showDeformed
            ? {x: a.posx + displacements[idA * 2] * deformationScale, y: a.posy + displacements[idA * 2 + 1] * deformationScale}
            : {x: a.posx, y: a.posy};
        const posB = showDeformed
            ? {x: b.posx + displacements[idB * 2] * deformationScale, y: b.posy + displacements[idB * 2 + 1] * deformationScale}
            : {x: b.posx, y: b.posy};
        const posC = showDeformed
            ? {x: c.posx + displacements[idC * 2] * deformationScale, y: c.posy + displacements[idC * 2 + 1] * deformationScale}
            : {x: c.posx, y: c.posy};

        ctx.beginPath();
        ctx.moveTo(posA.x, posA.y);
        ctx.lineTo(posB.x, posB.y);
        ctx.lineTo(posC.x, posC.y);
        ctx.closePath();

        ctx.fillStyle = stresscolour(vonMises[i], maxStress, minStress);
    ctx.fill();

    ctx.lineJoin = "round";
    if (showOutlines) {
        ctx.strokeStyle = EDGE_DEFAULT_COLOUR;
        ctx.lineWidth = 1;
        ctx.stroke();
    } else {
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }
    });
    resultNodes.forEach((n) => {
        const x = showDeformed ? n.posx + displacements[n.id * 2] * deformationScale : n.posx;
        const y = showDeformed ? n.posy + displacements[n.id * 2 + 1] * deformationScale : n.posy;
        if (showOutlines) {
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fillStyle = EDGE_DEFAULT_COLOUR;
            ctx.fill();
        }
    });
}

function drawEditableMesh() { 
    elements.forEach((el, i) => {
        const [idA, idB, idC] = el.node_ids;
        const a = nodes.find(n => n.id === idA);
        const b = nodes.find(n => n.id === idB);
        const c = nodes.find(n => n.id === idC);
        if (!a || !b || !c) return;

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.lineTo(c.x, c.y);
        ctx.closePath();
        const matColour = materials[el.material]?.colour;
        ctx.fillStyle = matColour ? hexToRgba(matColour, MATERIAL_FILL_ALPHA) : "rgba(0,0,0,0.06)";
        ctx.fill();

        const edges = [[a, b, idA, idB], [b, c, idB, idC], [c, a, idC, idA]];

        for (const [p1, p2, ea, eb] of edges) {
            const rule = getEdgeRuleForElementEdge(ea, eb);

            let strokeStyle = EDGE_DEFAULT_COLOUR;
            if (rule) {
                if (rule.type === "fix" && (rule.fix_x || rule.fix_y)) {
                    strokeStyle = EDGE_FIXED_COLOUR;
                } else if (rule.type === "force" && (rule.force_x !== 0 || rule.force_y !== 0)) {
                    strokeStyle = EDGE_FORCE_COLOUR;
                }
            }

            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = strokeStyle;
            ctx.lineWidth = strokeStyle === EDGE_DEFAULT_COLOUR ? 1 : 2.5;
            ctx.stroke();
        }
    });

    nodes.forEach(node => {
        const isSelected = selectedNodeIds.includes(node.id);
        const radius = isSelected ? NODE_RADIUS + NODE_SELECTED_RING_SIZE : NODE_RADIUS;

        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        const effective = getEffectiveNodeState(node.id);
        const isFixed = node.is_fixed_x || node.is_fixed_y || effective.isFixedX || effective.isFixedY;
        const hasForce = node.force_x !== 0 || node.force_y !== 0 || effective.forceX !== 0 || effective.forceY !== 0;

        if (isFixed) {
            ctx.fillStyle = NODE_FIXED_COLOUR;
        } else if (hasForce) {
            ctx.fillStyle = NODE_FORCE_COLOUR;
        } else {
            ctx.fillStyle = NODE_DEFAULT_COLOUR;
        }
        ctx.fill();

        if (isSelected) {
            ctx.beginPath();
            ctx.arc(node.x, node.y, radius + NODE_SELECTED_RING_SIZE, 0, Math.PI * 2);
            ctx.strokeStyle = NODE_SELECTED_RING;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    });
}

function drawGrid() {
    if (!gridEnabled) return;
    ctx.strokeStyle = GRID_COLOUR;
    ctx.lineWidth = 1;
    for (let x = 0; x <= LOGICAL_WIDTH; x += GRID_SPACING) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, LOGICAL_HEIGHT);
        ctx.stroke();
    }
    for (let y = 0; y <= LOGICAL_HEIGHT; y += GRID_SPACING) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(LOGICAL_WIDTH, y);
        ctx.stroke();
    }
}

function drawPolygons() {
    polygonShapes.forEach(shape => {
        ctx.beginPath();
        ctx.moveTo(shape.boundary[0].x, shape.boundary[0].y);
        for (let i = 1; i < shape.boundary.length; i++) {
            ctx.lineTo(shape.boundary[i].x, shape.boundary[i].y);
        }
        ctx.closePath();
        const colour = shape.type === "region" ? REGION_COLOUR : HOLE_COLOUR;
        ctx.fillStyle = hexToRgba(colour, 0.15);
        ctx.fill();
        ctx.strokeStyle = colour;
        ctx.lineWidth = 2;
        ctx.stroke();
    });

    if (mode !== "automesh") return;
    if (currentPolygonPoints.length > 0) {
        ctx.beginPath();
        ctx.moveTo(currentPolygonPoints[0].x, currentPolygonPoints[0].y);
        for (let i = 1; i < currentPolygonPoints.length; i++) {
            ctx.lineTo(currentPolygonPoints[i].x, currentPolygonPoints[i].y);
        }
        ctx.strokeStyle = polygonShapeType === "region" ? REGION_COLOUR : HOLE_COLOUR;
        ctx.lineWidth = 2;
        ctx.stroke();

        currentPolygonPoints.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.fillStyle = polygonShapeType === "region" ? REGION_COLOUR : HOLE_COLOUR;
            ctx.fill();
        });
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid()
    if (showStress && lastResult) {
        drawResultMesh(); 
    } else {
        hideStressLegend();
        drawEditableMesh(); 
        drawPolygons();
    }
}

canvas.addEventListener("mousemove", (e) => {
    const x = e.offsetX / scale, y = e.offsetY / scale;
    lastSnapPoint = getSnapPoint(x,y)
    const coordBox = document.getElementById("mouse-coords");
    if (coordBox) {
        coordBox.textContent = `X: ${x.toFixed(1)}, Y: ${(LOGICAL_HEIGHT-y).toFixed(1)}`;
    }
    draw();
    if (snapEnabled) {
        ctx.beginPath();
        ctx.arc(lastSnapPoint.x, lastSnapPoint.y, 5, 0, Math.PI * 2);
        ctx.strokeStyle = SNAP_MARKER_COLOUR;
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    const tooltip = document.getElementById("stress-tooltip");
    if (!tooltip) return;

    if (SHOW_HOVER_TOOLTIP && showStress && lastResult) {
        const hit = findResultElementAt(x, y);
        if (hit) {
            tooltip.textContent = `Stress: ${formatStressValue(hit.stress)} Pa`;
            tooltip.style.left = (e.clientX + 14) + "px";
            tooltip.style.top = (e.clientY + 14) + "px";
            tooltip.style.display = "block";
            return;
        }
    }
    tooltip.style.display = "none";
});

document.getElementById("add-node-btn").onclick = () => {
    const xInput = document.getElementById("add-node-x");
    const yInput = document.getElementById("add-node-y");
    const x = parseFloat(xInput.value);
    const y = LOGICAL_HEIGHT - parseFloat(yInput.value);

    if (isNaN(x) || isNaN(y)) {
        alert("Enter valid X and Y coordinates.");
        return;
    }

    showStress = false;
    nodes.push({
        id: nextNodeId++,
        x: x, y: y,
        force_x: 0, force_y: 0,
        is_fixed_x: false, is_fixed_y: false
    });
    draw();
};

document.getElementById("generate-mesh-btn").onclick = async () => {
    if (currentPolygonPoints.length > 0) {
        alert("Finish or cancel the current polygon before generating a mesh");
        return;
    }
    const regions = polygonShapes.filter(s => s.type === "region");
    const holes = polygonShapes.filter(s => s.type === "hole");
    if (regions.length === 0) {
        alert("Draw at least one region");
        return;
    }
    const payload = {
        regions: regions.map(s => ({
            boundary: s.boundary.map(p => [p.x, p.y]),
            material: s.material || "steel",
            thickness: 0.01
        })),
        holes: holes.map(s => ({
            boundary: s.boundary.map(p => [p.x, p.y])
        })),
        min_angle: 30
    };
    const response = await fetch("/automesh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        alert("Mesh generation failed: " + (await response.text()));
        return;
    }
    const result = await response.json();
    const idMap = {};
    result.nodes.forEach(n => {
        const newId = nextNodeId++;
        idMap[n.id] = newId;
        nodes.push({
            id: newId, x: n.posx, y: n.posy,
            force_x: 0, force_y: 0,
            is_fixed_x: false, is_fixed_y: false
        });
    });
    result.elements.forEach(el => {
        elements.push({
            type: "triangle",
            node_ids: el.node_ids.map(id => idMap[id]),
            material: el.material,
            thickness: el.thickness
        });
    });

    polygonShapes = [];
    saveMeshSnapshot()
    draw();
};

canvas.addEventListener("click", (e) => {
    const raw = { x: e.offsetX / scale, y: e.offsetY / scale };
    const snap = getSnapPoint(raw.x, raw.y);
    console.log("canvas click fired", mode);

    if (mode === "node") {
        showStress = false;
        if (!snap.node) {
            nodes.push({
                id: nextNodeId++,
                x: snap.x, y: snap.y,
                force_x: 0, force_y: 0,
                is_fixed_x: false, is_fixed_y: false
            });
        }
    } else if (mode === "triangle") {
        showStress = false;
        const node = snap.node || findNodeNear(snap.x, snap.y);
        if (!node) return;

        if (selectedNodeIds.includes(node.id)) {
            selectedNodeIds = selectedNodeIds.filter(id => id !== node.id);
    } else {
            selectedNodeIds.push(node.id);
    }

    if (selectedNodeIds.length === 3) {
        const newPoints = selectedNodeIds.map(id => {
            const n = nodes.find(n => n.id === id);
            return { x: n.x, y: n.y };
        });
    const overlapsExisting = elements.some(el => {

        const sharedCount = el.node_ids.filter(id =>
            selectedNodeIds.includes(id)
        ).length;

        if (sharedCount === 2) {
            return !trianglesShareEdgeWithoutOverlap(selectedNodeIds, el.node_ids);
        }

        const existingPoints = el.node_ids.map(id => {
            const n = nodes.find(n => n.id === id);
            return { x: n.x, y: n.y };
        });

        return polygonsOverlap(newPoints, existingPoints);
    });

        if (overlapsExisting) {
            alert("Can't place element: overlaps an existing element.");
            selectedNodeIds = [];
            draw()
            return;
        }

        elements.push({ type: "triangle", node_ids: [...selectedNodeIds], material: currentMaterial });
        selectedNodeIds = [];
    }

    } else if (mode == "rectangle") {
        showStress = false;
        const node = snap.node || findNodeNear(snap.x, snap.y);
        if (!node) return;

        if (selectedNodeIds.includes(node.id)) {
            selectedNodeIds = selectedNodeIds.filter(id => id !== node.id);
        } else {
            selectedNodeIds.push(node.id);
        }

        if (selectedNodeIds.length === 2) {
            const node_a = nodes.find(n => n.id === selectedNodeIds[0]);
            const node_b = nodes.find(n => n.id === selectedNodeIds[1]);
            const node_c = findOrCreateNode(node_a.x, node_b.y);
            const node_d = findOrCreateNode(node_b.x, node_a.y);
            elements.push({ type: "triangle", node_ids: [node_a.id, node_c.id, node_d.id], material: currentMaterial });
            elements.push({ type: "triangle", node_ids: [node_b.id, node_c.id, node_d.id], material: currentMaterial });
            selectedNodeIds = [];
        }
    } else if (mode === "automesh") {

        console.log("automesh click", raw, snap, currentPolygonPoints.length);

        if (currentPolygonPoints.length >= 3) {
            const first = currentPolygonPoints[0];
            const dx = snap.x - first.x;
            const dy = snap.y - first.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist <= NODE_SNAP_RADIUS) {
                const newBounds = findBoundingBox(currentPolygonPoints);
                let overlapsExisting = polygonShapes.some(shape =>
                polygonsOverlap(currentPolygonPoints, shape.boundary, polygonShapeType == "hole", newBounds)
            );

            if (!overlapsExisting) {
                overlapsExisting = elements.some(el => {
                    const existingPoints = el.node_ids.map(id => {
                        const n = nodes.find(n => n.id === id);
                        return { x: n.x, y: n.y };
                    });

                    return polygonsOverlap(currentPolygonPoints, existingPoints, false, newBounds);
                });
            }

            if (overlapsExisting) {
                alert("Can't place shape: overlaps an existing region/hole or mesh.");
                return;
            }

                polygonShapes.push({
                    type: polygonShapeType,
                    boundary: [...currentPolygonPoints],
                    material: currentMaterial
                });
                currentPolygonPoints = [];
                draw()
                return;
            }

        }

        currentPolygonPoints.push({ x: snap.x, y: snap.y });
    }
    draw();
});


canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const x = e.offsetX / scale, y = e.offsetY / scale;
    const node = findNodeNear(x, y);

    if (node) {
        const panel = document.getElementById("node-panel");
        if (editingNode && editingNode.id === node.id && panel.style.display === "block") {
            panel.style.display = "none";
            editingNode = null;
            return;
        }

        showStress = false;

        editingNode = node;
        document.getElementById("edge-panel").style.display = "none"
        
        document.getElementById("node-fx").value = node.force_x;
        document.getElementById("node-fy").value = -node.force_y;
        document.getElementById("node-fixx").checked = node.is_fixed_x;
        document.getElementById("node-fixy").checked = node.is_fixed_y;
        document.getElementById("node-panel-coords").textContent =
            `(${node.x.toFixed(1)}, ${(LOGICAL_HEIGHT-node.y).toFixed(1)})`;

        panel.style.left = e.pageX + "px";
        panel.style.top = e.pageY + "px";
        panel.style.display = "block";
        return;
    }
    const edge = findEdgeNear(x, y);

    if (edge) {
        showStress = false;
        editingEdge = edge;
        document.getElementById("node-panel").style.display = "none"

        const existingRule = edgeRules.find(r =>
            r.node_a_id === edge.node_a_id &&
            r.node_b_id === edge.node_b_id
        );

        if (existingRule) {
            document.getElementById("edge-type").value = existingRule.type;
            updateEdgeFieldVisibility()

            if (existingRule.type === "fix") {
                document.getElementById("edge-fixx").checked = existingRule.fix_x;
                document.getElementById("edge-fixy").checked = existingRule.fix_y;
            } else {
                document.getElementById("edge-fx").value = existingRule.force_x;
                document.getElementById("edge-fy").value = -existingRule.force_y;
            }
        } else {
            document.getElementById("edge-type").value = "fix";
            updateEdgeFieldVisibility()
            document.getElementById("edge-fixx").checked = false;
            document.getElementById("edge-fixy").checked = false;
            document.getElementById("edge-fx").value = 0;
            document.getElementById("edge-fy").value = 0;
        }

        const panel = document.getElementById("edge-panel");
        panel.style.left = e.pageX + "px";
        panel.style.top = e.pageY + "px";
        panel.style.display = "block";
        return;
    }
    const el = findElementNear(x, y);
    if (el) {
        showStress = false;
        editingElement = el;
        document.getElementById("node-panel").style.display = "none";
        document.getElementById("edge-panel").style.display = "none";

        const select = document.getElementById("material-panel-select");
        populateMaterialOptions(select, el.material || currentMaterial);

        const panel = document.getElementById("material-panel");
        panel.style.left = e.pageX + "px";
        panel.style.top = e.pageY + "px";
        panel.style.display = "block";
        return;
    }

});

function closeAllPanels() {
    document.getElementById("node-panel").style.display = "none";
    document.getElementById("edge-panel").style.display = "none";
    document.getElementById("material-panel").style.display = "none";
}

function findOrCreateNode(x, y, tolerance = 0.01) {
    for (const node of nodes) {
        const dx = node.x - x;
        const dy = node.y - y;
        if (Math.sqrt(dx * dx + dy * dy) <= tolerance) {
            return node;
        }
    }
    const newNode = {
        id: nextNodeId++,
        x: x, y: y,
        force_x: 0, force_y: 0,
        is_fixed_x: false, is_fixed_y: false
    };
    nodes.push(newNode);
    return newNode;
}
document.getElementById("material-panel-apply").onclick = () => {
    if (!editingElement) return;
    editingElement.material = document.getElementById("material-panel-select").value;
    document.getElementById("material-panel").style.display = "none";
    editingElement = null;
    draw();
};
document.getElementById("material-panel-cancel").onclick = () => {
    document.getElementById("material-panel").style.display = "none";
    editingElement = null;
};

document.getElementById("node-panel-apply").onclick = () => {
    if (!editingNode) return;
    editingNode.force_x = parseFloat(document.getElementById("node-fx").value) || 0;
    editingNode.force_y = -parseFloat(document.getElementById("node-fy").value) || 0;
    editingNode.is_fixed_x = document.getElementById("node-fixx").checked;
    editingNode.is_fixed_y = document.getElementById("node-fixy").checked;
    document.getElementById("node-panel").style.display = "none";
    editingNode = null;
    draw();
};

document.getElementById("node-panel-delete").onclick = async () => {
    if (!editingNode) return;

    if (shouldShowDeleteWarning()) {
        const confirmed = await showDeleteNodeWarning();
        if (!confirmed) return;
    }

    const nodeId = editingNode.id;

    elements = elements.filter(el => !el.node_ids.includes(nodeId));
    edgeRules = edgeRules.filter(r => r.node_a_id !== nodeId && r.node_b_id !== nodeId);
    nodes = nodes.filter(n => n.id !== nodeId);
    selectedNodeIds = selectedNodeIds.filter(id => id !== nodeId);

    document.getElementById("node-panel").style.display = "none";
    editingNode = null;
    lastResult = null;
    showStress = false;
    syncToggleButton("toggle-stress-btn", showStress);
    draw();
};

document.getElementById("clear-mesh-btn").onclick = () => {
    if (nodes.length === 0 && elements.length === 0 && polygonShapes.length === 0 && currentPolygonPoints.length === 0) return;
    const confirmed = confirm("Clear the entire mesh? This cannot be undone.");
    if (!confirmed) return;

    nodes = [];
    elements = [];
    nextNodeId = 0;
    selectedNodeIds = [];
    edgeRules = [];
    lastResult = null;
    showStress = false;
    showDeformed = false;
    editingNode = null;
    editingEdge = null;
    polygonShapes = [];
    currentPolygonPoints = [];

    syncToggleButton("toggle-stress-btn", showStress);
    syncToggleButton("toggle-deformed-btn", showDeformed);
    closeAllPanels();
    try {
        localStorage.removeItem("meshSnapshot");
    } catch (e) {
        console.warn("Could not clear mesh snapshot:", e);
    }
    draw();
};

function getSolveHistory() {
    try {
        return JSON.parse(localStorage.getItem("solveTimeHistory") || "[]");
    } catch {
        return [];
    }
}

function recordSolveTime(elementCount, ms) {
    const history = getSolveHistory();
    const existing = history.find(h => h.n === elementCount);

    if (existing) {
        existing.t = Math.max(existing.t, ms); // keep the slowest observed time for this size
    } else {
        history.push({ n: elementCount, t: ms });
        if (history.length > 30) history.shift();
        localStorage.setItem("solveTimeHistory", JSON.stringify(history));
        return;
    }

    localStorage.setItem("solveTimeHistory", JSON.stringify(history));
}
function saveMeshSnapshot() {
    try {
        localStorage.setItem("meshSnapshot", JSON.stringify({ nodes, elements, edgeRules, nextNodeId,polygonShapes}));
    } catch (e) {
        console.warn("Could not save mesh snapshot:", e);
    }
}

function loadMeshSnapshot() {
    try {
        const raw = localStorage.getItem("meshSnapshot");
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function estimateSolveTime(elementCount) {
    const history = getSolveHistory().filter(h => h.n > 0 && h.t > 0);
    if (history.length < MIN_SOLVE_SAMPLES) return null; 

    const xs = history.map(h => Math.log(h.n));
    const ys = history.map(h => Math.log(h.t));
    const meanX = xs.reduce((s, v) => s + v, 0) / xs.length;
    const meanY = ys.reduce((s, v) => s + v, 0) / ys.length;
    let num = 0, den = 0;
    for (let i = 0; i < xs.length; i++) {
        num += (xs[i] - meanX) * (ys[i] - meanY);
        den += (xs[i] - meanX) ** 2;
    }
    if (den === 0) return history[history.length - 1].t;

    const b = num / den;
    const a = Math.exp(meanY - b * meanX);
    return a * Math.pow(elementCount, b);
}

function predictedElementCount(refineTimes) {
    return elements.length * Math.pow(4, refineTimes);
}

function updateEdgeFieldVisibility() {
    const isFix = document.getElementById("edge-type").value === "fix";
    document.getElementById("edge-fix-fields").style.display = isFix ? "block" : "none";
    document.getElementById("edge-force-fields").style.display = isFix ? "none" : "block";
}

const refineInput = document.getElementById("refine-input");

function updateRefineWarning() {
    const value = parseInt(refineInput.value);
    const isHigh = value > REFINE_WARNING_THRESHOLD;
    refineInput.classList.toggle("refine-warning", isHigh);
    refineInput.title = isHigh ? "High chance of breaking" : "";
}

function shouldShowRefineWarning(refineTimes) {
    if (refineTimes <= REFINE_WARNING_THRESHOLD) return false;
    return getWarningStorage().getItem("suppressRefineWarning") !== "true";
}

function shouldShowStabilityWarning() {
    return getWarningStorage().getItem("suppressStabilityWarning") !== "true";
}

function showStabilityWarning(warnings) {
    return showConfirmModal(
        "Possible structural instability",
        warnings.join("\n\n"),
        "suppressStabilityWarning"
    );
}

function shouldShowDeleteWarning() {
    return getWarningStorage().getItem("suppressDeleteNodeWarning") !== "true";
}

function getWarningStorage() {
    return PERSIST_DONT_SHOW_AGAIN ? localStorage : sessionStorage;
}

function showConfirmModal(title, message, storageKey) {
    return new Promise((resolve) => {
        document.getElementById("warning-modal-title").textContent = title;
        document.getElementById("warning-modal-message").textContent = message;
        dontShowAgainCheckbox.checked = false;
        warningOverlay.style.display = "flex";

        const cleanup = () => {
            warningOverlay.style.display = "none";
            document.getElementById("warning-proceed-btn").onclick = null;
            document.getElementById("warning-cancel-btn").onclick = null;
        };

        document.getElementById("warning-proceed-btn").onclick = () => {
            if (dontShowAgainCheckbox.checked) {
                getWarningStorage().setItem(storageKey, "true");
            }
            cleanup();
            resolve(true);
        };

        document.getElementById("warning-cancel-btn").onclick = () => {
            cleanup();
            resolve(false);
        };
    });
}

function showRefineWarning() {
    return showConfirmModal(
        "High refinement level",
        "This mesh density has a high chance of freezing the browser or crashing the solver. Do you want to proceed?",
        "suppressRefineWarning"
    );
}

function showDeleteNodeWarning() {
    return showConfirmModal(
        "Delete node",
        "Delete this node? Any triangles using it will also be removed.",
        "suppressDeleteNodeWarning"
    );
}

if (refineInput) {
    refineInput.addEventListener("input", updateRefineWarning);
    updateRefineWarning(); // run once on load in case of a pre-filled value
}

document.getElementById("edge-type").addEventListener("change", updateEdgeFieldVisibility);

document.getElementById("node-panel-cancel").onclick = () => {
    document.getElementById("node-panel").style.display = "none";
    editingNode = null;
};
document.getElementById("edge-panel-cancel").onclick = () => {
    document.getElementById("edge-panel").style.display = "none";
    editingEdge = null;
};

document.getElementById("edge-panel-apply").onclick = () => {
    const type = document.getElementById("edge-type").value;

    const rule = {
        node_a_id: editingEdge.node_a_id,
        node_b_id: editingEdge.node_b_id,
        type: type
    };

    if (type === "fix") {
        rule.fix_x = document.getElementById("edge-fixx").checked;
        rule.fix_y = document.getElementById("edge-fixy").checked;
    } else {
        rule.force_x = parseFloat(document.getElementById("edge-fx").value) || 0;
        rule.force_y = -parseFloat(document.getElementById("edge-fy").value) || 0;
    }

    edgeRules = edgeRules.filter(r =>
        !(r.node_a_id === rule.node_a_id && r.node_b_id === rule.node_b_id)
    );
    edgeRules.push(rule);

    document.getElementById("edge-panel").style.display = "none";
    editingEdge = null;
    draw();
};

document.getElementById("calculate-btn").onclick = async () => {
    if (nodes.length === 0 || elements.length === 0) {
        lastResult = null;
        showStress = false;
        syncToggleButton("toggle-stress-btn", showStress);
        draw();
        alert("Cannot calculate -> no nodes or elements in the mesh.");
        return;
    }

    const hasSupport = nodes.some(node => node.is_fixed_x || node.is_fixed_y);

    if (!hasSupport) {
        alert("Your model has no supports.");
        return;
    }

    const hasLoad = nodes.some(node => node.force_x !== 0 || node.force_y !== 0);

    if (!hasLoad) {
        alert("Your model has no applied loads.");
        return;
    }

    const structuralWarnings = checkStructuralWarnings();
    if (structuralWarnings.length > 0 && shouldShowStabilityWarning()) {
        const proceed = await showStabilityWarning(structuralWarnings);
        if (!proceed) return;
    }

    const refineTimes = parseInt(document.getElementById("refine-input").value);

    if (shouldShowRefineWarning(refineTimes)) {
        const proceed = await showRefineWarning();
        if (!proceed) return;
    }
    saveMeshSnapshot();

    const predictedN = predictedElementCount(refineTimes);
    const estimate = estimateSolveTime(predictedN);

    const statusEl = document.getElementById("solve-status");
    const statusText = document.getElementById("solve-status-text");
    statusText.textContent = estimate
        ? (estimate < 100 ? "Solving..." : `Solving... ~${(estimate / 1000).toFixed(1)}s`)
        : "Solving...";
    statusEl.style.display = "flex";

    const startTime = performance.now();

    try {
        const usedNodeIds = new Set(elements.flatMap(el => el.node_ids));
        const usedNodes = nodes.filter(n => usedNodeIds.has(n.id));

        const payload = {
            nodes: usedNodes.map(n => ({
                id: n.id, posx: n.x, posy: n.y,
                force_x: n.force_x, force_y: n.force_y,
                is_fixed_x: n.is_fixed_x, is_fixed_y: n.is_fixed_y
            })),
            elements: elements.map(el => ({
            type: el.type, node_ids: el.node_ids, material: el.material || "steel", thickness: el.thickness || 0.01 })),
            refine_times: refineTimes,
            edge_rules: edgeRules
        };

        const response = await fetch("/calculate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            alert("Calculation failed: " + (await response.text()));
            return;
        }

        const result = await response.json();
        if (!result) {
            lastResult = null;
            showStress = false;
            syncToggleButton("toggle-stress-btn", showStress);
            draw();
            return;
        }

        lastResult = result;
        showStress = true;
        syncToggleButton("toggle-stress-btn", showStress);
        draw();

        const elapsed = performance.now() - startTime;
        recordSolveTime(predictedN, elapsed);
    } finally {
        statusEl.style.display = "none";
    }
};

const shapeTypeButton = document.getElementById("toggle-shape-type-btn");
if (shapeTypeButton) {
    shapeTypeButton.onclick = () => {
        polygonShapeType = polygonShapeType === "region" ? "hole" : "region";
        syncShapeTypeBadge();
        draw();
    };
}
syncShapeTypeBadge();

document.getElementById("toggle-stress-btn").onclick = () => {
    showStress = !showStress;
    syncToggleButton("toggle-stress-btn", showStress);
    draw();
};
document.getElementById("toggle-scale-btn").onclick = () => {
    stressScaleMode = stressScaleMode === "linear" ? "log" : "linear";
    document.getElementById("scale-mode-badge").textContent =
        stressScaleMode === "linear" ? "Lin" : "Log";
    draw();
};
document.getElementById("toggle-deformed-btn").onclick = () => {
    showDeformed = !showDeformed;
    syncToggleButton("toggle-deformed-btn", showDeformed);
    draw();
};

document.getElementById("toggle-outlines-btn").onclick = () => {
    showOutlines = !showOutlines;
    syncToggleButton("toggle-outlines-btn", showOutlines);
    draw();
};

const deformSlider = document.getElementById("deform-scale-slider");
const deformMinInput = document.getElementById("deform-scale-min");
const deformMaxInput = document.getElementById("deform-scale-max");

function updateScaleFill() {
    const min = parseFloat(deformSlider.min) || 0;
    const max = parseFloat(deformSlider.max) || 1;
    const val = parseFloat(deformSlider.value) || 0;
    const pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
    deformSlider.style.setProperty("--fill", pct + "%");
}
if (deformSlider) {
    deformSlider.addEventListener("input", () => {
        deformationScale = parseFloat(deformSlider.value) || 0;
        document.getElementById("deform-scale-value").textContent = deformationScale;
        updateScaleFill();
        draw();
    });
}
if (deformMinInput) {
    deformMinInput.addEventListener("input", () => {
        const min = parseFloat(deformMinInput.value) || 0;
        deformSlider.min = min;
        updateScaleFill();
    });
}
if (deformMaxInput) {
    deformMaxInput.addEventListener("input", () => {
        const max = parseFloat(deformMaxInput.value) || 200;
        deformSlider.max = max;
        updateScaleFill();
    });
}
updateScaleFill();

draw()