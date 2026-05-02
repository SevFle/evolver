import pytest
from datetime import datetime, timedelta

from app.models import Priority, Status, Task, VALID_TRANSITIONS
from app.schemas import TaskCreate, TaskUpdate
from app.services import TaskService, InvalidTransitionError, TaskNotFoundError


class TestTaskServiceInit:
    def test_service_stores_db_session(self, db_session):
        svc = TaskService(db_session)
        assert svc.db is db_session

    def test_service_with_fresh_session_each_time(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="First"))
        svc2 = TaskService(db_session)
        assert len(svc2.list_tasks()) == 1


class TestTaskServiceCreateExtra:
    def test_create_task_with_medium_priority_explicit(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T", priority=Priority.MEDIUM))
        assert task.priority == "medium"

    def test_create_task_with_critical_priority(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T", priority=Priority.CRITICAL))
        assert task.priority == "critical"

    def test_create_task_with_description_and_due_date(self, db_session):
        svc = TaskService(db_session)
        due = datetime(2026, 6, 15, 12, 0)
        task = svc.create_task(TaskCreate(
            title="Full",
            description="Complete task",
            priority=Priority.HIGH,
            due_date=due,
        ))
        assert task.title == "Full"
        assert task.description == "Complete task"
        assert task.priority == Priority.HIGH.value
        assert task.status == Status.TODO.value
        assert task.due_date == due

    def test_create_task_auto_increment_ids(self, db_session):
        svc = TaskService(db_session)
        ids = []
        for i in range(10):
            t = svc.create_task(TaskCreate(title=f"Task {i}"))
            ids.append(t.id)
        assert ids == sorted(ids)
        assert len(set(ids)) == 10

    def test_create_task_updated_at_equals_created_at_initially(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        assert task.created_at is not None
        assert task.updated_at is not None


class TestTaskServiceGetExtra:
    def test_get_task_after_update(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Original"))
        svc.update_task(task.id, TaskUpdate(title="Updated"))
        found = svc.get_task(task.id)
        assert found.title == "Updated"

    def test_get_task_after_delete_other(self, db_session):
        svc = TaskService(db_session)
        t1 = svc.create_task(TaskCreate(title="Keep"))
        t2 = svc.create_task(TaskCreate(title="Delete"))
        svc.delete_task(t2.id)
        found = svc.get_task(t1.id)
        assert found.title == "Keep"

    def test_get_task_preserves_all_fields(self, db_session):
        svc = TaskService(db_session)
        due = datetime(2026, 12, 31, 23, 59)
        created = svc.create_task(TaskCreate(
            title="Full",
            description="Desc",
            priority=Priority.HIGH,
            due_date=due,
        ))
        found = svc.get_task(created.id)
        assert found.title == "Full"
        assert found.description == "Desc"
        assert found.priority == Priority.HIGH.value
        assert found.status == Status.TODO.value
        assert found.due_date == due

    def test_get_task_large_nonexistent_id(self, db_session):
        svc = TaskService(db_session)
        with pytest.raises(TaskNotFoundError):
            svc.get_task(999999)


class TestTaskServiceListExtra:
    def test_list_returns_newest_first(self, db_session):
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
        assert titles == ["Third", "Second", "First"]

    def test_list_filter_by_status_in_progress(self, db_session):
        svc = TaskService(db_session)
        t1 = svc.create_task(TaskCreate(title="Todo"))
        t2 = svc.create_task(TaskCreate(title="Work"))
        svc.update_task(t2.id, TaskUpdate(status=Status.IN_PROGRESS))
        result = svc.list_tasks(status=Status.IN_PROGRESS)
        assert len(result) == 1
        assert result[0].title == "Work"

    def test_list_filter_by_low_priority(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="Low", priority=Priority.LOW))
        svc.create_task(TaskCreate(title="High", priority=Priority.HIGH))
        result = svc.list_tasks(priority=Priority.LOW)
        assert len(result) == 1
        assert result[0].priority == Priority.LOW.value

    def test_list_filter_by_critical_priority(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="Critical", priority=Priority.CRITICAL))
        result = svc.list_tasks(priority=Priority.CRITICAL)
        assert len(result) == 1

    def test_list_due_before_excludes_future(self, db_session):
        svc = TaskService(db_session)
        cutoff = datetime(2026, 1, 1)
        svc.create_task(TaskCreate(title="Before", due_date=datetime(2025, 6, 1)))
        svc.create_task(TaskCreate(title="After", due_date=datetime(2027, 6, 1)))
        result = svc.list_tasks(due_before=cutoff)
        assert len(result) == 1
        assert result[0].title == "Before"

    def test_list_all_filters_status_and_priority_no_match(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="T", priority=Priority.LOW))
        result = svc.list_tasks(status=Status.TODO, priority=Priority.HIGH)
        assert result == []

    def test_list_status_and_due_before(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(
            title="Match",
            priority=Priority.MEDIUM,
            due_date=datetime(2025, 1, 1),
        ))
        t2 = svc.create_task(TaskCreate(
            title="Wrong status",
            priority=Priority.MEDIUM,
            due_date=datetime(2025, 1, 1),
        ))
        svc.update_task(t2.id, TaskUpdate(status=Status.IN_PROGRESS))
        result = svc.list_tasks(
            status=Status.TODO,
            due_before=datetime(2026, 1, 1),
        )
        assert len(result) == 1
        assert result[0].title == "Match"


class TestTaskServiceUpdateExtra:
    def test_update_status_and_priority_simultaneously(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        updated = svc.update_task(task.id, TaskUpdate(
            status=Status.IN_PROGRESS,
            priority=Priority.CRITICAL,
        ))
        assert updated.status == Status.IN_PROGRESS.value
        assert updated.priority == Priority.CRITICAL.value

    def test_update_all_fields_with_status_transition(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Original", description="Old"))
        updated = svc.update_task(task.id, TaskUpdate(
            title="New",
            description="New desc",
            priority=Priority.HIGH,
            status=Status.IN_PROGRESS,
            due_date=datetime(2027, 1, 1),
        ))
        assert updated.title == "New"
        assert updated.description == "New desc"
        assert updated.priority == Priority.HIGH.value
        assert updated.status == Status.IN_PROGRESS.value
        assert updated.due_date == datetime(2027, 1, 1)

    def test_update_priority_without_status(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T", priority=Priority.LOW))
        updated = svc.update_task(task.id, TaskUpdate(priority=Priority.HIGH))
        assert updated.priority == Priority.HIGH.value
        assert updated.status == Status.TODO.value

    def test_update_title_strips_whitespace(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Original"))
        updated = svc.update_task(task.id, TaskUpdate(title="  trimmed  "))
        assert updated.title == "trimmed"

    def test_update_with_no_changes_preserves_data(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Keep", description="Keep desc"))
        updated = svc.update_task(task.id, TaskUpdate())
        assert updated.title == "Keep"
        assert updated.description == "Keep desc"

    def test_invalid_transition_in_progress_to_same_state_is_valid(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        svc.update_task(task.id, TaskUpdate(status=Status.IN_PROGRESS))
        updated = svc.update_task(task.id, TaskUpdate(status=Status.IN_PROGRESS))
        assert updated.status == Status.IN_PROGRESS.value

    def test_update_due_date_from_none_to_value(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        assert task.due_date is None
        due = datetime(2026, 12, 31)
        updated = svc.update_task(task.id, TaskUpdate(due_date=due))
        assert updated.due_date == due

    def test_update_due_date_from_value_to_different_value(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T", due_date=datetime(2025, 1, 1)))
        new_due = datetime(2027, 6, 15)
        updated = svc.update_task(task.id, TaskUpdate(due_date=new_due))
        assert updated.due_date == new_due

    def test_update_description_to_whitespace(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T", description="original"))
        updated = svc.update_task(task.id, TaskUpdate(description="   "))
        assert updated.description == "   "


class TestValidateTransitionDirect:
    def test_validate_transition_todo_to_in_progress(self, db_session):
        svc = TaskService(db_session)
        svc._validate_transition(Status.TODO, Status.IN_PROGRESS)

    def test_validate_transition_in_progress_to_done(self, db_session):
        svc = TaskService(db_session)
        svc._validate_transition(Status.IN_PROGRESS, Status.DONE)

    def test_validate_transition_in_progress_to_todo(self, db_session):
        svc = TaskService(db_session)
        svc._validate_transition(Status.IN_PROGRESS, Status.TODO)

    def test_validate_transition_done_to_in_progress(self, db_session):
        svc = TaskService(db_session)
        svc._validate_transition(Status.DONE, Status.IN_PROGRESS)

    def test_validate_transition_same_status_todo(self, db_session):
        svc = TaskService(db_session)
        svc._validate_transition(Status.TODO, Status.TODO)

    def test_validate_transition_same_status_in_progress(self, db_session):
        svc = TaskService(db_session)
        svc._validate_transition(Status.IN_PROGRESS, Status.IN_PROGRESS)

    def test_validate_transition_same_status_done(self, db_session):
        svc = TaskService(db_session)
        svc._validate_transition(Status.DONE, Status.DONE)

    def test_validate_transition_todo_to_done_raises(self, db_session):
        svc = TaskService(db_session)
        with pytest.raises(InvalidTransitionError):
            svc._validate_transition(Status.TODO, Status.DONE)

    def test_validate_transition_done_to_todo_raises(self, db_session):
        svc = TaskService(db_session)
        with pytest.raises(InvalidTransitionError):
            svc._validate_transition(Status.DONE, Status.TODO)

    def test_validate_transition_error_contains_both_statuses(self, db_session):
        svc = TaskService(db_session)
        with pytest.raises(InvalidTransitionError) as exc_info:
            svc._validate_transition(Status.TODO, Status.DONE)
        msg = str(exc_info.value).lower()
        assert "todo" in msg
        assert "done" in msg


class TestTaskServiceDeleteExtra:
    def test_delete_only_task(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Only"))
        svc.delete_task(task.id)
        assert svc.list_tasks() == []

    def test_delete_middle_task(self, db_session):
        svc = TaskService(db_session)
        t1 = svc.create_task(TaskCreate(title="First"))
        t2 = svc.create_task(TaskCreate(title="Middle"))
        t3 = svc.create_task(TaskCreate(title="Last"))
        svc.delete_task(t2.id)
        remaining = svc.list_tasks()
        assert len(remaining) == 2
        titles = {t.title for t in remaining}
        assert titles == {"First", "Last"}

    def test_delete_first_task(self, db_session):
        svc = TaskService(db_session)
        t1 = svc.create_task(TaskCreate(title="First"))
        t2 = svc.create_task(TaskCreate(title="Second"))
        svc.delete_task(t1.id)
        remaining = svc.list_tasks()
        assert len(remaining) == 1
        assert remaining[0].title == "Second"


class TestTaskServiceWorkflow:
    def test_create_update_list_delete_workflow(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Workflow", priority=Priority.HIGH))
        svc.update_task(task.id, TaskUpdate(status=Status.IN_PROGRESS))
        tasks = svc.list_tasks(status=Status.IN_PROGRESS)
        assert len(tasks) == 1
        svc.delete_task(task.id)
        assert svc.list_tasks() == []

    def test_multiple_tasks_full_lifecycle(self, db_session):
        svc = TaskService(db_session)
        t1 = svc.create_task(TaskCreate(title="A", priority=Priority.LOW))
        t2 = svc.create_task(TaskCreate(title="B", priority=Priority.HIGH))
        t3 = svc.create_task(TaskCreate(title="C", priority=Priority.MEDIUM))

        svc.update_task(t1.id, TaskUpdate(status=Status.IN_PROGRESS))
        svc.update_task(t2.id, TaskUpdate(status=Status.IN_PROGRESS))
        svc.update_task(t2.id, TaskUpdate(status=Status.DONE))

        todo_tasks = svc.list_tasks(status=Status.TODO)
        assert len(todo_tasks) == 1
        assert todo_tasks[0].title == "C"

        in_progress = svc.list_tasks(status=Status.IN_PROGRESS)
        assert len(in_progress) == 1
        assert in_progress[0].title == "A"

        done_tasks = svc.list_tasks(status=Status.DONE)
        assert len(done_tasks) == 1
        assert done_tasks[0].title == "B"

    def test_update_reopen_closed_task(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Reopen"))
        svc.update_task(task.id, TaskUpdate(status=Status.IN_PROGRESS))
        svc.update_task(task.id, TaskUpdate(status=Status.DONE))
        svc.update_task(task.id, TaskUpdate(status=Status.IN_PROGRESS))
        found = svc.get_task(task.id)
        assert found.status == Status.IN_PROGRESS.value

    def test_create_many_and_filter(self, db_session):
        svc = TaskService(db_session)
        for i in range(20):
            priority = [Priority.LOW, Priority.MEDIUM, Priority.HIGH, Priority.CRITICAL][i % 4]
            svc.create_task(TaskCreate(title=f"Task {i}", priority=priority))

        high_tasks = svc.list_tasks(priority=Priority.HIGH)
        assert len(high_tasks) == 5

        all_tasks = svc.list_tasks()
        assert len(all_tasks) == 20


class TestExceptionTypes:
    def test_invalid_transition_is_exception(self):
        assert issubclass(InvalidTransitionError, Exception)

    def test_task_not_found_is_exception(self):
        assert issubclass(TaskNotFoundError, Exception)

    def test_invalid_transition_can_be_caught_as_exception(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        with pytest.raises(Exception):
            svc.update_task(task.id, TaskUpdate(status=Status.DONE))

    def test_task_not_found_can_be_caught_as_exception(self, db_session):
        svc = TaskService(db_session)
        with pytest.raises(Exception):
            svc.get_task(999)
