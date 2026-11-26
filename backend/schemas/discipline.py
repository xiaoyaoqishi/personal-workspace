from typing import Literal, Optional
from uuid import uuid4
from pydantic import BaseModel, Field, field_validator, model_validator


class PlanSlot(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()), min_length=1, max_length=80)
    start: str = Field(pattern=r'^([01]\d|2[0-3]):[0-5]\d$')
    end: str = Field(pattern=r'^([01]\d|2[0-3]):[0-5]\d$')
    theme: str = Field(min_length=1, max_length=100)
    status: Literal['pending', 'aligned', 'partial', 'off_track'] = 'pending'
    notes: str = Field(default='', max_length=5000)
    included: bool = True

    @field_validator('theme')
    @classmethod
    def clean_theme(cls, value):
        value = value.strip()
        if not value:
            raise ValueError('主题不能为空')
        return value

    @model_validator(mode='after')
    def check_times(self):
        if self.start >= self.end:
            raise ValueError('结束时间应晚于开始时间；跨午夜请拆分时段')
        return self


class PlanWrite(BaseModel):
    revision: int = Field(default=0, ge=0)
    day_revision: Optional[int] = Field(default=None, ge=0)
    slots: list[PlanSlot] = Field(max_length=48)

    @model_validator(mode='after')
    def check_overlap(self):
        if len({slot.id for slot in self.slots}) != len(self.slots):
            raise ValueError('时段标识不能重复')
        ordered = sorted(self.slots, key=lambda slot: slot.start)
        if any(a.end > b.start for a, b in zip(ordered, ordered[1:])):
            raise ValueError('时间段不能重叠')
        return self
