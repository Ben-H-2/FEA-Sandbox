"""
Outline-based automeshing: converts material/hole polygon loops into
Triangle's constrained-Delaunay input, then materializes the result as
Node/TriangleElement objects on an existing AnalysisModel.

Region dict shape:
    {
        "boundary": [(x, y), ...],   # closed loop, dont repeat first point
        "material": Material | str,  # Material object, or a key into model.materials
        "thickness": float,          # optional: defaults to default_thickness
        "max_area": float | None,    # optional, max triangle area for this region
        "interior_point": (x, y),    # optional overrige, done by centroid otherwise
    }

Hole dict shape:
    {
        "boundary": [(x, y), ...],
        "interior_point": (x, y),    
    }
"""
import triangle as tr
from fea.element import TriangleElement

coord_precision = 9
default_thickness = 0.01

def _polygon_centroid(points):
    n = len(points)
    signed_area_sum = 0
    cxsum = 0
    cysum = 0

    for i in range(n):
        x0, y0 = points[i]
        x1, y1 = points[(i + 1) % n]
        cross = x0 * y1 - x1 * y0
        signed_area_sum += cross
        cxsum += (x0 + x1) * cross
        cysum += (y0 + y1) * cross

    signed_area = signed_area_sum / 2
    if abs(signed_area) < 1e-12:
        cx = sum(p[0] for p in points) / n
        cy = sum(p[1] for p in points) / n
        return (cx, cy)
    
    cx = cxsum / (6 * signed_area)
    cy = cysum / (6 * signed_area)
    return (cx, cy)

def _vertex_key(point):
    return (round(point[0],coord_precision), round(point[1],coord_precision))

def add_loop_segments(boundary, registry, segments):
        if len(boundary) < 3:
            raise ValueError(f"Boundary loop should have at least 3 points, only got {len(boundary)}.")
        idxs = list(map(registry.add,boundary))
        n = len(idxs)
        for i in range(n):
            segments.append((idxs[i], idxs[(i+1) % n]))

def build_region_list(regions, model):
    region_list = []
    tag_meta = {}
    for i, region in enumerate(regions):
        tag = i + 1

        # NOTE: centroid fallback fails for regions with a hole near their center
        # (annulus-shaped regions) so pass am explicit interior_point in that case.
        interior = region.get("interior_point") or _polygon_centroid(region["boundary"])

        max_area = region.get("max_area",0)
        region_list.append([interior[0], interior[1], tag, max_area])
        material = region["material"]
        if isinstance(material, str):
            material = model.materials[material]
        thickness = region.get("thickness", default_thickness)
        tag_meta[tag] = {"material": material, "thickness": thickness}
    return region_list, tag_meta

def build_hole_points(holes):
    return [hole.get("interior_point") or _polygon_centroid(hole["boundary"]) for hole in holes]

class Vertex_Registry:

    def __init__(self):
        self.vertices = []
        self.index_by_key = {}

    def add(self,pt):
        key = _vertex_key(pt)
        if key in self.index_by_key:
            return self.index_by_key[key]
        else:
            self.vertices.append(pt)
            idx = len(self.vertices)-1
            self.index_by_key[key] = idx
            return idx

def generate_mesh_from_regions(model, regions, holes=None, min_angle=30):
    holes = holes or []
    if not regions:
        raise ValueError("generate_mesh_from_regions requires at least one region.")

    reg = Vertex_Registry()
    segments = []
    for region in regions:
        add_loop_segments(region["boundary"], reg, segments)
    for hole in holes:
        add_loop_segments(hole["boundary"], reg, segments)

    region_list, tag_meta = build_region_list(regions, model)
    hole_points = build_hole_points(holes)

    mesh_input = {"vertices": reg.vertices, "segments": segments, "regions": region_list,}
    if hole_points:
        mesh_input["holes"] = hole_points

    flags = f"pq{min_angle}Aa"
    try:
        mesh = tr.triangulate(mesh_input, flags)
    except Exception as exc:
        raise ValueError(
            f"Meshing failed — check region/hole boundaries for self-intersections "
            f"or overlaps ({exc})"
        ) from exc
    
    mesh_nodes = [model.add_node(x, y) for x, y in mesh["vertices"]]
    created_elements = []

    for tri, attr in zip(mesh["triangles"], mesh["triangle_attributes"]):
        tag = int(round(attr[0]))
        meta = tag_meta.get(tag)
        if meta is None:
            raise ValueError(
                f"Triangle has region tag {tag} with no matching region — an interior_point "
                "likely landed outside its intended boundary (check for concave regions)."
            )
        triangle_material = meta["material"]
        triangle_thickness = meta["thickness"]
        a,b,c = tri
        node_a = mesh_nodes[a]
        node_b = mesh_nodes[b]
        node_c = mesh_nodes[c]
        elem = TriangleElement(material=triangle_material, thickness=triangle_thickness,node_a=node_a, node_b=node_b, node_c=node_c)
        created_elements.append(elem)
        model.add_element(elem)
    return created_elements







