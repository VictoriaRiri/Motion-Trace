from __future__ import annotations

from collections import defaultdict

from backend.models.schemas import Landmark


class TrajectoryManager:
    """Stores trajectories as player_id -> joint_name -> points."""

    def __init__(self) -> None:
        self._trajectories: dict[int, dict[str, list[tuple[float, float, float, float]]]] = defaultdict(
            lambda: defaultdict(list)
        )

    def add_landmarks(self, player_id: int, landmarks: list[Landmark], timestamp: float) -> None:
        for landmark in landmarks:
            self._trajectories[player_id][landmark.name].append(
                (landmark.x, landmark.y, landmark.z, timestamp)
            )

    def get_player_trajectory(self, player_id: int) -> dict[str, list[tuple[float, float, float, float]]]:
        return dict(self._trajectories.get(player_id, {}))

    def all(self) -> dict[int, dict[str, list[tuple[float, float, float, float]]]]:
        return {player_id: dict(joints) for player_id, joints in self._trajectories.items()}
