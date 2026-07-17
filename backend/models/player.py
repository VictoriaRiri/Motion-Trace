from dataclasses import dataclass, field
from .schemas import BoundingBox, Landmark, Vector2


@dataclass
class Player:
    id: int
    bbox: BoundingBox
    landmarks: list[Landmark] = field(default_factory=list)
    trajectory: dict[str, list[tuple[float, float, float, float]]] = field(default_factory=dict)
    velocity: Vector2 = field(default_factory=Vector2)
    acceleration: Vector2 = field(default_factory=Vector2)
    metrics: dict[str, float] = field(default_factory=dict)
    confidence_history: list[float] = field(default_factory=list)
