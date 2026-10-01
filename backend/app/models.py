"""Pydantic request models shared by the API routes."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class Fold(BaseModel):
    vertices_coords: list[list[float]]
    edges_vertices: list[list[int]]
    edges_assignment: list[str]
    faces_vertices: list[list[int]] = Field(default_factory=list)


class PatternCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    fold: Fold
    user_id: str | None = None


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=40)


class ProgressUpdate(BaseModel):
    user_id: str
    tutorial_id: str
    step_index: int = Field(ge=-1)
    completed: bool = False


class Exceptions(BaseModel):
    allow_cuts: bool = False
    non_flat: bool = False
    curved: bool = False


class StudioCheck(BaseModel):
    fold: Fold
    exceptions: Exceptions = Exceptions()


class StudioPreview(BaseModel):
    fold: Fold


class AskRequest(BaseModel):
    tutorial_id: str
    step_index: int = Field(ge=0)
    question: str | None = Field(default=None, max_length=300)
    mode: Literal["answer", "simpler"] = "answer"
