import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"

if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from fea.mesh import refine_mesh, apply_edge_rules
from fea.model import AnalysisModel
from fea.element import Element, TriangleElement

app = FastAPI()

class EdgeRuleIn(BaseModel):
    node_a_id: int
    node_b_id: int
    type: str
    fix_x: bool = False
    fix_y: bool = False
    force_x: float = 0.0
    force_y: float = 0.0

class NodeIn(BaseModel):
    id: int
    posx: float
    posy: float
    force_x: float = 0.0
    force_y: float = 0.0
    is_fixed_x: bool = False
    is_fixed_y: bool = False

class ElementIn(BaseModel):
    type: str
    node_ids: list[int]
    material: str = "steel"
    A: float = 0.001
    thickness: float = 0.01

class CalculateRequest(BaseModel):
    edge_rules: list[EdgeRuleIn] = []
    nodes: list[NodeIn]
    elements: list[ElementIn]
    refine_times: int = Field(default=1, ge=0, le=8)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/")
def root():
    index_file = STATIC_DIR / "index.html"
    if index_file.exists():
        return FileResponse(index_file)
    return {"message": "Frontend not found"}

@app.post("/calculate")
def calculate(req: CalculateRequest):
    if not req.nodes or not req.elements:
        return None
    model = AnalysisModel()
    id_to_node = {}
    for n in req.nodes:
        node = model.add_node(n.posx, n.posy)
        node.force_x, node.force_y = n.force_x, n.force_y
        node.is_fixed_x, node.is_fixed_y = n.is_fixed_x, n.is_fixed_y
        id_to_node[n.id] = node

    
    for e in req.elements:
        nodes = [id_to_node[i] for i in e.node_ids]
        material = model.materials[e.material]
        if e.type == "truss":
            elem = Element(material=material, A=e.A, leftnode=nodes[0], rightnode=nodes[1])
        else:
            elem = TriangleElement(material=material, thickness=e.thickness,
                                     node_a=nodes[0], node_b=nodes[1], node_c=nodes[2])
        model.add_element(elem)

    refine_mesh(model, times=req.refine_times)
    apply_edge_rules(model, req.edge_rules, id_to_node)
    model.solve()
    node_index = model._node_index
    if node_index is None:
        from fea.solver import build_node_index
        node_index = build_node_index(model.nodes)
        model._node_index = node_index
    von_mises = model.get_von_mises_stresses()

    return {
        "nodes": [
            {"id": node_index[n], "posx": n.posx, "posy": n.posy}
            for n in model.nodes
        ],
        "elements": [
            {"node_ids": [node_index[n] for n in el.get_nodes()]}
            for el in model.elements
        ],
        "displacements": model.get_displacements().tolist(),
        "von_mises": [float(von_mises[el]) for el in model.elements],
    }


app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api.app:app", host="0.0.0.0", port=8000, reload=True)