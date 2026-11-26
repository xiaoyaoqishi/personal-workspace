from datetime import datetime, timezone
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, StrictBool, field_validator, model_validator

Category = Literal['work', 'study', 'social', 'entertainment', 'games', 'finance', 'tools', 'other']


class ScreenDeviceInput(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    key: str = Field(min_length=1, max_length=120, pattern=r'^[A-Za-z0-9_.-]+$')
    name: str = Field(min_length=1, max_length=80)
    kind: Literal['mac', 'iphone', 'ipad', 'other'] = 'other'


class ScreenEventInput(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True, allow_inf_nan=False)
    device: str = Field(min_length=1, max_length=120)
    time: datetime
    app: str = Field(min_length=1, max_length=250)
    starting: StrictBool

    @field_validator('time')
    @classmethod
    def aware_time(cls, value):
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError('事件时间必须包含时区')
        value = value.astimezone(timezone.utc)
        if value.year < 2001 or value > datetime.now(timezone.utc):
            raise ValueError('事件时间应为 2001 年至当前时间')
        return value


class ScreenImportInput(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    version: Literal[1]
    source: str = Field(default='Biome App.InFocus', min_length=1, max_length=120)
    devices: list[ScreenDeviceInput] = Field(min_length=1, max_length=32)
    events: list[ScreenEventInput] = Field(min_length=1, max_length=50000)

    @model_validator(mode='after')
    def known_devices(self):
        keys = {device.key for device in self.devices}
        if len(keys) != len(self.devices):
            raise ValueError('设备标识不能重复')
        if any(event.device not in keys for event in self.events):
            raise ValueError('事件引用了未声明的设备')
        return self


class ScreenDeviceEdit(BaseModel):
    name: str = Field(min_length=1, max_length=80)

    @field_validator('name')
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError('名称不能为空')
        return value.strip()


class ScreenAppEdit(ScreenDeviceEdit):
    app: str = Field(min_length=1, max_length=250)
    category: Category
