import pytest
from datetime import datetime

from app.schemas import TaskCreate, TaskUpdate, TaskResponse
from app.models import Priority, Status


class TestTaskCreateExtra:
    def test_title_with_tabs(self):
        t = TaskCreate(title="\tTabbed\t")
        assert t.title == "Tabbed"

    def test_title_with_mixed_whitespace(self):
        t = TaskCreate(title="  \t hello \n  ")
        assert t.title == "hello"

    def test_description_with_tabs_and_newlines(self):
        t = TaskCreate(title="T", description="line1\tline2\nline3")
        assert "\t" in t.description
        assert "\n" in t.description

    def test_all_priority_values_roundtrip(self):
        for p in Priority:
            t = TaskCreate(title="T", priority=p)
            assert t.priority == p
            assert t.priority.value in ["low", "medium", "high", "critical"]

    def test_default_values(self):
        t = TaskCreate(title="T")
        assert t.description == ""
        assert t.priority == Priority.MEDIUM
        assert t.due_date is None

    def test_title_exactly_1_char(self):
        t = TaskCreate(title="X")
        assert len(t.title) == 1

    def test_title_exactly_200_chars(self):
        t = TaskCreate(title="X" * 200)
        assert len(t.title) == 200

    def test_description_exactly_2000_chars(self):
        t = TaskCreate(title="T", description="D" * 2000)
        assert len(t.description) == 2000


class TestTaskUpdateExtra:
    def test_title_none_preserved(self):
        u = TaskUpdate(title=None)
        dumped = u.model_dump(exclude_unset=True)
        assert "title" in dumped
        assert dumped["title"] is None

    def test_description_none_preserved(self):
        u = TaskUpdate(description=None)
        dumped = u.model_dump(exclude_unset=True)
        assert "description" in dumped
        assert dumped["description"] is None

    def test_status_set_to_done(self):
        u = TaskUpdate(status=Status.DONE)
        assert u.status == Status.DONE

    def test_status_set_to_todo(self):
        u = TaskUpdate(status=Status.TODO)
        assert u.status == Status.TODO

    def test_priority_set_to_low(self):
        u = TaskUpdate(priority=Priority.LOW)
        assert u.priority == Priority.LOW

    def test_priority_set_to_critical(self):
        u = TaskUpdate(priority=Priority.CRITICAL)
        assert u.priority == Priority.CRITICAL

    def test_multiple_set_fields(self):
        u = TaskUpdate(title="A", description="B", priority=Priority.HIGH, status=Status.IN_PROGRESS)
        dumped = u.model_dump(exclude_unset=True)
        assert len(dumped) == 4

    def test_title_with_tabs_stripped(self):
        u = TaskUpdate(title="\tTabbed\t")
        assert u.title == "Tabbed"

    def test_due_date_set_to_datetime(self):
        dt = datetime(2027, 6, 15, 12, 0)
        u = TaskUpdate(due_date=dt)
        assert u.due_date == dt

    def test_empty_body_dumps_to_empty_dict(self):
        u = TaskUpdate()
        assert u.model_dump(exclude_unset=True) == {}

    def test_title_exactly_200_chars_update(self):
        u = TaskUpdate(title="X" * 200)
        assert len(u.title) == 200

    def test_description_exactly_2000_chars_update(self):
        u = TaskUpdate(description="D" * 2000)
        assert len(u.description) == 2000


class TestTaskResponseExtra:
    def test_model_config_from_attributes(self):
        assert TaskResponse.model_config["from_attributes"] is True

    def test_field_count(self):
        assert len(TaskResponse.model_fields) == 8

    def test_all_field_names(self):
        expected = {"id", "title", "description", "priority", "status", "due_date", "created_at", "updated_at"}
        assert set(TaskResponse.model_fields.keys()) == expected

    def test_from_task_model(self, db_session):
        from app.services import TaskService

        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Response", priority=Priority.HIGH))
        response = TaskResponse.model_validate(task)
        assert response.id == task.id
        assert response.title == "Response"
        assert response.priority == "high"
        assert response.status == "todo"
        assert isinstance(response.created_at, datetime)
        assert isinstance(response.updated_at, datetime)

    def test_from_task_with_due_date(self, db_session):
        from app.services import TaskService

        due = datetime(2026, 12, 31)
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T", due_date=due))
        response = TaskResponse.model_validate(task)
        assert response.due_date == due

    def test_from_task_without_due_date(self, db_session):
        from app.services import TaskService

        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        response = TaskResponse.model_validate(task)
        assert response.due_date is None
