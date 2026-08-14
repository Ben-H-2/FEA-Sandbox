# FEA Sandbox - Interactive Finite Element Analysis Tool

**A browser-based tool for building 2D meshes and applying loads and constraints, all in real time with stress colouring, deformation and structural warning feedback. No external software required, running locally or in Github codespaces.**

## Features
<details>

<summary><strong>Mesh Editing</strong></summary>

<br>
Left click in "Add node" mode to freely place nodes or manually enter coordinates. Group nodes into triangular elements directly or create rectangular shapes through 2 triangles by selecting corner nodes.

</details>
<details>

<summary><strong>Boundary Conditions & Loads</strong></summary>

<br>
Right click a node or element edge to either fix it in the X/Y direction, apply a point force, or evenly distribute force along an edge. Edited nodes and elements are colour coded by property (green = fixed, orange = force).

</details>
<details>

<summary><strong>Materials</strong></summary>

<br>
Choose from six built-in materials (steel, aluminium, copper, titanium, concrete, timber) from the toolbar dropdown, each has its own stiffness, Poisson's ratio and colour in the editable mesh. New elements and automesh regions take on the currently selected material, and the material of anexisting element can be altered by right-clicking it and picking a different material from its own panel

</details>
<details>

<summary><strong>Mesh Refinement</strong></summary>

<br>
Subdivide the mesh before solving with a configurable level of refinement up to 4^8 triangles per element. Warning messages are shown above a certain threshold as refinement grows element count exponentially so can lead to long processing time.

</details>
<details>

<summary><strong>Grid & Snap</strong></summary>

<br>
Toggleable grid overlay for reference as well as toggleable snap mode prioritising existing nodes, then edges then the grid if enabled, making placement easier.
</details>
<details>

<summary><strong>Region Drawing / Automesh</strong></summary>

<br>
Draw material regions (and holes) as polygons, then auto-triangulate the interior through constrained Delaunay meshing.

</details>
<details>

<summary><strong>Solving</strong></summary>

<br>
When "calculate" is pressed, the mesh is sent to a Python backend, which assembles a global stiffness matrix as a sparse COO matrix, converts it to CSR for boundary condition reduction and solves it with SciPy's sparse solver (spsolve).

</details>
<details>

<summary><strong>Stress Visualization</strong></summary>

<br>
Stress is conveyed through a colour-mapped overlay with a live legend, with a toggle for linear as well as logarithmic scaling so stress distribution is visible even when outliers may wash out colour discepancies in linear mode.

</details>
<details>

<summary><strong>Deformed Shape Preview</strong></summary>

<br>
Toggle between the orginal and deformed mesh, with a configurable slider to exaggerate the deformation where it may not be visible for smaller forces. The slider’s upper and lower bounds are configurable via the boxes at either end (defaults to 0-1000).

</details>
<details>

<summary><strong>Structural warnings</strong></summary>

<br>
Before solving a check is run for lack of fixed nods or edges, no applied loads, unconstrained structures or connections around single nodes (articulation points) in order to prevent unintended results (the last 2 warnings are dismissable however warnings against calculating without forces or fixed points are not).

</details>
<details>

<summary><strong>Crash Recovery / Session Persistence</strong></summary>

<br>
Upon solving, reloading or exiting the page the current mesh is snapshotted to local storage, so a reload or crash prompts a message to recover the mesh as a precaution.

</details>


## Screenshots (some outdated)

![Example photo](Example_Photos/IMG_0039.jpeg)
![Example photo](Example_Photos/IMG_0037.jpeg)
![Example photo](Example_Photos/IMG_0038.jpeg)
![Log colouring](Example_Photos/v1.4_log.png)
![Lines toggled](Example_Photos/v1.4_lines.png)
![Warning](Example_Photos/Instability_warning.png)

## Getting Started
### Prerequisites
```
Python 3.12+
pip
```
### Installation
```
git clone https://github.com/Ben-H-2/FEA-Sandbox.git
cd FEA-Sandbox
pip install -r requirements.txt
```
### Running 
```
python main.py
```
This will print out the current status of the http://localhost:8000 in the terminal as well as a link to the interactive browser window.

### Running tests
```
pytest
```
Covers the solver and mode/element assembly but not anything else as of v1.6
## Usage
| Action | How |
|---|---|
| Place a node | Select "Place Node" mode then left click canvas, or enter X/Y and click "Add Node" |
| Delete a node || Right click the node and press “delete” |
| Create a triangle | Select "Make Triangle" mode then left click 3 existing nodes in sequence |
| Create a rectangle | Select "Make Rectangle" mode → click 2 nodes as opposite corners |
| Set material for new elements |  Choose from the “materials” dropdown at the top and every element created will be that material |
| Change an elements material | Right click the element, pick the material and “apply” |
| Create automesh region | Toggle automesh mode to “region” draw outline of polygon and connect back to the start|
| Create automesh hole | Toggle automesh mode to “hole” draw outline of polygon within existing automesh region |
| Convert automesh regions to elements| Press “generate automesh” button, it will generate elements and nodes |
| Fix/load a node | Right-click node and check Fix X / Fix Y to fix and type in force in x and y direction |
| Fix/load a whole edge | Right-click an element edge (not a node) and fix/apply force same as nodes|
| Refine the mesh | Set "Refine" value before calculating, ranges from 1-8 |
| Run a solve | Click "Calculate" |
| Read stress values | Toggle "Scale: Linear/Log", hover over solved mesh to read the stress at that point |
| View element borders | Toggle the "Toggle Outlines" button |
| Preview deformation | "Toggle Deformation" + deformation scale slider |
| Adjust deformation slider bounds | Edit the min/max fields either side of the deformation slider |
 
### Notes:
- **Interpreting the legend:** the colour bar maps colour to von Mises stress (Pa). Using the log mode can reveal discrepancies in stress more clearly where in linear mode, high stress points may dominate the colouring.
- **Calculation warnings:** if the mesh looks structurally unstable or the refinement level is high, you'll be prompted to confirm before the solve proceeds.
- **Hovering for point stress:** while viewing solved results, hover over any element to see its exact von Mises stress value in a tooltip.
- **Overlap warnings** if an element currently being created overlaps another it will flag it as overlap and prevent creation
- **Pre-solve checks** calculate will not run if there are not any loads or fixed edges/nodes
- **Solve time estimate** after solving a few meshes the solving indicator will show an estimate based on your own solve history

## How It Works
<details>

<summary><strong>Mesh Data Model (Nodes, Elements, Edge Rules)</strong></summary>
<br>- <em>Each node holds an individual position, fixed_x/y, force_x/y and an ID</em>
<br>- <em>Elements reference 3 node IDs as the mesh is entirely comprised of triangles</em>
<br>- <em>Edge rules apply fixed_x/y attributes along all nodes on an edge (including corner nodes) as well as distibuting force evenly </em>

</details>
<details>

<summary><strong>Refinement Algorithm</strong></summary>
<br>- <em>Each refinement pass subdivides each triangle element into 4 new triangles</em>
<br> - <em>Therefore triangle/element count grows at a rate of n * 4^refine_times where n is intital element count</em>
<br> - <em>This explains why refinement above 5 is flagged by red colouring and refinement above 5 for meshes with multiple elements is inadvisable</em>

</details>
<details>

<summary><strong>Materials</strong></summary>
<br>- <em>The frontend loads material definitions (name, Young's modulus E, Poisson's ratio ν, colour) from <code>GET /materials</code>, backed by <code>fea/material.py</code>'s <code>DEFAULT_MATERIALS</code></em>
<br>- <em>Every element and *calculated automesh region carries a material which corresponds to a element tint colour</em>

</details>
<details>

<summary><strong>Automesh / Region Meshing</strong></summary>
<br>- <em>Drawn regions and holes are sent to <code>POST /automesh</code>, which gives polygon boundaries to the <code>triangle</code> library for constrained Delaunay triangulation</em>
<br>- <em>A minimum-angle (currently at 30°) keeps generated triangles roughly equilateral rather than skinny</em>
<br>- <em>Each region's material and thickness are tagged onto its interior point so the resulting triangles inherit the right material automatically but holes are excluded via their own interior point</em>

</details>
<details>

<summary><strong>Structural Warnings</strong></summary>
<br> - <em>Unconstrained Element Check - If there are no fixed nodes or elements deformation would result in the whole mesh moving (effectively dissapearing)</em>
<br> - <em>Articulation Point Detection - If a single node connects 2 otheriwse disconnected regions it can result in innacurate deformation results so this is flagged</em>
<br> - <em>Overlap Detection - If a currently created element overlaps another an alert will fire and the element will not be created</em>

</details>
<details>

<summary><strong>Solve Request / Response Format</strong></summary>
<br>- <em>The frontend sends mesh nodes, elements, edge_rules, and refine_times to <code>/calculate</code></em>
<br>- <em>The backend builds an AnalysisModel from the nodes/elements, then applies mesh refinement and edge rules</em>
<br>- <em>model.solve() assembles the global stiffness matrix as a sparse COO matrix, reduces it for boundary conditions, and solves it with SciPy's sparse.linalg.spsolve</em>
<br>- <em>The backend returns solved node positions, displacements, and per-element von Mises stress as JSON, which the frontend uses to render the stress view</em>

</details>
<details>

<summary><strong>Stress Color Mapping (Linear vs Logarithmic)</strong></summary>
<br>- <em>Linear node maps colour directly to stress as a fraction of the maximum</em>
<br> - <em>Logarithmic mode maps the log of the value instead spreading out the colouring and distinguishing stress in low stress regions</em>

</details>
<details>

<summary><strong>Solve Time Estimation</strong></summary>
<br><em> Solve durations are recorded per post-refinement element count in local storage, and a log-log regression over past solves displays the expected solve time when each solve begins. </em>

</details>

## Future features
- [x] Automesh
- [x] Material properties
- [ ] Undo/Redo buttons
- [ ] Truss/line elements in the browser
- [ ] Load cases
- [ ] Export results
- [ ] Better editing tools (mirror align etc)
- [ ] Save/load mesh to file
- [ ] Expose configuration constants in the ui as a menu
- [ ] Pyvista implementation as an option
- [ ] Curved lines support
- [ ] Automatic element splitting on node placement
- [ ] Use caching to improve solve times
- [ ] Partial canvas redraws instead of entire redraws

## Project Structure
### File Layout
```
.
├── .devcontainer/
│   └── devcontainer.json    # GitHub Codespaces environment(desktoplite+ port 6080)
├── api/app.py                # FastAPI app: /, /health, /materials, /automesh, /calculate
├── fea/
│   ├── model.py                # AnalysisModel: nodes, elements, materials, solve orchestration
│   ├── element.py               # ElementBase / Element (truss) / TriangleElement
│   ├── node.py                    # Node definition
│   ├── material.py                 # Material dataclass + DEFAULT_MATERIALS
│   ├── mesh.py                      # Refinement, edge rule application
│   ├── solver.py                     # Sparse stiffness matrix assembly & solve
│   ├── visualisation.py               # PyVista-based plotting helpers (scripting use)
│   └── automesh.py                     # Region/hole polygon generation
├── static/
│   ├── index.html                       # Frontend UI
│   └── app.js                            # Mesh editor, canvas rendering, solve calls
├── Example_Photos/                         # Screenshots used in this README
├── main.py                                  # Local/Codespaces entry point
├── test_solver.py
├── test_model.py
└── requirements.txt
```
## Configuration / Constants Reference
| Constant | Location | Purpose |
|---|---|---|
| `REFINE_WARNING_THRESHOLD` | `app.js` | Refine value above which the UI warns before solving |
| `MIN_SOLVE_SAMPLES` | `app.js` | Minimum recorded solves needed locally before it estimates solve time |
| `LEGEND_TICK_COUNT` | `app.js` | Number of labels along the colour scale (legend) |
| `PERSIST_DONT_SHOW_AGAIN` | `app.js` | Whether "don't show again" warning dismissals persist across sessions (localStorage) or just the tab (sessionStorage) |
| `SHOW_HOVER_TOOLTIP` | `app.js` | Enables/Disables the tooltip for von mises stress value displaying when the mouse is on the mesh |
| `NODE_SELECTION_RADIUS` | `app.js` | Configures the range around a node where it can be selected |
| `ELEMENT_SELECTION_RADIUS` | `app.js` | Configures the range around an element where it can be selected |
| `NODE_RADIUS` | `app.js` | Configures the size of nodes in the editable mesh |
| `MATERIAL_FILL_ALPHA` | `app.js` | Opacity of tinted elements by their material colour in the editable mesh view |
| `GRID_SPACING` | `app.js` | Spacing between grid lines when the grid is toggled on |
| `NODE_SNAP_RADIUS` | `app.js` | Snap priority 1: distance within which clicks snap to an existing node |
| `EDGE_SNAP_RADIUS` | `app.js` | Snap priority 2: distance within which clicks snap to an existing edge |
| `GRID_SNAP_RADIUS` | `app.js` | Snap priority 3: distance within which clicks snap to a grid intersection |
| `default_thickness` | `fea/automesh.py` | Thickness applied to a region that doesn't specify its own |
| `coord_precision` | `fea/automesh.py` | Decimal places used to de-duplicate shared boundary vertices between regions/holes |

## Credits

Toolbar icons by [Lucide](https://lucide.dev) — ISC License.
Region/hole meshing powered by the [`triangle`](https://pypi.org/project/triangle/) Python bindings to Jonathan Shewchuk's Triangle library.

## Contributing

All contributions are welcome

## License

MIT — see [LICENSE](LICENSE).
