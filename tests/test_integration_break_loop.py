import pytest
from datetime import datetime, timedelta, timezone
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db, init_db
from app.models import Priority, Status, Task, VALID_TRANSITIONS
from app.schemas import TaskCreate, TaskResponse, TaskUpdate
from app.services import InvalidTransitionError, TaskNotFoundError, TaskService


class TestConftestFixtureIntegrity:
    def test_db_session_fixture_provides_functional_session(self, db_session):
        task = Task(title="Fixture test", description="", priority="medium", status="todo")
        db_session.add(task)
        db_session.commit()
        assert db_session.get(Task, task.id) is not None

    def test_db_session_fixture_isolation_between_tests_a(self, db_session):
        assert db_session.scalars(select(Task)).all() == []

    def test_db_session_fixture_isolation_between_tests_b(self, db_session):
        assert db_session.scalars(select(Task)).all() == []

    def test_engine_fixture_creates_all_tables(self, engine):
        from sqlalchemy import inspect as sa_inspect
        inspector = sa_inspect(engine)
        table_names = inspector.get_table_names()
        assert "tasks" in table_names

    def test_client_fixture_returns_working_test_client(self, client):
        resp = client.get("/tasks/")
        assert resp.status_code == 200
        assert resp.json() == []


class TestDatabaseEngineEdgeCases:
    def test_in_memory_engine_isolation(self):
        eng = create_engine("sqlite:///:memory:")
        init_db(engine_=eng)
        Session = sessionmaker(bind=eng)
        session = Session()
        task = Task(title="Isolated", description="x", priority="low", status="todo")
        session.add(task)
        session.commit()
        assert session.get(Task, 1).title == "Isolated"
        session.close()

    def test_init_db_creates_tables_on_fresh_engine(self):
        from sqlalchemy import inspect as sa_inspect
        eng = create_engine("sqlite:///:memory:")
        inspector = sa_inspect(eng)
        assert "tasks" not in inspector.get_table_names()
        init_db(engine_=eng)
        inspector2 = sa_inspect(eng)
        assert "tasks" in inspector2.get_table_names()

    def test_get_db_generator_protocol(self):
        eng = create_engine("sqlite:///:memory:")
        init_db(engine_=eng)
        gen = get_db()
        session = next(gen)
        assert session is not None
        try:
            next(gen)
        except StopIteration:
            pass
        session.close()


class TestServiceDataIntegrity:
    def test_create_task_stores_priority_as_string(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="P", priority=Priority.CRITICAL))
        assert isinstance(task.priority, str)
        assert task.priority == "critical"

    def test_create_task_stores_status_as_string(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="S"))
        assert isinstance(task.status, str)
        assert task.status == "todo"

    def test_update_with_status_transition_changes_db_value(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        svc.update_task(task.id, TaskUpdate(status=Status.IN_PROGRESS))
        refreshed = db_session.get(Task, task.id)
        assert refreshed.status == "in_progress"

    def test_update_priority_changes_db_value(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T", priority=Priority.LOW))
        svc.update_task(task.id, TaskUpdate(priority=Priority.HIGH))
        refreshed = db_session.get(Task, task.id)
        assert refreshed.priority == "high"

    def test_delete_then_get_raises_not_found(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Temporary"))
        task_id = task.id
        svc.delete_task(task_id)
        with pytest.raises(TaskNotFoundError):
            svc.get_task(task_id)

    def test_list_tasks_returns_list_type(self, db_session):
        svc = TaskService(db_session)
        result = svc.list_tasks()
        assert isinstance(result, list)

    def test_list_tasks_empty_returns_empty_list(self, db_session):
        svc = TaskService(db_session)
        assert svc.list_tasks() == []

    def test_create_task_with_due_date_stores_correctly(self, db_session):
        svc = TaskService(db_session)
        due = datetime(2026, 12, 31, 23, 59, 59)
        task = svc.create_task(TaskCreate(title="Due", due_date=due))
        assert task.due_date == due

    def test_update_clears_due_date(self, db_session):
        svc = TaskService(db_session)
        due = datetime(2026, 6, 1)
        task = svc.create_task(TaskCreate(title="Clear due", due_date=due))
        updated = svc.update_task(task.id, TaskUpdate(due_date=None))
        assert updated.due_date is None


class TestServiceFilterLogic:
    def test_due_before_includes_exact_boundary(self, db_session):
        svc = TaskService(db_session)
        boundary = datetime(2026, 6, 15, 12, 0, 0)
        svc.create_task(TaskCreate(title="Exact", due_date=boundary))
        svc.create_task(TaskCreate(title="After", due_date=datetime(2026, 7, 1)))
        result = svc.list_tasks(due_before=boundary)
        assert len(result) == 1
        assert result[0].title == "Exact"

    def test_due_before_excludes_null_due_dates(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="No due"))
        svc.create_task(TaskCreate(title="Has due", due_date=datetime(2026, 1, 1)))
        result = svc.list_tasks(due_before=datetime(2026, 12, 31))
        assert len(result) == 1
        assert result[0].title == "Has due"

    def test_list_ordered_by_created_at_desc(self, db_session):
        svc = TaskService(db_session)
        task1 = svc.create_task(TaskCreate(title="First"))
        task2 = svc.create_task(TaskCreate(title="Second"))
        task3 = svc.create_task(TaskCreate(title="Third"))
        db_session.execute(
            text("UPDATE tasks SET created_at = '2026-01-01 00:00:01' WHERE id = :id"),
            {"id": task1.id},
        )
        db_session.execute(
            text("UPDATE tasks SET created_at = '2026-01-01 00:00:02' WHERE id = :id"),
            {"id": task2.id},
        )
        db_session.execute(
            text("UPDATE tasks SET created_at = '2026-01-01 00:00:03' WHERE id = :id"),
            {"id": task3.id},
        )
        db_session.commit()
        tasks = svc.list_tasks()
        titles = [t.title for t in tasks]
        assert titles == ["Third", "Second", "First"]

    def test_combined_status_priority_and_due_filter(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="Match", priority=Priority.HIGH, due_date=datetime(2026, 3, 1)))
        svc.create_task(TaskCreate(title="Wrong priority", priority=Priority.LOW, due_date=datetime(2026, 3, 1)))
        svc.create_task(TaskCreate(title="Too far", priority=Priority.HIGH, due_date=datetime(2026, 9, 1)))
        svc.update_task(1, TaskUpdate(status=Status.IN_PROGRESS))
        svc.update_task(3, TaskUpdate(status=Status.IN_PROGRESS))
        result = svc.list_tasks(
            status=Status.IN_PROGRESS,
            priority=Priority.HIGH,
            due_before=datetime(2026, 6, 1),
        )
        assert len(result) == 1
        assert result[0].title == "Match"


class TestTransitionValidationDirect:
    def test_same_status_is_always_allowed(self, db_session):
        svc = TaskService(db_session)
        for status in Status:
            task = svc.create_task(TaskCreate(title=f"Task-{status.value}"))
            if task.status != status.value:
                db_session.execute(
                    text("UPDATE tasks SET status = :s WHERE id = :id"),
                    {"s": status.value, "id": task.id},
                )
                db_session.commit()
            updated = svc.update_task(task.id, TaskUpdate(status=status))
            assert updated.status == status.value

    def test_invalid_transition_raises_with_both_status_names(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Jump"))
        with pytest.raises(InvalidTransitionError) as exc_info:
            svc.update_task(task.id, TaskUpdate(status=Status.DONE))
        msg = str(exc_info.value)
        assert "todo" in msg
        assert "done" in msg


class TestAPIFullWorkflowIntegration:
    def test_create_list_get_update_delete_lifecycle(self, client):
        create_resp = client.post("/tasks/", json={"title": "Lifecycle task", "priority": "high"})
        assert create_resp.status_code == 201
        task_id = create_resp.json()["id"]

        list_resp = client.get("/tasks/")
        assert len(list_resp.json()) == 1
        assert list_resp.json()[0]["id"] == task_id

        get_resp = client.get(f"/tasks/{task_id}")
        assert get_resp.json()["title"] == "Lifecycle task"

        update_resp = client.patch(f"/tasks/{task_id}", json={"status": "in_progress"})
        assert update_resp.json()["status"] == "in_progress"

        del_resp = client.delete(f"/tasks/{task_id}")
        assert del_resp.status_code == 204

        get_after = client.get(f"/tasks/{task_id}")
        assert get_after.status_code == 404

    def test_filter_by_status_after_transitions(self, client):
        client.post("/tasks/", json={"title": "A"})
        client.post("/tasks/", json={"title": "B"})
        client.patch("/tasks/1", json={"status": "in_progress"})
        client.patch("/tasks/2", json={"status": "in_progress"})
        client.patch("/tasks/2", json={"status": "done"})

        todo_resp = client.get("/tasks/", params={"status": "todo"})
        assert len(todo_resp.json()) == 0

        ip_resp = client.get("/tasks/", params={"status": "in_progress"})
        assert len(ip_resp.json()) == 1
        assert ip_resp.json()[0]["title"] == "A"

        done_resp = client.get("/tasks/", params={"status": "done"})
        assert len(done_resp.json()) == 1
        assert done_resp.json()[0]["title"] == "B"

    def test_create_task_defaults_are_correct(self, client):
        resp = client.post("/tasks/", json={"title": "Defaults"})
        data = resp.json()
        assert data["description"] == ""
        assert data["priority"] == "medium"
        assert data["status"] == "todo"
        assert data["due_date"] is None
        assert data["id"] == 1
        assert "created_at" in data
        assert "updated_at" in data

    def test_update_preserves_unmentioned_fields(self, client):
        create = client.post(
            "/tasks/",
            json={"title": "Original", "description": "Keep me", "priority": "high"},
        )
        task_id = create.json()["id"]
        updated = client.patch(f"/tasks/{task_id}", json={"title": "Changed"})
        data = updated.json()
        assert data["title"] == "Changed"
        assert data["description"] == "Keep me"
        assert data["priority"] == "high"

    def test_invalid_status_transition_returns_409_with_detail(self, client):
        create = client.post("/tasks/", json={"title": "Bad transition"})
        task_id = create.json()["id"]
        resp = client.patch(f"/tasks/{task_id}", json={"status": "done"})
        assert resp.status_code == 409
        assert "detail" in resp.json()

    def test_due_date_filter_works_via_api(self, client):
        client.post("/tasks/", json={"title": "Past", "due_date": "2026-01-15T00:00:00"})
        client.post("/tasks/", json={"title": "Future", "due_date": "2026-12-15T00:00:00"})
        resp = client.get("/tasks/", params={"due_before": "2026-06-01T00:00:00"})
        assert len(resp.json()) == 1
        assert resp.json()[0]["title"] == "Past"


class TestSchemaValidationIntegration:
    def test_title_whitespace_only_rejected(self, client):
        resp = client.post("/tasks/", json={"title": "   "})
        assert resp.status_code == 422

    def test_empty_title_rejected(self, client):
        resp = client.post("/tasks/", json={"title": ""})
        assert resp.status_code == 422

    def test_title_max_length_enforced(self, client):
        resp = client.post("/tasks/", json={"title": "x" * 201})
        assert resp.status_code == 422

    def test_description_max_length_enforced(self, client):
        resp = client.post("/tasks/", json={"title": "OK", "description": "y" * 2001})
        assert resp.status_code == 422

    def test_title_exactly_200_accepted(self, client):
        resp = client.post("/tasks/", json={"title": "x" * 200})
        assert resp.status_code == 201

    def test_description_exactly_2000_accepted(self, client):
        resp = client.post("/tasks/", json={"title": "OK", "description": "y" * 2000})
        assert resp.status_code == 201

    def test_invalid_priority_rejected(self, client):
        resp = client.post("/tasks/", json={"title": "OK", "priority": "urgent"})
        assert resp.status_code == 422

    def test_update_with_empty_title_rejected(self, client):
        create = client.post("/tasks/", json={"title": "Valid"})
        task_id = create.json()["id"]
        resp = client.patch(f"/tasks/{task_id}", json={"title": ""})
        assert resp.status_code == 422

    def test_update_strip_whitespace_from_title(self, client):
        create = client.post("/tasks/", json={"title": "Valid"})
        task_id = create.json()["id"]
        resp = client.patch(f"/tasks/{task_id}", json={"title": "  Padded  "})
        assert resp.json()["title"] == "Padded"


class TestModelEnumCompleteness:
    def test_priority_has_four_members(self):
        assert len(Priority) == 4
        assert set(p.value for p in Priority) == {"low", "medium", "high", "critical"}

    def test_status_has_three_members(self):
        assert len(Status) == 3
        assert set(s.value for s in Status) == {"todo", "in_progress", "done"}

    def test_valid_transitions_covers_all_statuses(self):
        assert set(VALID_TRANSITIONS.keys()) == set(Status)

    def test_valid_transitions_only_maps_to_valid_statuses(self):
        for source, targets in VALID_TRANSITIONS.items():
            assert targets.issubset(set(Status)), f"Invalid targets for {source}: {targets}"


class TestTaskResponseSerialization:
    def test_response_from_db_model_has_all_fields(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Serialize", description="test", priority=Priority.HIGH))
        response = TaskResponse.model_validate(task)
        assert response.id == task.id
        assert response.title == "Serialize"
        assert response.description == "test"
        assert response.priority == "high"
        assert response.status == "todo"
        assert response.due_date is None
        assert response.created_at is not None
        assert response.updated_at is not None


class TestErrorConsistency:
    def test_get_task_error_message_format(self, db_session):
        svc = TaskService(db_session)
        with pytest.raises(TaskNotFoundError) as exc_info:
            svc.get_task(999)
        assert "999" in str(exc_info.value)

    def test_invalid_transition_error_format(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="T"))
        with pytest.raises(InvalidTransitionError) as exc_info:
            svc.update_task(1, TaskUpdate(status=Status.DONE))
        msg = str(exc_info.value)
        assert "todo" in msg
        assert "done" in msg

    def test_task_not_found_and_invalid_transition_are_distinct(self):
        assert TaskNotFoundError is not InvalidTransitionError
        assert issubclass(TaskNotFoundError, Exception)
        assert issubclass(InvalidTransitionError, Exception)
