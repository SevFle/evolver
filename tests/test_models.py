import pytest

from app.models import Priority, Status, Task, VALID_TRANSITIONS


class TestPriorityEnum:
    def test_all_values(self):
        assert Priority.LOW.value == "low"
        assert Priority.MEDIUM.value == "medium"
        assert Priority.HIGH.value == "high"
        assert Priority.CRITICAL.value == "critical"

    def test_member_count(self):
        assert len(Priority) == 4

    def test_string_comparison(self):
        assert Priority.HIGH == "high"
        assert Priority.HIGH.value == "high"

    def test_from_value(self):
        assert Priority("low") == Priority.LOW
        assert Priority("critical") == Priority.CRITICAL

    def test_invalid_value_raises(self):
        with pytest.raises(ValueError):
            Priority("urgent")


class TestStatusEnum:
    def test_all_values(self):
        assert Status.TODO.value == "todo"
        assert Status.IN_PROGRESS.value == "in_progress"
        assert Status.DONE.value == "done"

    def test_member_count(self):
        assert len(Status) == 3

    def test_string_comparison(self):
        assert Status.TODO == "todo"

    def test_from_value(self):
        assert Status("in_progress") == Status.IN_PROGRESS

    def test_invalid_value_raises(self):
        with pytest.raises(ValueError):
            Status("cancelled")


class TestValidTransitions:
    def test_every_status_has_entry(self):
        for status in Status:
            assert status in VALID_TRANSITIONS

    def test_all_targets_are_valid_statuses(self):
        for source, targets in VALID_TRANSITIONS.items():
            assert isinstance(source, Status)
            for target in targets:
                assert isinstance(target, Status)

    def test_transitions_are_sets(self):
        for targets in VALID_TRANSITIONS.values():
            assert isinstance(targets, set)

    def test_todo_cannot_go_to_done(self):
        assert Status.DONE not in VALID_TRANSITIONS[Status.TODO]

    def test_done_cannot_go_to_todo(self):
        assert Status.TODO not in VALID_TRANSITIONS[Status.DONE]

    def test_in_progress_can_revert_to_todo(self):
        assert Status.TODO in VALID_TRANSITIONS[Status.IN_PROGRESS]

    def test_in_progress_can_advance_to_done(self):
        assert Status.DONE in VALID_TRANSITIONS[Status.IN_PROGRESS]

    def test_done_can_reopen(self):
        assert Status.IN_PROGRESS in VALID_TRANSITIONS[Status.DONE]

    def test_no_self_transitions_explicitly(self):
        for source, targets in VALID_TRANSITIONS.items():
            assert source not in targets


class TestTaskModel:
    def test_tablename(self):
        assert Task.__tablename__ == "tasks"

    def test_default_status_is_todo(self, db_session):
        from app.schemas import TaskCreate
        from app.services import TaskService

        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        assert task.status == "todo"

    def test_default_priority_is_medium(self, db_session):
        from app.schemas import TaskCreate
        from app.services import TaskService

        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        assert task.priority == "medium"

    def test_default_description_is_empty(self, db_session):
        from app.schemas import TaskCreate
        from app.services import TaskService

        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        assert task.description == ""

    def test_created_at_auto_set(self, db_session):
        from app.schemas import TaskCreate
        from app.services import TaskService

        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        assert task.created_at is not None

    def test_updated_at_auto_set(self, db_session):
        from app.schemas import TaskCreate
        from app.services import TaskService

        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        assert task.updated_at is not None

    def test_due_date_nullable(self, db_session):
        from app.schemas import TaskCreate
        from app.services import TaskService

        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        assert task.due_date is None
