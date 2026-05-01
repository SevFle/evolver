from datetime import datetime
from enum import Enum

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Priority(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class Status(str, Enum):
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    DONE = "done"


VALID_TRANSITIONS: dict[Status, set[Status]] = {
    Status.TODO: {Status.IN_PROGRESS},
    Status.IN_PROGRESS: {Status.DONE, Status.TODO},
    Status.DONE: {Status.IN_PROGRESS},
}


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(String(2000), nullable=False, default="")
    priority: Mapped[str] = mapped_column(String(20), nullable=False, default=Priority.MEDIUM.value)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default=Status.TODO.value)
    due_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
