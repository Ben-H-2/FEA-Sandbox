from dataclasses import dataclass

@dataclass
class Material:
    name: str
    E: float
    nu: float
    colour: str = "#808080"

DEFAULT_MATERIALS = {
    "steel":     (200e9, 0.30, "#5b6b7a"),
    "aluminium": (69e9,  0.33, "#a8adb3"),
    "copper":    (110e9, 0.34, "#c07a4d"),
    "titanium":  (114e9, 0.32, "#8a7ea8"),
    "concrete":  (30e9,  0.20, "#c2b8a3"),
    "timber":    (11e9,  0.30, "#8a5a3c"),
}
