from sqlalchemy import Column, Integer, String, Text, UniqueConstraint
from core.db import Base


class DisciplinePlan(Base):
    __tablename__ = 'discipline_plans'
    __table_args__ = (UniqueConstraint('username', 'plan_key'),)

    id = Column(Integer, primary_key=True)
    username = Column(String(100), nullable=False, index=True)
    plan_key = Column(String(20), nullable=False)
    slots_json = Column(Text, nullable=False)
    revision = Column(Integer, nullable=False, default=1)


class DisciplineRoutineVersion(Base):
    __tablename__ = 'discipline_routine_versions'
    __table_args__ = (UniqueConstraint('username', 'revision'),)

    id = Column(Integer, primary_key=True)
    username = Column(String(100), nullable=False, index=True)
    revision = Column(Integer, nullable=False)
    changed_at = Column(String(40), nullable=True)
    effective_date = Column(String(10), nullable=True)
    kind = Column(String(20), nullable=False)
    slots_json = Column(Text, nullable=False)
    day_before_json = Column(Text, nullable=True)
    day_after_json = Column(Text, nullable=True)
