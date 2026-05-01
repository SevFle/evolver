from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Priority, Status
from app.schemas import TaskCreate, TaskResponse, TaskUpdate
from app.services import InvalidTransitionError, TaskNotFoundError, TaskService

router = APIRouter(prefix="/tasks", tags=["tasks"])


def _service(db: Session = Depends(get_db)) -> TaskService:
    return TaskService(db)


def _parse_dt(value: str | None) -> datetime | None:
    if value is None:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid datetime: {value}")


@router.post("/", response_model=TaskResponse, status_code=201)
def create_task(data: TaskCreate, svc: TaskService = Depends(_service)):
    return svc.create_task(data)


@router.get("/", response_model=list[TaskResponse])
def list_tasks(
    status: Status | None = Query(default=None),
    priority: Priority | None = Query(default=None),
    due_before: str | None = Query(default=None),
    svc: TaskService = Depends(_service),
):
    return svc.list_tasks(status=status, priority=priority, due_before=_parse_dt(due_before))


@router.get("/{task_id}", response_model=TaskResponse)
def get_task(task_id: int, svc: TaskService = Depends(_service)):
    try:
        return svc.get_task(task_id)
    except TaskNotFoundError:
        raise HTTPException(status_code=404, detail="Task not found")


@router.patch("/{task_id}", response_model=TaskResponse)
def update_task(task_id: int, data: TaskUpdate, svc: TaskService = Depends(_service)):
    try:
        return svc.update_task(task_id, data)
    except TaskNotFoundError:
        raise HTTPException(status_code=404, detail="Task not found")
    except InvalidTransitionError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.delete("/{task_id}", status_code=204)
def delete_task(task_id: int, svc: TaskService = Depends(_service)):
    try:
        svc.delete_task(task_id)
    except TaskNotFoundError:
        raise HTTPException(status_code=404, detail="Task not found")
