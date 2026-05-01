import pytest
from datetime import datetime

from app.schemas import TaskCreate, TaskUpdate, TaskResponse
from app.models import Priority, Status


class TestTaskCreate:
    def test_valid_minimal(self):
        t = TaskCreate(title="Hello")
        assert t.title == "Hello"
        assert t.description == ""
        assert t.priority == Priority.MEDIUM
        assert t.due_date is None

    def test_valid_all_fields(self):
        t = TaskCreate(
            title="T",
            description="D",
            priority=Priority.HIGH,
            due_date=datetime(2026, 1, 1),
        )
        assert t.priority == Priority.HIGH

    def test_empty_title_rejected(self):
        with pytest.raises(ValueError):
            TaskCreate(title="")

    def test_whitespace_only_title_rejected(self):
        with pytest.raises(ValueError):
            TaskCreate(title="   ")

    def test_title_stripped(self):
        t = TaskCreate(title="  hello  ")
        assert t.title == "hello"

    def test_title_max_length(self):
        t = TaskCreate(title="x" * 200)
        assert len(t.title) == 200

    def test_title_exceeds_max_length(self):
        with pytest.raises(ValueError):
            TaskCreate(title="x" * 201)

    def test_description_max_length(self):
        t = TaskCreate(title="T", description="x" * 2000)
        assert len(t.description) == 2000

    def test_description_exceeds_max_length(self):
        with pytest.raises(ValueError):
            TaskCreate(title="T", description="x" * 2001)

    def test_invalid_priority_rejected(self):
        with pytest.raises(ValueError):
            TaskCreate(title="T", priority="urgent")

    def test_all_valid_priorities(self):
        for p in Priority:
            t = TaskCreate(title="T", priority=p)
            assert t.priority == p

    def test_title_single_char(self):
        t = TaskCreate(title="A")
        assert t.title == "A"

    def test_title_unicode(self):
        t = TaskCreate(title="日本語タスク")
        assert t.title == "日本語タスク"

    def test_description_default_is_empty_string(self):
        t = TaskCreate(title="T")
        assert t.description == ""
        assert isinstance(t.description, str)

    def test_due_date_can_be_set(self):
        dt = datetime(2026, 6, 15, 12, 0)
        t = TaskCreate(title="T", due_date=dt)
        assert t.due_date == dt

    def test_due_date_default_none(self):
        t = TaskCreate(title="T")
        assert t.due_date is None

    def test_title_with_special_characters(self):
        t = TaskCreate(title="<script>alert('xss')</script>")
        assert t.title == "<script>alert('xss')</script>"

    def test_description_empty_string_valid(self):
        t = TaskCreate(title="T", description="")
        assert t.description == ""

    def test_description_with_newlines(self):
        t = TaskCreate(title="T", description="line1\nline2\nline3")
        assert "line1" in t.description

    def test_title_exactly_at_boundary_200(self):
        t = TaskCreate(title="A" * 200)
        assert len(t.title) == 200

    def test_title_one_over_boundary_201(self):
        with pytest.raises(ValueError):
            TaskCreate(title="A" * 201)

    def test_description_one_over_boundary_2001(self):
        with pytest.raises(ValueError):
            TaskCreate(title="T", description="A" * 2001)


class TestTaskUpdate:
    def test_all_none(self):
        u = TaskUpdate()
        assert u.title is None
        assert u.description is None
        assert u.priority is None
        assert u.status is None
        assert u.due_date is None

    def test_partial_update(self):
        u = TaskUpdate(title="New")
        assert u.title == "New"
        assert u.description is None

    def test_empty_title_rejected(self):
        with pytest.raises(ValueError):
            TaskUpdate(title="")

    def test_whitespace_title_rejected(self):
        with pytest.raises(ValueError):
            TaskUpdate(title="   ")

    def test_title_stripped(self):
        u = TaskUpdate(title="  hello  ")
        assert u.title == "hello"

    def test_none_title_is_valid(self):
        u = TaskUpdate(title=None)
        assert u.title is None

    def test_exclude_unset(self):
        u = TaskUpdate(title="New")
        dumped = u.model_dump(exclude_unset=True)
        assert "title" in dumped
        assert "description" not in dumped

    def test_title_too_long(self):
        with pytest.raises(ValueError):
            TaskUpdate(title="x" * 201)

    def test_title_max_length(self):
        u = TaskUpdate(title="x" * 200)
        assert u.title == "x" * 200

    def test_description_too_long(self):
        with pytest.raises(ValueError):
            TaskUpdate(description="x" * 2001)

    def test_description_max_length(self):
        u = TaskUpdate(description="x" * 2000)
        assert len(u.description) == 2000

    def test_invalid_priority_rejected(self):
        with pytest.raises(ValueError):
            TaskUpdate(priority="super_high")

    def test_invalid_status_rejected(self):
        with pytest.raises(ValueError):
            TaskUpdate(status="cancelled")

    def test_all_valid_priorities(self):
        for p in Priority:
            u = TaskUpdate(priority=p)
            assert u.priority == p

    def test_all_valid_statuses(self):
        for s in Status:
            u = TaskUpdate(status=s)
            assert u.status == s

    def test_due_date_set(self):
        dt = datetime(2026, 12, 31)
        u = TaskUpdate(due_date=dt)
        assert u.due_date == dt

    def test_due_date_can_be_none(self):
        u = TaskUpdate(due_date=None)
        assert u.due_date is None

    def test_description_set(self):
        u = TaskUpdate(description="Updated desc")
        assert u.description == "Updated desc"

    def test_description_none_is_valid(self):
        u = TaskUpdate(description=None)
        assert u.description is None

    def test_all_fields_set(self):
        dt = datetime(2027, 1, 1)
        u = TaskUpdate(
            title="New Title",
            description="New Desc",
            priority=Priority.CRITICAL,
            status=Status.IN_PROGRESS,
            due_date=dt,
        )
        assert u.title == "New Title"
        assert u.description == "New Desc"
        assert u.priority == Priority.CRITICAL
        assert u.status == Status.IN_PROGRESS
        assert u.due_date == dt

    def test_model_dump_excludes_unset_only(self):
        u = TaskUpdate(title="A", status=Status.DONE)
        dumped = u.model_dump(exclude_unset=True)
        assert set(dumped.keys()) == {"title", "status"}
        assert "description" not in dumped
        assert "priority" not in dumped
        assert "due_date" not in dumped

    def test_model_dump_includes_none_when_set(self):
        u = TaskUpdate(title=None)
        dumped = u.model_dump(exclude_unset=True)
        assert "title" in dumped
        assert dumped["title"] is None

    def test_model_dump_excludes_unset_when_default_none(self):
        u = TaskUpdate()
        dumped = u.model_dump(exclude_unset=True)
        assert dumped == {}


class TestTaskResponse:
    def test_from_attributes_config(self):
        assert TaskResponse.model_config.get("from_attributes") is True

    def test_all_fields_present(self):
        fields = TaskResponse.model_fields
        expected = {"id", "title", "description", "priority", "status", "due_date", "created_at", "updated_at"}
        assert set(fields.keys()) == expected

    def test_from_orm_object(self, db_session):
        from app.schemas import TaskCreate
        from app.services import TaskService

        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Response Test"))
        response = TaskResponse.model_validate(task)
        assert response.id == task.id
        assert response.title == "Response Test"
        assert isinstance(response.priority, str)
        assert isinstance(response.status, str)
        assert isinstance(response.created_at, datetime)
        assert isinstance(response.updated_at, datetime)
