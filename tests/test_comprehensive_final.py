import pytest
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db, init_db
from app.models import Priority, Status, Task, VALID_TRANSITIONS
from app.schemas import TaskCreate, TaskUpdate, TaskResponse
from app.services import TaskService, InvalidTransitionError, TaskNotFoundError


class TestStateMachineCompleteness:
    """Verify every possible status transition explicitly."""

    def test_all_status_pairs_explicitly_tested(self, db_session):
        svc = TaskService(db_session)
        all_statuses = list(Status)
        for source in all_statuses:
            for target in all_statuses:
                task = svc.create_task(TaskCreate(title=f"{source.value}->{target.value}"))
                if source != Status.TODO:
                    svc.update_task(task.id, TaskUpdate(status=Status.IN_PROGRESS))
                if source == Status.DONE:
                    svc.update_task(task.id, TaskUpdate(status=Status.DONE))
                if source == target:
                    result = svc.update_task(task.id, TaskUpdate(status=target))
                    assert result.status == target.value
                elif target in VALID_TRANSITIONS.get(source, set()):
                    result = svc.update_task(task.id, TaskUpdate(status=target))
                    assert result.status == target.value
                else:
                    with pytest.raises(InvalidTransitionError):
                        svc.update_task(task.id, TaskUpdate(status=target))

    def test_transition_graph_is_deterministic(self):
        for source in Status:
            allowed = VALID_TRANSITIONS[source]
            assert isinstance(allowed, set)
            assert len(allowed) > 0

    def test_todo_only_goes_to_in_progress(self):
        assert VALID_TRANSITIONS[Status.TODO] == {Status.IN_PROGRESS}

    def test_in_progress_can_go_to_done_or_todo(self):
        assert VALID_TRANSITIONS[Status.IN_PROGRESS] == {Status.DONE, Status.TODO}

    def test_done_only_goes_to_in_progress(self):
        assert VALID_TRANSITIONS[Status.DONE] == {Status.IN_PROGRESS}

    def test_full_cycle_todo_in_progress_done_in_progress_todo(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Cycle"))
        assert task.status == Status.TODO.value
        task = svc.update_task(task.id, TaskUpdate(status=Status.IN_PROGRESS))
        assert task.status == Status.IN_PROGRESS.value
        task = svc.update_task(task.id, TaskUpdate(status=Status.DONE))
        assert task.status == Status.DONE.value
        task = svc.update_task(task.id, TaskUpdate(status=Status.IN_PROGRESS))
        assert task.status == Status.IN_PROGRESS.value
        task = svc.update_task(task.id, TaskUpdate(status=Status.TODO))
        assert task.status == Status.TODO.value

    def test_multiple_cycles_through_state_machine(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Multi-cycle"))
        for _ in range(5):
            svc.update_task(task.id, TaskUpdate(status=Status.IN_PROGRESS))
            svc.update_task(task.id, TaskUpdate(status=Status.DONE))
            svc.update_task(task.id, TaskUpdate(status=Status.IN_PROGRESS))
            svc.update_task(task.id, TaskUpdate(status=Status.TODO))
        fetched = svc.get_task(task.id)
        assert fetched.status == Status.TODO.value

    def test_same_status_transition_is_noop_for_all_statuses(self, db_session):
        svc = TaskService(db_session)
        for status in Status:
            task = svc.create_task(TaskCreate(title=f"Same-{status.value}"))
            if status != Status.TODO:
                svc.update_task(task.id, TaskUpdate(status=Status.IN_PROGRESS))
                if status == Status.DONE:
                    svc.update_task(task.id, TaskUpdate(status=Status.DONE))
            original_title = task.title
            result = svc.update_task(task.id, TaskUpdate(status=status))
            assert result.status == status.value
            assert result.title == original_title


class TestTransactionIsolation:
    """Test that database operations are properly isolated."""

    def test_separate_sessions_see_committed_data(self, engine):
        Session = sessionmaker(bind=engine)
        s1 = Session()
        s2 = Session()
        try:
            svc1 = TaskService(s1)
            task = svc1.create_task(TaskCreate(title="Visible"))
            svc2 = TaskService(s2)
            found = svc2.get_task(task.id)
            assert found.title == "Visible"
        finally:
            s1.close()
            s2.close()

    def test_create_and_immediately_read(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Immediate read"))
        fetched = svc.get_task(task.id)
        assert fetched.title == task.title
        assert fetched.description == task.description
        assert fetched.priority == task.priority
        assert fetched.status == task.status

    def test_update_persists_across_reads(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="V1"))
        svc.update_task(task.id, TaskUpdate(title="V2"))
        fetched = svc.get_task(task.id)
        assert fetched.title == "V2"
        svc.update_task(task.id, TaskUpdate(title="V3"))
        fetched = svc.get_task(task.id)
        assert fetched.title == "V3"

    def test_delete_then_list_reflects_removal(self, db_session):
        svc = TaskService(db_session)
        t1 = svc.create_task(TaskCreate(title="Keep"))
        t2 = svc.create_task(TaskCreate(title="Delete"))
        svc.delete_task(t2.id)
        remaining = svc.list_tasks()
        assert len(remaining) == 1
        assert remaining[0].id == t1.id

    def test_create_many_tasks_all_persisted(self, db_session):
        svc = TaskService(db_session)
        created_ids = []
        for i in range(20):
            task = svc.create_task(TaskCreate(title=f"Task {i}"))
            created_ids.append(task.id)
        all_tasks = svc.list_tasks()
        assert len(all_tasks) == 20
        fetched_ids = {t.id for t in all_tasks}
        assert fetched_ids == set(created_ids)


class TestServiceLayerEdgeCases:
    """Edge cases for TaskService."""

    def test_create_task_with_max_title_length(self, db_session):
        svc = TaskService(db_session)
        title = "A" * 200
        task = svc.create_task(TaskCreate(title=title))
        assert task.title == title
        assert len(task.title) == 200

    def test_create_task_with_max_description_length(self, db_session):
        svc = TaskService(db_session)
        desc = "D" * 2000
        task = svc.create_task(TaskCreate(title="T", description=desc))
        assert task.description == desc
        assert len(task.description) == 2000

    def test_create_task_with_all_priorities(self, db_session):
        svc = TaskService(db_session)
        for priority in Priority:
            task = svc.create_task(TaskCreate(title=f"P-{priority.value}", priority=priority))
            assert task.priority == priority.value

    def test_update_with_status_and_priority_simultaneously(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        updated = svc.update_task(task.id, TaskUpdate(
            status=Status.IN_PROGRESS,
            priority=Priority.HIGH,
        ))
        assert updated.status == Status.IN_PROGRESS.value
        assert updated.priority == Priority.HIGH.value

    def test_update_with_title_and_status_and_priority(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Original"))
        updated = svc.update_task(task.id, TaskUpdate(
            title="Updated Title",
            status=Status.IN_PROGRESS,
            priority=Priority.CRITICAL,
        ))
        assert updated.title == "Updated Title"
        assert updated.status == Status.IN_PROGRESS.value
        assert updated.priority == Priority.CRITICAL.value

    def test_list_tasks_all_filter_combinations(self, db_session):
        svc = TaskService(db_session)
        for status in Status:
            for priority in Priority:
                svc.create_task(TaskCreate(
                    title=f"S{status.value}-P{priority.value}",
                    priority=priority,
                ))
        for s in list(Status) + [None]:
            for p in list(Priority) + [None]:
                results = svc.list_tasks(status=s, priority=p)
                assert isinstance(results, list)
                for task in results:
                    if s is not None:
                        assert task.status == s.value
                    if p is not None:
                        assert task.priority == p.value

    def test_get_task_after_multiple_updates(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="V1", description="D1", priority=Priority.LOW))
        svc.update_task(task.id, TaskUpdate(title="V2"))
        svc.update_task(task.id, TaskUpdate(description="D2"))
        svc.update_task(task.id, TaskUpdate(priority=Priority.HIGH))
        fetched = svc.get_task(task.id)
        assert fetched.title == "V2"
        assert fetched.description == "D2"
        assert fetched.priority == Priority.HIGH.value

    def test_delete_all_tasks_then_create(self, db_session):
        svc = TaskService(db_session)
        tasks = [svc.create_task(TaskCreate(title=f"T{i}")) for i in range(5)]
        for t in tasks:
            svc.delete_task(t.id)
        assert svc.list_tasks() == []
        new_task = svc.create_task(TaskCreate(title="New"))
        assert svc.list_tasks() == [new_task]

    def test_due_date_boundary_midnight(self, db_session):
        svc = TaskService(db_session)
        midnight = datetime(2026, 1, 1, 0, 0, 0)
        task = svc.create_task(TaskCreate(title="Midnight", due_date=midnight))
        fetched = svc.get_task(task.id)
        assert fetched.due_date == midnight

    def test_due_date_boundary_end_of_year(self, db_session):
        svc = TaskService(db_session)
        eoy = datetime(2026, 12, 31, 23, 59, 59)
        task = svc.create_task(TaskCreate(title="EOY", due_date=eoy))
        fetched = svc.get_task(task.id)
        assert fetched.due_date == eoy

    def test_due_before_filters_inclusive(self, db_session):
        svc = TaskService(db_session)
        dt = datetime(2026, 6, 15, 12, 0, 0)
        svc.create_task(TaskCreate(title="Exact", due_date=dt))
        svc.create_task(TaskCreate(title="One sec after", due_date=dt + timedelta(seconds=1)))
        svc.create_task(TaskCreate(title="One sec before", due_date=dt - timedelta(seconds=1)))
        results = svc.list_tasks(due_before=dt)
        titles = {t.title for t in results}
        assert "Exact" in titles
        assert "One sec before" in titles
        assert "One sec after" not in titles

    def test_service_constructor_stores_db(self, db_session):
        svc = TaskService(db_session)
        assert svc.db is db_session

    def test_invalid_transition_error_is_exception(self):
        assert issubclass(InvalidTransitionError, Exception)

    def test_task_not_found_error_is_exception(self):
        assert issubclass(TaskNotFoundError, Exception)

    def test_update_with_due_date_clearing(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T", due_date=datetime(2026, 1, 1)))
        assert task.due_date is not None
        updated = svc.update_task(task.id, TaskUpdate(due_date=None))
        assert updated.due_date is None

    def test_update_with_due_date_setting(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        assert task.due_date is None
        new_date = datetime(2027, 6, 1)
        updated = svc.update_task(task.id, TaskUpdate(due_date=new_date))
        assert updated.due_date == new_date

    def test_update_with_due_date_changing(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T", due_date=datetime(2026, 1, 1)))
        new_date = datetime(2027, 6, 1)
        updated = svc.update_task(task.id, TaskUpdate(due_date=new_date))
        assert updated.due_date == new_date


class TestSchemaValidation:
    """Deep schema validation tests."""

    def test_task_create_title_tabs_rejected(self):
        with pytest.raises(ValueError):
            TaskCreate(title="\t\t\t")

    def test_task_create_title_newlines_rejected(self):
        with pytest.raises(ValueError):
            TaskCreate(title="\n\n")

    def test_task_create_title_mixed_whitespace_rejected(self):
        with pytest.raises(ValueError):
            TaskCreate(title="  \t \n  ")

    def test_task_update_title_tabs_rejected(self):
        with pytest.raises(ValueError):
            TaskUpdate(title="\t\t\t")

    def test_task_update_title_mixed_whitespace_rejected(self):
        with pytest.raises(ValueError):
            TaskUpdate(title="  \t \n  ")

    def test_task_create_with_valid_title_strips_tabs(self):
        t = TaskCreate(title="\tvalid\t")
        assert t.title == "valid"

    def test_task_create_model_dump(self):
        tc = TaskCreate(title="T", description="D", priority=Priority.HIGH)
        dumped = tc.model_dump()
        assert dumped["title"] == "T"
        assert dumped["description"] == "D"
        assert dumped["priority"] == Priority.HIGH

    def test_task_update_model_dump_exclude_unset_empty(self):
        u = TaskUpdate()
        assert u.model_dump(exclude_unset=True) == {}

    def test_task_update_model_dump_exclude_unset_with_none(self):
        u = TaskUpdate(title=None, due_date=None)
        dumped = u.model_dump(exclude_unset=True)
        assert "title" in dumped
        assert "due_date" in dumped
        assert dumped["title"] is None
        assert dumped["due_date"] is None

    def test_task_response_model_fields_count(self):
        assert len(TaskResponse.model_fields) == 8

    def test_task_create_with_emoji_title(self):
        t = TaskCreate(title="Test task")
        assert t.title == "Test task"

    def test_task_create_with_description_containing_null(self):
        t = TaskCreate(title="T", description="before\x00after")
        assert "\x00" in t.description

    def test_task_create_with_very_long_multiline_description(self):
        desc = "\n".join(["Line " + str(i) for i in range(100)])
        t = TaskCreate(title="T", description=desc)
        assert t.description.count("\n") == 99

    def test_priority_enum_values_are_strings(self):
        for p in Priority:
            assert isinstance(p.value, str)

    def test_status_enum_values_are_strings(self):
        for s in Status:
            assert isinstance(s.value, str)


class TestDatabaseLifecycle:
    """Test database module functions."""

    def test_init_db_default_engine_creates_tables(self):
        eng = create_engine("sqlite:///:memory:")
        init_db(engine_=eng)
        from sqlalchemy import inspect
        inspector = inspect(eng)
        assert "tasks" in inspector.get_table_names()

    def test_get_db_generator_yields_and_closes(self):
        eng = create_engine("sqlite:///:memory:")
        init_db(engine_=eng)
        import app.database as db_module
        original = db_module.SessionLocal
        db_module.SessionLocal = sessionmaker(bind=eng)
        try:
            gen = get_db()
            session = next(gen)
            assert session.is_active
            try:
                next(gen)
            except StopIteration:
                pass
        finally:
            db_module.SessionLocal = original

    def test_engine_is_sqlite(self):
        from app.database import engine as app_engine
        assert "sqlite" in str(app_engine.url)

    def test_base_metadata_contains_task(self):
        assert "tasks" in Base.metadata.tables

    def test_task_table_columns_match_model(self, engine):
        from sqlalchemy import inspect
        inspector = inspect(engine)
        columns = {col["name"] for col in inspector.get_columns("tasks")}
        expected = {"id", "title", "description", "priority", "status", "due_date", "created_at", "updated_at"}
        assert columns == expected

    def test_init_db_multiple_times_safe(self):
        eng = create_engine("sqlite:///:memory:")
        for _ in range(5):
            init_db(engine_=eng)
        from sqlalchemy import inspect
        assert "tasks" in inspect(eng).get_table_names()


class TestWorkflowIntegration:
    """End-to-end workflow scenarios."""

    def test_create_task_full_lifecycle_via_api(self, client):
        resp = client.post("/tasks/", json={
            "title": "Sprint task",
            "description": "Complete the feature",
            "priority": "high",
            "due_date": "2026-12-31T00:00:00",
        })
        assert resp.status_code == 201
        task = resp.json()
        assert task["status"] == "todo"
        assert task["priority"] == "high"

        resp = client.patch(f"/tasks/{task['id']}", json={"status": "in_progress"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "in_progress"

        resp = client.patch(f"/tasks/{task['id']}", json={
            "status": "done",
            "description": "Feature completed",
        })
        assert resp.status_code == 200
        assert resp.json()["status"] == "done"
        assert resp.json()["description"] == "Feature completed"

        resp = client.get(f"/tasks/{task['id']}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "done"
        assert data["title"] == "Sprint task"

    def test_multiple_tasks_workflow(self, client):
        tasks = []
        for i in range(5):
            resp = client.post("/tasks/", json={
                "title": f"Task {i}",
                "priority": ["low", "medium", "high", "critical"][i % 4],
            })
            assert resp.status_code == 201
            tasks.append(resp.json())

        resp = client.get("/tasks/")
        assert len(resp.json()) == 5

        resp = client.get("/tasks/", params={"status": "todo"})
        assert len(resp.json()) == 5

        resp = client.patch(f"/tasks/{tasks[0]['id']}", json={"status": "in_progress"})
        assert resp.status_code == 200

        resp = client.get("/tasks/", params={"status": "todo"})
        assert len(resp.json()) == 4
        resp = client.get("/tasks/", params={"status": "in_progress"})
        assert len(resp.json()) == 1

        client.delete(f"/tasks/{tasks[4]['id']}")
        resp = client.get("/tasks/")
        assert len(resp.json()) == 4

    def test_filter_workflow(self, client):
        client.post("/tasks/", json={"title": "Low task", "priority": "low", "due_date": "2024-01-01T00:00:00"})
        client.post("/tasks/", json={"title": "High task", "priority": "high", "due_date": "2027-01-01T00:00:00"})
        client.post("/tasks/", json={"title": "Critical task", "priority": "critical"})

        resp = client.get("/tasks/", params={"priority": "high"})
        assert len(resp.json()) == 1
        assert resp.json()[0]["title"] == "High task"

        resp = client.get("/tasks/", params={"due_before": "2025-01-01T00:00:00"})
        assert len(resp.json()) == 1
        assert resp.json()[0]["title"] == "Low task"

        resp = client.get("/tasks/", params={"status": "todo", "priority": "critical"})
        assert len(resp.json()) == 1

    def test_update_and_delete_interleaved(self, client):
        t1 = client.post("/tasks/", json={"title": "First"}).json()
        t2 = client.post("/tasks/", json={"title": "Second"}).json()

        client.patch(f"/tasks/{t1['id']}", json={"status": "in_progress"})
        client.delete(f"/tasks/{t2['id']}")

        resp = client.get("/tasks/")
        assert len(resp.json()) == 1
        assert resp.json()[0]["status"] == "in_progress"

    def test_reopen_completed_task_workflow(self, client):
        t = client.post("/tasks/", json={"title": "Bug report"}).json()
        client.patch(f"/tasks/{t['id']}", json={"status": "in_progress"})
        client.patch(f"/tasks/{t['id']}", json={"status": "done"})
        resp = client.patch(f"/tasks/{t['id']}", json={"status": "in_progress"})
        assert resp.json()["status"] == "in_progress"
        client.patch(f"/tasks/{t['id']}", json={"status": "todo"})
        resp = client.get(f"/tasks/{t['id']}")
        assert resp.json()["status"] == "todo"

    def test_concurrent_task_operations_isolated(self, client):
        t1 = client.post("/tasks/", json={"title": "A"}).json()
        t2 = client.post("/tasks/", json={"title": "B"}).json()

        client.patch(f"/tasks/{t1['id']}", json={"title": "A-updated"})
        client.delete(f"/tasks/{t2['id']}")
        client.patch(f"/tasks/{t1['id']}", json={"status": "in_progress"})

        resp = client.get(f"/tasks/{t1['id']}")
        assert resp.json()["title"] == "A-updated"
        assert resp.json()["status"] == "in_progress"

        resp = client.get(f"/tasks/{t2['id']}")
        assert resp.status_code == 404


class TestAPIResponseConsistency:
    """Verify API response format consistency."""

    def test_create_response_matches_get_response(self, client):
        create_resp = client.post("/tasks/", json={"title": "Consistent"})
        created = create_resp.json()
        get_resp = client.get(f"/tasks/{created['id']}")
        fetched = get_resp.json()
        assert created["id"] == fetched["id"]
        assert created["title"] == fetched["title"]
        assert created["status"] == fetched["status"]

    def test_update_response_matches_get_response(self, client):
        t = client.post("/tasks/", json={"title": "Original"}).json()
        update_resp = client.patch(f"/tasks/{t['id']}", json={"title": "Updated"})
        updated = update_resp.json()
        get_resp = client.get(f"/tasks/{t['id']}")
        fetched = get_resp.json()
        assert updated["title"] == fetched["title"]

    def test_list_items_match_get_by_id(self, client):
        client.post("/tasks/", json={"title": "A"})
        client.post("/tasks/", json={"title": "B"})
        list_resp = client.get("/tasks/")
        for item in list_resp.json():
            get_resp = client.get(f"/tasks/{item['id']}")
            assert get_resp.json()["title"] == item["title"]

    def test_all_endpoints_return_json(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        assert client.get("/tasks/").headers["content-type"] == "application/json"
        assert client.get(f"/tasks/{t['id']}").headers["content-type"] == "application/json"
        assert client.post("/tasks/", json={"title": "T2"}).headers["content-type"] == "application/json"
        assert client.patch(f"/tasks/{t['id']}", json={"title": "X"}).headers["content-type"] == "application/json"

    def test_task_response_field_types_consistent(self, client):
        resp = client.post("/tasks/", json={
            "title": "Typecheck",
            "description": "Desc",
            "priority": "high",
            "due_date": "2026-06-01T00:00:00",
        })
        data = resp.json()
        assert isinstance(data["id"], int)
        assert isinstance(data["title"], str)
        assert isinstance(data["description"], str)
        assert isinstance(data["priority"], str)
        assert isinstance(data["status"], str)
        assert isinstance(data["due_date"], str)
        assert isinstance(data["created_at"], str)
        assert isinstance(data["updated_at"], str)

        get_resp = client.get(f"/tasks/{data['id']}")
        get_data = get_resp.json()
        assert type(get_data["id"]) == type(data["id"])
        assert type(get_data["title"]) == type(data["title"])
        assert type(get_data["description"]) == type(data["description"])


class TestRouterParseDatetime:
    """Additional tests for _parse_dt."""

    def test_parse_datetime_with_microseconds(self):
        from app.router import _parse_dt
        result = _parse_dt("2026-06-15T12:30:00.123456")
        assert result.year == 2026
        assert result.month == 6
        assert result.day == 15

    def test_parse_datetime_with_utc_offset(self):
        from app.router import _parse_dt
        result = _parse_dt("2026-06-15T12:00:00+00:00")
        assert result.year == 2026

    def test_parse_datetime_with_negative_offset(self):
        from app.router import _parse_dt
        result = _parse_dt("2026-06-15T12:00:00-05:00")
        assert result.year == 2026

    def test_parse_datetime_date_only(self):
        from app.router import _parse_dt
        result = _parse_dt("2026-06-15")
        assert result == datetime(2026, 6, 15)

    def test_parse_datetime_invalid_raises_422(self):
        from fastapi import HTTPException
        from app.router import _parse_dt
        with pytest.raises(HTTPException) as exc:
            _parse_dt("invalid")
        assert exc.value.status_code == 422
        assert "invalid" in str(exc.value.detail).lower()


class TestErrorPaths:
    """Test error handling paths."""

    def test_create_with_wrong_field_types(self, client):
        resp = client.post("/tasks/", json={"title": 123})
        assert resp.status_code == 422

    def test_create_with_nested_object(self, client):
        resp = client.post("/tasks/", json={"title": {"nested": "obj"}})
        assert resp.status_code == 422

    def test_patch_nonexistent_large_id(self, client):
        resp = client.patch("/tasks/999999", json={"title": "X"})
        assert resp.status_code == 404

    def test_get_with_very_large_id(self, client):
        resp = client.get("/tasks/999999999")
        assert resp.status_code == 404

    def test_delete_already_deleted_task(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        client.delete(f"/tasks/{t['id']}")
        resp = client.delete(f"/tasks/{t['id']}")
        assert resp.status_code == 404

    def test_update_invalid_transition_error_detail(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"status": "done"})
        assert resp.status_code == 409
        detail = resp.json()["detail"]
        assert "Cannot transition" in detail

    def test_list_with_malformed_due_before(self, client):
        resp = client.get("/tasks/", params={"due_before": "not-a-date"})
        assert resp.status_code == 422
        assert "Invalid datetime" in resp.json()["detail"]


class TestAppConfiguration:
    """Test FastAPI app setup."""

    def test_app_has_openapi(self, client):
        resp = client.get("/openapi.json")
        assert resp.status_code == 200
        schema = resp.json()
        assert "paths" in schema
        assert "/tasks/" in schema["paths"]

    def test_app_docs_endpoint(self, client):
        resp = client.get("/docs")
        assert resp.status_code == 200

    def test_app_redoc_endpoint(self, client):
        resp = client.get("/redoc")
        assert resp.status_code == 200

    def test_app_openapi_info(self, client):
        resp = client.get("/openapi.json")
        schema = resp.json()
        assert schema["info"]["title"] == "TaskPilot"
        assert schema["info"]["version"] == "0.1.0"


class TestModelConstraints:
    """Test model-level constraints."""

    def test_task_model_has_correct_tablename(self):
        assert Task.__tablename__ == "tasks"

    def test_priority_enum_is_str_enum(self):
        assert issubclass(Priority, str)

    def test_status_enum_is_str_enum(self):
        assert issubclass(Status, str)

    def test_priority_all_four_values(self):
        values = {p.value for p in Priority}
        assert values == {"low", "medium", "high", "critical"}

    def test_status_all_three_values(self):
        values = {s.value for s in Status}
        assert values == {"todo", "in_progress", "done"}

    def test_task_created_at_auto_populated(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        assert task.created_at is not None
        assert isinstance(task.created_at, datetime)

    def test_task_updated_at_auto_populated(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        assert task.updated_at is not None
        assert isinstance(task.updated_at, datetime)

    def test_task_default_values(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        assert task.status == "todo"
        assert task.priority == "medium"
        assert task.description == ""
        assert task.due_date is None
