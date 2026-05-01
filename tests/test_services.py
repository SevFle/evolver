import pytest
from datetime import datetime, timedelta

from app.models import Priority, Status, VALID_TRANSITIONS
from app.schemas import TaskCreate, TaskUpdate
from app.services import TaskService, InvalidTransitionError, TaskNotFoundError


class TestTaskServiceCreate:
    def test_create_task_defaults(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="My Task"))
        assert task.id == 1
        assert task.title == "My Task"
        assert task.description == ""
        assert task.priority == Priority.MEDIUM.value
        assert task.status == Status.TODO.value
        assert task.due_date is None
        assert task.created_at is not None

    def test_create_task_with_all_fields(self, db_session):
        svc = TaskService(db_session)
        due = datetime(2026, 12, 31, 23, 59)
        task = svc.create_task(TaskCreate(
            title="Important",
            description="Do this",
            priority=Priority.CRITICAL,
            due_date=due,
        ))
        assert task.title == "Important"
        assert task.description == "Do this"
        assert task.priority == Priority.CRITICAL.value
        assert task.due_date == due

    def test_create_task_strips_title_whitespace(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="  spaced  "))
        assert task.title == "spaced"

    def test_create_multiple_tasks_increments_id(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="First"))
        svc.create_task(TaskCreate(title="Second"))
        task = svc.create_task(TaskCreate(title="Third"))
        assert task.id == 3

    def test_create_task_with_low_priority(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Low", priority=Priority.LOW))
        assert task.priority == Priority.LOW.value

    def test_create_task_with_high_priority(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="High", priority=Priority.HIGH))
        assert task.priority == Priority.HIGH.value

    def test_create_task_with_description(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T", description="A detailed description"))
        assert task.description == "A detailed description"

    def test_create_task_with_past_due_date(self, db_session):
        svc = TaskService(db_session)
        past = datetime(2020, 1, 1)
        task = svc.create_task(TaskCreate(title="T", due_date=past))
        assert task.due_date == past

    def test_create_task_with_future_due_date(self, db_session):
        svc = TaskService(db_session)
        future = datetime(2099, 12, 31)
        task = svc.create_task(TaskCreate(title="T", due_date=future))
        assert task.due_date == future

    def test_create_task_returns_task_type(self, db_session):
        from app.models import Task

        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        assert isinstance(task, Task)


class TestTaskServiceGet:
    def test_get_existing_task(self, db_session):
        svc = TaskService(db_session)
        created = svc.create_task(TaskCreate(title="Find me"))
        found = svc.get_task(created.id)
        assert found.id == created.id
        assert found.title == "Find me"

    def test_get_nonexistent_task_raises(self, db_session):
        svc = TaskService(db_session)
        with pytest.raises(TaskNotFoundError, match="Task 999 not found"):
            svc.get_task(999)

    def test_get_task_returns_same_object_identity(self, db_session):
        svc = TaskService(db_session)
        created = svc.create_task(TaskCreate(title="Same"))
        found = svc.get_task(created.id)
        assert found.id == created.id
        assert found.title == created.title
        assert found.status == created.status

    def test_get_task_with_negative_id_raises(self, db_session):
        svc = TaskService(db_session)
        with pytest.raises(TaskNotFoundError):
            svc.get_task(-1)

    def test_get_task_with_zero_id_raises(self, db_session):
        svc = TaskService(db_session)
        with pytest.raises(TaskNotFoundError):
            svc.get_task(0)

    def test_get_task_error_message_format(self, db_session):
        svc = TaskService(db_session)
        with pytest.raises(TaskNotFoundError, match=r"Task \d+ not found"):
            svc.get_task(42)

    def test_get_task_after_other_deleted(self, db_session):
        svc = TaskService(db_session)
        t1 = svc.create_task(TaskCreate(title="Keep"))
        t2 = svc.create_task(TaskCreate(title="Delete"))
        svc.delete_task(t2.id)
        found = svc.get_task(t1.id)
        assert found.title == "Keep"


class TestTaskServiceList:
    def test_list_empty(self, db_session):
        svc = TaskService(db_session)
        assert svc.list_tasks() == []

    def test_list_all_tasks(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="A"))
        svc.create_task(TaskCreate(title="B"))
        tasks = svc.list_tasks()
        assert len(tasks) == 2
        assert {t.title for t in tasks} == {"A", "B"}

    def test_list_filter_by_status(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="Todo"))
        task2 = svc.create_task(TaskCreate(title="Progress"))
        svc.update_task(task2.id, TaskUpdate(status=Status.IN_PROGRESS))
        result = svc.list_tasks(status=Status.IN_PROGRESS)
        assert len(result) == 1
        assert result[0].title == "Progress"

    def test_list_filter_by_priority(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="Low", priority=Priority.LOW))
        svc.create_task(TaskCreate(title="High", priority=Priority.HIGH))
        result = svc.list_tasks(priority=Priority.HIGH)
        assert len(result) == 1
        assert result[0].title == "High"

    def test_list_filter_by_due_before(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="Past", due_date=datetime(2025, 1, 1)))
        svc.create_task(TaskCreate(title="Future", due_date=datetime(2030, 1, 1)))
        result = svc.list_tasks(due_before=datetime(2026, 1, 1))
        assert len(result) == 1
        assert result[0].title == "Past"

    def test_list_combined_filters(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="Match", priority=Priority.HIGH, due_date=datetime(2025, 6, 1)))
        svc.create_task(TaskCreate(title="Wrong priority", priority=Priority.LOW, due_date=datetime(2025, 6, 1)))
        svc.create_task(TaskCreate(title="Wrong date", priority=Priority.HIGH, due_date=datetime(2030, 1, 1)))
        result = svc.list_tasks(priority=Priority.HIGH, due_before=datetime(2026, 1, 1))
        assert len(result) == 1
        assert result[0].title == "Match"

    def test_list_ordered_by_created_at_desc(self, db_session):
        from sqlalchemy import text
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="First"))
        db_session.execute(text("UPDATE tasks SET created_at = datetime('now', '-2 seconds') WHERE title = 'First'"))
        db_session.commit()
        svc.create_task(TaskCreate(title="Second"))
        db_session.execute(text("UPDATE tasks SET created_at = datetime('now', '-1 second') WHERE title = 'Second'"))
        db_session.commit()
        svc.create_task(TaskCreate(title="Third"))
        tasks = svc.list_tasks()
        titles = [t.title for t in tasks]
        assert titles[0] == "Third"
        assert titles[-1] == "First"

    def test_list_filter_by_status_todo(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="T1"))
        t2 = svc.create_task(TaskCreate(title="T2"))
        svc.update_task(t2.id, TaskUpdate(status=Status.IN_PROGRESS))
        result = svc.list_tasks(status=Status.TODO)
        assert len(result) == 1
        assert result[0].title == "T1"

    def test_list_filter_by_status_done(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Done task"))
        svc.update_task(task.id, TaskUpdate(status=Status.IN_PROGRESS))
        svc.update_task(task.id, TaskUpdate(status=Status.DONE))
        result = svc.list_tasks(status=Status.DONE)
        assert len(result) == 1
        assert result[0].status == Status.DONE.value

    def test_list_no_match_returns_empty(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="T"))
        result = svc.list_tasks(status=Status.DONE)
        assert result == []

    def test_list_tasks_with_null_due_date_excluded_by_due_before(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="No due date"))
        svc.create_task(TaskCreate(title="Has due date", due_date=datetime(2025, 1, 1)))
        result = svc.list_tasks(due_before=datetime(2026, 1, 1))
        assert len(result) == 1
        assert result[0].title == "Has due date"

    def test_list_all_three_filters(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(
            title="Match",
            priority=Priority.HIGH,
            due_date=datetime(2025, 6, 1),
        ))
        t2 = svc.create_task(TaskCreate(
            title="Wrong status",
            priority=Priority.HIGH,
            due_date=datetime(2025, 6, 1),
        ))
        svc.update_task(t2.id, TaskUpdate(status=Status.IN_PROGRESS))
        result = svc.list_tasks(
            status=Status.TODO,
            priority=Priority.HIGH,
            due_before=datetime(2026, 1, 1),
        )
        assert len(result) == 1
        assert result[0].title == "Match"

    def test_list_due_before_exact_boundary(self, db_session):
        svc = TaskService(db_session)
        boundary = datetime(2026, 1, 1, 0, 0, 0)
        svc.create_task(TaskCreate(title="Exact", due_date=boundary))
        svc.create_task(TaskCreate(title="After", due_date=datetime(2026, 1, 1, 0, 0, 1)))
        result = svc.list_tasks(due_before=boundary)
        assert len(result) == 1
        assert result[0].title == "Exact"

    def test_list_returns_list_type(self, db_session):
        svc = TaskService(db_session)
        result = svc.list_tasks()
        assert isinstance(result, list)


class TestTaskServiceUpdate:
    def test_update_title(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Old"))
        updated = svc.update_task(task.id, TaskUpdate(title="New"))
        assert updated.title == "New"

    def test_update_description(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        updated = svc.update_task(task.id, TaskUpdate(description="Desc"))
        assert updated.description == "Desc"

    def test_update_priority(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        updated = svc.update_task(task.id, TaskUpdate(priority=Priority.CRITICAL))
        assert updated.priority == Priority.CRITICAL.value

    def test_valid_transition_todo_to_in_progress(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        updated = svc.update_task(task.id, TaskUpdate(status=Status.IN_PROGRESS))
        assert updated.status == Status.IN_PROGRESS.value

    def test_valid_transition_in_progress_to_done(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        svc.update_task(task.id, TaskUpdate(status=Status.IN_PROGRESS))
        updated = svc.update_task(task.id, TaskUpdate(status=Status.DONE))
        assert updated.status == Status.DONE.value

    def test_valid_transition_done_to_in_progress(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        svc.update_task(task.id, TaskUpdate(status=Status.IN_PROGRESS))
        svc.update_task(task.id, TaskUpdate(status=Status.DONE))
        updated = svc.update_task(task.id, TaskUpdate(status=Status.IN_PROGRESS))
        assert updated.status == Status.IN_PROGRESS.value

    def test_valid_transition_in_progress_to_todo(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        svc.update_task(task.id, TaskUpdate(status=Status.IN_PROGRESS))
        updated = svc.update_task(task.id, TaskUpdate(status=Status.TODO))
        assert updated.status == Status.TODO.value

    def test_same_status_transition_allowed(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        updated = svc.update_task(task.id, TaskUpdate(status=Status.TODO))
        assert updated.status == Status.TODO.value

    def test_invalid_transition_todo_to_done_raises(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        with pytest.raises(InvalidTransitionError, match="todo.*done"):
            svc.update_task(task.id, TaskUpdate(status=Status.DONE))

    def test_invalid_transition_done_to_todo_raises(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        svc.update_task(task.id, TaskUpdate(status=Status.IN_PROGRESS))
        svc.update_task(task.id, TaskUpdate(status=Status.DONE))
        with pytest.raises(InvalidTransitionError, match="done.*todo"):
            svc.update_task(task.id, TaskUpdate(status=Status.TODO))

    def test_update_nonexistent_task_raises(self, db_session):
        svc = TaskService(db_session)
        with pytest.raises(TaskNotFoundError):
            svc.update_task(999, TaskUpdate(title="X"))

    def test_update_only_specified_fields(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Original", description="Keep"))
        updated = svc.update_task(task.id, TaskUpdate(title="Changed"))
        assert updated.title == "Changed"
        assert updated.description == "Keep"

    def test_update_due_date(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        new_due = datetime(2027, 6, 15)
        updated = svc.update_task(task.id, TaskUpdate(due_date=new_due))
        assert updated.due_date == new_due

    def test_update_multiple_fields_simultaneously(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Old", description="Old desc"))
        updated = svc.update_task(task.id, TaskUpdate(
            title="New",
            description="New desc",
            priority=Priority.HIGH,
        ))
        assert updated.title == "New"
        assert updated.description == "New desc"
        assert updated.priority == Priority.HIGH.value

    def test_update_description_to_empty(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T", description="Something"))
        updated = svc.update_task(task.id, TaskUpdate(description=""))
        assert updated.description == ""

    def test_update_priority_to_low(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T", priority=Priority.HIGH))
        updated = svc.update_task(task.id, TaskUpdate(priority=Priority.LOW))
        assert updated.priority == Priority.LOW.value

    def test_invalid_transition_error_message(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        with pytest.raises(InvalidTransitionError) as exc_info:
            svc.update_task(task.id, TaskUpdate(status=Status.DONE))
        assert "todo" in str(exc_info.value).lower()
        assert "done" in str(exc_info.value).lower()

    def test_same_status_in_progress_allowed(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        svc.update_task(task.id, TaskUpdate(status=Status.IN_PROGRESS))
        updated = svc.update_task(task.id, TaskUpdate(status=Status.IN_PROGRESS))
        assert updated.status == Status.IN_PROGRESS.value

    def test_same_status_done_allowed(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        svc.update_task(task.id, TaskUpdate(status=Status.IN_PROGRESS))
        svc.update_task(task.id, TaskUpdate(status=Status.DONE))
        updated = svc.update_task(task.id, TaskUpdate(status=Status.DONE))
        assert updated.status == Status.DONE.value

    def test_update_clears_due_date_with_none(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T", due_date=datetime(2026, 1, 1)))
        updated = svc.update_task(task.id, TaskUpdate(due_date=None))
        assert updated.due_date is None

    def test_update_negative_id_raises(self, db_session):
        svc = TaskService(db_session)
        with pytest.raises(TaskNotFoundError):
            svc.update_task(-1, TaskUpdate(title="X"))


class TestTaskServiceDelete:
    def test_delete_existing_task(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Delete me"))
        svc.delete_task(task.id)
        assert svc.list_tasks() == []

    def test_delete_nonexistent_task_raises(self, db_session):
        svc = TaskService(db_session)
        with pytest.raises(TaskNotFoundError):
            svc.delete_task(999)

    def test_delete_preserves_other_tasks(self, db_session):
        svc = TaskService(db_session)
        t1 = svc.create_task(TaskCreate(title="Keep"))
        t2 = svc.create_task(TaskCreate(title="Delete"))
        svc.delete_task(t2.id)
        remaining = svc.list_tasks()
        assert len(remaining) == 1
        assert remaining[0].title == "Keep"

    def test_delete_negative_id_raises(self, db_session):
        svc = TaskService(db_session)
        with pytest.raises(TaskNotFoundError):
            svc.delete_task(-1)

    def test_delete_zero_id_raises(self, db_session):
        svc = TaskService(db_session)
        with pytest.raises(TaskNotFoundError):
            svc.delete_task(0)

    def test_delete_then_create_reuses_functionality(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T1"))
        svc.delete_task(task.id)
        new_task = svc.create_task(TaskCreate(title="T2"))
        assert new_task.title == "T2"
        assert len(svc.list_tasks()) == 1


class TestValidTransitions:
    def test_todo_allowed_transitions(self):
        assert VALID_TRANSITIONS[Status.TODO] == {Status.IN_PROGRESS}

    def test_in_progress_allowed_transitions(self):
        assert VALID_TRANSITIONS[Status.IN_PROGRESS] == {Status.DONE, Status.TODO}

    def test_done_allowed_transitions(self):
        assert VALID_TRANSITIONS[Status.DONE] == {Status.IN_PROGRESS}
