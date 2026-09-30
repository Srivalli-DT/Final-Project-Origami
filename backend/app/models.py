"""Pydantic request/response models shared by the API routes."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class Fold(BaseModel):
    vertices_coords: list[list[float]]
    edges_vertices: list[list[int]]
    edges_assignment: list[str]
    faces_vertices: list[list[int]] = Field(default_factory=list)


class GuideRequest(BaseModel):
    fold: Fold


class NarrateRequest(BaseModel):
    step: dict
    mode: Literal["normal", "simpler"] = "normal"


class PatternCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    fold: Fold
