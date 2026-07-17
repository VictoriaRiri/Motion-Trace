from pydantic import BaseModel, Field


class BoundingBox(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float

    @property
    def width(self) -> float:
        return max(0.0, self.x2 - self.x1)

    @property
    def height(self) -> float:
        return max(0.0, self.y2 - self.y1)

    @property
    def area(self) -> float:
        return self.width * self.height

    @property
    def center(self) -> tuple[float, float]:
        return ((self.x1 + self.x2) / 2.0, (self.y1 + self.y2) / 2.0)


class Detection(BaseModel):
    bbox: BoundingBox
    confidence: float
    class_id: int = 0
    class_name: str = "person"


class Landmark(BaseModel):
    name: str
    x: float
    y: float
    z: float
    visibility: float


class Vector2(BaseModel):
    x: float = 0.0
    y: float = 0.0


class PlayerFrame(BaseModel):
    track_id: int = Field(alias="trackId")
    bbox: BoundingBox
    keypoints: list[Landmark]
    confidence: float
    velocity: Vector2 = Field(default_factory=Vector2)
    acceleration: Vector2 = Field(default_factory=Vector2)
    pose_confidence: float = Field(default=0.0, alias="poseConfidence")

    class Config:
        populate_by_name = True


class FrameData(BaseModel):
    frame_number: int = Field(alias="frameNumber")
    timestamp: float
    people: list[PlayerFrame]

    class Config:
        populate_by_name = True


class PlayerSummary(BaseModel):
    track_id: int = Field(alias="trackId")
    first_frame: int = Field(alias="firstFrame")
    last_frame: int = Field(alias="lastFrame")
    duration: float
    max_bbox_area: float = Field(alias="maxBboxArea")

    class Config:
        populate_by_name = True


class AnalysisMetadata(BaseModel):
    analysis_id: str = Field(alias="analysisId")
    video_id: str = Field(alias="videoId")
    fps: float
    frame_count: int = Field(alias="frameCount")
    duration: float
    players: list[PlayerSummary]

    class Config:
        populate_by_name = True


class MovementMetrics(BaseModel):
    player_id: int = Field(alias="playerId")
    path_length: float = Field(alias="pathLength")
    movement_duration: float = Field(alias="movementDuration")
    average_speed: float = Field(alias="averageSpeed")
    max_speed: float = Field(alias="maxSpeed")
    average_acceleration: float = Field(alias="averageAcceleration")
    curvature: float
    smoothness: float
    symmetry: float
    joint_speed: dict[str, float] = Field(alias="jointSpeed")

    class Config:
        populate_by_name = True
