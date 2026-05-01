from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Priority, Status, Task, VALID_TRANSITIONS
from app.schemas import TaskCreate, TaskUpdate


class InvalidTransitionError(Exception):
    pass


class TaskNotFoundError(Exception):
    pass


class TaskService:
    def __init__(self, db: Session):
        self.db = db

    def create_task(self, data: TaskCreate) -> Task:
        task = Task(
            title=data.title,
            description=data.description,
            priority=data.priority.value,
            status=Status.TODO.value,
            due_date=data.due_date,
        )
        self.db.add(task)
        self.db.commit()
        self.db.refresh(task)
        return task

    def get_task(self, task_id: int) -> Task:
        task = self.db.get(Task, task_id)
        if task is None:
            raise TaskNotFoundError(f"Task {task_id} not found")
        return task

    def list_tasks(
        self,
        status: Status | None = None,
        priority: Priority | None = None,
        due_before: datetime | None = None,
    ) -> list[Task]:
        stmt = select(Task).order_by(Task.created_at.desc())
        if status is not None:
            stmt = stmt.where(Task.status == status.value)
        if priority is not None:
            stmt = stmt.where(Task.priority == priority.value)
        if due_before is not None:
            stmt = stmt.where(Task.due_date <= due_before)
        return list(self.db.scalars(stmt).all())

    def update_task(self, task_id: int, data: TaskUpdate) -> Task:
        task = self.get_task(task_id)
        if data.status is not None:
            self._validate_transition(Status(task.status), data.status)
        update_data = data.model_dump(exclude_unset=True)
        if "priority" in update_data:
            update_data["priority"] = data.priority.value
        if "status" in update_data:
            update_data["status"] = data.status.value
        for field, value in update_data.items():
            setattr(task, field, value)
        self.db.commit()
        self.db.refresh(task)
        return task

    def delete_task(self, task_id: int) -> None:
        task = self.get_task(task_id)
        self.db.delete(task)
        self.db.commit()

    def _validate_transition(self, current: Status, target: Status) -> None:
        if current == target:
            return
        allowed = VALID_TRANSITIONS.get(current, set())
        if target not in allowed:
            raise InvalidTransitionError(
                f"Cannot transition from {current.value} to {target.value}"
            )
