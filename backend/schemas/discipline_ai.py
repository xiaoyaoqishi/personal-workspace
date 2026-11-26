from datetime import date
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class AIOptions(BaseModel):
    model_config = ConfigDict(extra='forbid')
    focus: Literal['balanced', 'routine', 'screen'] = 'balanced'
    detail: Literal['concise', 'detailed'] = 'concise'


class AISettings(AIOptions):
    automatic: bool = False
    include_notes: bool = False


class AIGenerate(AIOptions):
    period: Literal['day', 'week'] = 'day'
    anchor: date
    regenerate: bool = False


class AICard(BaseModel):
    model_config = ConfigDict(extra='forbid')
    title: str = Field(min_length=1, max_length=80)
    body: str = Field(min_length=1, max_length=700)
    kind: Literal['observation', 'hypothesis'] = 'observation'
    evidence_ids: list[str] = Field(min_length=1, max_length=5)


class AIContent(BaseModel):
    model_config = ConfigDict(extra='forbid')
    title: str = Field(min_length=1, max_length=80)
    summary: str = Field(min_length=1, max_length=900)
    strengths: list[AICard] = Field(max_length=3)
    attention: list[AICard] = Field(max_length=3)
    patterns: list[AICard] = Field(max_length=3)
    actions: list[AICard] = Field(min_length=1, max_length=3)
