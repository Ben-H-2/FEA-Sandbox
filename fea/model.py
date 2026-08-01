from typing import Optional

import numpy as np

from fea.node import Node
from fea.element import Element,TriangleElement,ElementBase
from fea.material import Material
from fea.solver import build_node_index, create_global_matrix, build_force_vector,reduce_system,expand_displacements,solve_system
from fea.visualisation import render_mesh, show_mesh,render_model

class AnalysisModel:
    def __init__(self):
        self.elements: list[ElementBase] = []
        self.nodes: list[Node] = []
        self._node_set: set[Node]= set()
        self._element_set: set[Element]= set()
        self.materials: dict[str, Material] = {}
        self._next_id = 0
        self.u: Optional[np.ndarray] = None
        self.K: Optional[object] = None
        self._node_index: Optional[dict[Node, int]] = None

        self._add_default_materials()

    def add_node(self, posx: float, posy: float = 0.0):
        new_node = Node(identifier=self._next_id,posx = posx,posy = posy)
        self._next_id += 1
        self.nodes.append(new_node)
        self._node_set.add(new_node)
        return new_node

    def add_element(self, element: ElementBase):
        if not isinstance(element, ElementBase):
            raise TypeError(f"{type(element).__name__} is not a valid element type.")
        for node in element.get_nodes():
            if node not in self._node_set:
                raise ValueError(f"Element references a node not in this model: {node}")
        self.elements.append(element)
        self._element_set.add(element)
        return element
    
    def _add_default_materials(self):
        defaults = {
            "steel":     (200e9, 0.30),
            "aluminium": (69e9,  0.33),
            "copper":    (110e9, 0.34),
            "titanium":  (114e9, 0.32),
            "concrete":  (30e9,  0.20),
            "timber":    (11e9,  0.30),
        }
        for name, (E, nu) in defaults.items():
            self.add_material(name, E=E, nu=nu)
        
    def add_material(self, name, E, nu):
        material = Material(name=name, E=E, nu=nu)
        self.materials[name] = material
        return material

    def assign_material_to_element(self, element, material):
        if element not in self.elements:
            raise ValueError(f"Element is not part of this model: {element}")
        if material not in self.materials.values():
            raise ValueError(f"Material is not registered in this model: {material}")
        element.material = material
        return element

    def add_load(self, node, force_x=0.0, force_y=0.0):
        if node not in self.nodes:
            raise ValueError(f"Node is not part of this model: {node}")
        node.force_x += force_x
        node.force_y += force_y
        return node
    
    def add_distributed_load(self, element, load_value, direction="y"):
        if element not in self.elements:
            raise ValueError(f"Element is not part of this model: {element}")
        length = element.get_length()
        total_load = load_value * length
        half_load = total_load / 2
        for node in element.get_nodes():
            if direction == "y":
                self.add_load(node, force_y=half_load)
            elif direction == "x":
                self.add_load(node, force_x=half_load)
            else:
                raise ValueError(f"Invalid direction: {direction}")
        return element

    def add_support(self, node, fix_x=False, fix_y=False):
        if node not in self.nodes:
            raise ValueError(f"Node is not part of this model: {node}")
        node.is_fixed_x = node.is_fixed_x or fix_x
        node.is_fixed_y = node.is_fixed_y or fix_y
        return node
        
    def remove_node(self, node):
        if node not in self._node_set:
            raise ValueError(f"Node is not part of this model: {node}")
        for element in self.elements:
            if node in element.get_nodes():
                raise ValueError(f"Cannot remove node: still referenced by an element: {element}")
        self.nodes.remove(node)
        self._node_set.discard(node)
        return node

    def remove_element(self, element):
        if element not in self._element_set:
            raise ValueError(f"Element is not part of this model: {element}")
        self.elements.remove(element)
        self._element_set.discard(element)
        return element

    def clear_all(self):
        self.nodes = []
        self.elements = []
        self._next_id = 0
        self.u = None
        self.K = None

    def build_mesh(self):
        if not self.nodes:
            raise ValueError("Model has no nodes.")
        if not self.elements:
            raise ValueError("Model has no elements.")
        used_nodes = set()
        for element in self.elements:
            for node in element.get_nodes():
                used_nodes.add(node)
        unused = [n for n in self.nodes if n not in used_nodes]
        if unused:
            print(f"Warning: {len(unused)} node(s) not connected to any element.")
        return True

    def assemble_system(self):
        node_index = build_node_index(self.nodes)
        self.K = create_global_matrix(self.nodes, self.elements, node_index)
        F = build_force_vector(self.nodes, node_index)
        return self.K, F, node_index

    def apply_boundary_conditions(self):
        from fea.solver import reduce_system
        K, F, node_index = self.assemble_system()
        K_r, F_r, remove = reduce_system(K, F, self.nodes, node_index)
        return K, K_r, F_r, remove, node_index

    def solve(self):
        self.build_mesh()
        K, K_r, F_r, remove, node_index = self.apply_boundary_conditions()
        u_reduced = solve_system(K_r, F_r)
        self.u = expand_displacements(u_reduced, remove, len(self.nodes)*2)
        self.K = K
        self._node_index = node_index
        return self.u

    def get_displacements(self):
        if self.u is None:
            raise ValueError("Model has not been solved yet. Call solve() first.")
        return self.u

    def get_reactions(self):
        if self.u is None or self.K is None or self._node_index is None:
            raise ValueError("Model has not been solved yet. Call solve() first.")
        F_full = self.K @ self.u
        reactions = {}
        for node in self.nodes:
            idx = self._node_index[node]
            rx = F_full[idx*2]
            ry = F_full[idx*2+1]
            if node.is_fixed_x or node.is_fixed_y:
                reactions[node] = (rx, ry)
        return reactions

    def get_element_stresses(self):
        if self.u is None:
            raise ValueError("Model has not been solved yet. Call solve() first.")
        stresses = {}
        for element in self.elements:
            stresses[element] = element.get_stress(self.u, self._node_index)
        return stresses

    def get_element_strains(self):
        if self.u is None:
            raise ValueError("Model has not been solved yet. Call solve() first.")
        strains = {}
        for element in self.elements:
            strains[element] = element.get_strain(self.u, self._node_index)
        return strains

    def get_von_mises_stresses(self):
        if self.u is None:
            raise ValueError("Model has not been solved yet. Call solve() first.")
        result = {}
        for element in self.elements:
            result[element] = element.get_von_mises_stress(self.u, self._node_index)
        return result
    def save_to_file(self, filename):
        """Serialise the current model to disk so it can be reloaded later for continued analysis."""
        pass

    def load_from_file(self, filename):
        """Load a previously saved model from disk and restore its geometry, loads, supports, and materials."""
        pass

    def add_load_case(self, name):
        """Create a named load case so multiple loading scenarios can be stored and compared."""
        pass

    def switch_load_case(self, name):
        """Activate a different load case and make its loads and boundary conditions the current analysis state."""
        pass

    def get_load_case_names(self):
        """Return the available load-case names for inspection or selection in the UI or script."""
        pass

    def export_results(self, filename):
        """Export solved results such as displacements, reactions, and stresses to a file for reporting or post-processing."""
        pass

    def plot_results(self, scale=1):
        mesh = render_model(self, deformed=(self.u is not None), scale=scale)
        show_mesh(mesh, show_edges=True)
