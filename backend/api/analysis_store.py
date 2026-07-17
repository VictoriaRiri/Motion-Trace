from __future__ import annotations

import json
from pathlib import Path

from backend.models.schemas import AnalysisMetadata, FrameData


class AnalysisStore:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def save(self, analysis_id: str, metadata: AnalysisMetadata, frames: list[FrameData], trajectories: dict) -> None:
        folder = self.root / analysis_id
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "metadata.json").write_text(metadata.model_dump_json(by_alias=True, indent=2), encoding="utf-8")
        (folder / "frames.json").write_text(
            json.dumps([frame.model_dump(by_alias=True) for frame in frames], indent=2),
            encoding="utf-8",
        )
        (folder / "trajectories.json").write_text(json.dumps(trajectories, indent=2), encoding="utf-8")

    def metadata(self, analysis_id: str) -> AnalysisMetadata:
        return AnalysisMetadata.model_validate_json((self.root / analysis_id / "metadata.json").read_text(encoding="utf-8"))

    def frames(self, analysis_id: str) -> list[FrameData]:
        data = json.loads((self.root / analysis_id / "frames.json").read_text(encoding="utf-8"))
        return [FrameData.model_validate(item) for item in data]

    def trajectories(self, analysis_id: str) -> dict:
        return json.loads((self.root / analysis_id / "trajectories.json").read_text(encoding="utf-8"))
