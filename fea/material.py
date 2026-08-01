from dataclasses import dataclass

@dataclass
class Material:
    name: str
    E: float
    nu: float

DEFAULT_MATERIALS = {
    "steel":     (200e9, 0.30),
    "aluminium": (69e9,  0.33),
    "copper":    (110e9, 0.34),
    "titanium":  (114e9, 0.32),
    "concrete":  (30e9,  0.20),
    "timber":    (11e9,  0.30),
}
