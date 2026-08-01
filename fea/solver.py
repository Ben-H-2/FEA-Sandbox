import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.linalg import spsolve

def build_node_index(nodes):
    return {node: i for i, node in enumerate(nodes)}

def get_dofs(nodes_list, node_index):
    dofs = []
    for node in nodes_list:
        idx = node_index[node]
        dofs.append(idx*2)
        dofs.append(idx*2+1)
    return dofs

def create_global_matrix(nodes, elements, node_index):
    n = len(nodes)*2
    row_list, col_list, value_list = [], [], []
    for element in elements:
        local_matrix = element.create_stiffness_matrix()
        dofs = get_dofs(element.get_nodes(), node_index)
        for i in range(len(dofs)):
            for j in range(len(dofs)):
                value_list.append(local_matrix[i,j])
                row_list.append(dofs[i])
                col_list.append(dofs[j])
    return coo_matrix((value_list, (row_list, col_list)), shape=(n,n))

def build_force_vector(nodes, node_index):
    F = np.zeros(len(nodes)*2)
    for node in nodes:
        idx = node_index[node]
        F[idx*2] = node.force_x
        F[idx*2+1] = node.force_y
    return F

def reduce_system(K, F, nodes, node_index):
    n = len(nodes)*2
    remove = []
    for node in nodes:
        idx = node_index[node]
        if node.is_fixed_x: remove.append(idx*2)
        if node.is_fixed_y: remove.append(idx*2+1)
    remove_set = set(remove)
    keep = [dof for dof in range(n) if dof not in remove_set]
    K_r = K.tocsr()[keep, :][:, keep]
    F_r = F[keep]
    return K_r, F_r, remove_set

def solve_system(K_reduced, F_reduced):
    return spsolve(K_reduced, F_reduced)

def expand_displacements(u_reduced, remove, total_dofs):
    full_u = np.zeros(total_dofs)
    counter = 0
    for position in range(total_dofs):
        if position not in remove:
            full_u[position] = u_reduced[counter]
            counter += 1
    return full_u



