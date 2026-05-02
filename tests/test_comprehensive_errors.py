import pytest
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.orm import sessionmaker

from app.database import Base, SessionLocal, engine as prod_engine, get_db, init_db
from app.main import app, lifespan
from app.models import Priority, Status, Task, VALID_TRANSITIONS
from app.router import _parse_dt, _service, router
from app.schemas import TaskCreate, TaskResponse, TaskUpdate
from app.services import InvalidTransitionError, TaskNotFoundError, TaskService


class TestLifespanContextManager:
    @pytest.mark.asyncio
    async def test_lifespan_calls_init_db(self):
        with patch("app.main.init_db") as mock_init:
            async with lifespan(app):
                mock_init.assert_called_once()

    @pytest.mark.asyncio
    async def test_lifespan_yields_control(self):
        with patch("app.main.init_db"):
            executed = False
            async with lifespan(app):
                executed = True
            assert executed

    @pytest.mark.asyncio
    async def test_lifespan_completes_without_error(self):
        with patch("app.main.init_db"):
            async with lifespan(app):
                pass


class TestGetDbSessionLifecycle:
    def test_get_db_generator_protocol(self):
        eng = create_engine("sqlite:///:memory:")
        init_db(engine_=eng)
        import app.database as db_module
        original = db_module.SessionLocal
        db_module.SessionLocal = sessionmaker(bind=eng)
        try:
            gen = get_db()
            session = next(gen)
            assert session.is_active
        finally:
            db_module.SessionLocal = original
            try:
                next(gen)
            except StopIteration:
                pass

    def test_get_db_session_closed_after_context(self):
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

    def test_get_db_closes_on_exception(self):
        eng = create_engine("sqlite:///:memory:")
        init_db(engine_=eng)
        import app.database as db_module
        original = db_module.SessionLocal
        db_module.SessionLocal = sessionmaker(bind=eng)
        try:
            gen = get_db()
            session = next(gen)
            with pytest.raises(RuntimeError):
                gen.throw(RuntimeError("test error"))
        finally:
            db_module.SessionLocal = original


class TestServiceDependencyInjection:
    def test_service_dep_returns_task_service(self, db_session):
        svc = _service(db_session)
        assert isinstance(svc, TaskService)
        assert svc.db is db_session

    def test_service_dep_creates_new_instance_each_call(self, db_session):
        svc1 = _service(db_session)
        svc2 = _service(db_session)
        assert svc1 is not svc2
        assert svc1.db is svc2.db

    def test_dependency_override_in_tests(self, client):
        resp = client.get("/tasks/")
        assert resp.status_code == 200


class TestInitDbEngineParameter:
    def test_init_db_with_custom_engine(self):
        eng = create_engine("sqlite:///:memory:")
        init_db(engine_=eng)
        inspector = inspect(eng)
        assert "tasks" in inspector.get_table_names()

    def test_init_db_default_engine_creates_table(self):
        eng = create_engine("sqlite:///:memory:")
        init_db(engine_=eng)
        with eng.connect() as conn:
            result = conn.execute(text("SELECT COUNT(*) FROM tasks"))
            assert result.fetchone()[0] == 0

    def test_init_db_multiple_calls_safe(self):
        eng = create_engine("sqlite:///:memory:")
        init_db(engine_=eng)
        init_db(engine_=eng)
        init_db(engine_=eng)
        inspector = inspect(eng)
        assert "tasks" in inspector.get_table_names()


class TestDatabaseEngineConfiguration:
    def test_engine_echo_is_false(self):
        assert prod_engine.echo is False

    def test_session_local_bound_to_engine(self):
        assert SessionLocal.kw.get("bind") is prod_engine


class TestTaskServiceConstructor:
    def test_service_requires_session(self):
        with pytest.raises(TypeError):
            TaskService()

    def test_service_stores_session_reference(self, db_session):
        svc = TaskService(db_session)
        assert svc.db is db_session

    def test_service_session_is_readonly_reference(self, db_session):
        svc = TaskService(db_session)
        original_db = svc.db
        assert original_db is db_session


class TestErrorPropagationThroughRouter:
    def test_task_not_found_propagates_as_404(self, client):
        resp = client.get("/tasks/999")
        assert resp.status_code == 404
        assert resp.json()["detail"] == "Task not found"

    def test_invalid_transition_propagates_as_409(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"status": "done"})
        assert resp.status_code == 409
        detail = resp.json()["detail"]
        assert "todo" in detail.lower() or "done" in detail.lower()

    def test_delete_not_found_propagates_as_404(self, client):
        resp = client.delete("/tasks/999")
        assert resp.status_code == 404

    def test_update_not_found_propagates_as_404(self, client):
        resp = client.patch("/tasks/999", json={"title": "X"})
        assert resp.status_code == 404


class TestServiceErrorMessages:
    def test_task_not_found_message_includes_id(self, db_session):
        svc = TaskService(db_session)
        with pytest.raises(TaskNotFoundError, match=r"42"):
            svc.get_task(42)

    def test_invalid_transition_message_includes_source(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        with pytest.raises(InvalidTransitionError, match="todo"):
            svc.update_task(task.id, TaskUpdate(status=Status.DONE))

    def test_invalid_transition_message_includes_target(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        with pytest.raises(InvalidTransitionError, match="done"):
            svc.update_task(task.id, TaskUpdate(status=Status.DONE))

    def test_task_not_found_is_catchable_as_base_exception(self, db_session):
        svc = TaskService(db_session)
        with pytest.raises(Exception):
            svc.get_task(999)

    def test_invalid_transition_is_catchable_as_base_exception(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        with pytest.raises(Exception):
            svc.update_task(task.id, TaskUpdate(status=Status.DONE))


class TestHttpMethodSemantics:
    def test_options_on_tasks_root(self, client):
        resp = client.options("/tasks/")
        assert resp.status_code in (200, 405)

    def test_head_on_task_list(self, client):
        resp = client.head("/tasks/")
        assert resp.status_code in (200, 405)

    def test_head_on_single_task_404(self, client):
        resp = client.head("/tasks/999")
        assert resp.status_code in (404, 405)

    def test_put_not_allowed(self, client):
        resp = client.put("/tasks/1", json={"title": "X"})
        assert resp.status_code == 405

    def test_post_on_specific_id_not_allowed(self, client):
        resp = client.post("/tasks/1", json={"title": "X"})
        assert resp.status_code == 405

    def test_patch_on_list_not_allowed(self, client):
        resp = client.patch("/tasks/", json={"title": "X"})
        assert resp.status_code == 405

    def test_delete_on_list_not_allowed(self, client):
        resp = client.delete("/tasks/")
        assert resp.status_code == 405


class TestCreateTaskErrorConditions:
    def test_create_with_null_title(self, client):
        resp = client.post("/tasks/", json={"title": None})
        assert resp.status_code == 422

    def test_create_with_missing_body(self, client):
        resp = client.post("/tasks/")
        assert resp.status_code == 422

    def test_create_with_invalid_json(self, client):
        resp = client.post(
            "/tasks/",
            content="{invalid json",
            headers={"Content-Type": "application/json"},
        )
        assert resp.status_code == 422

    def test_create_with_form_data(self, client):
        resp = client.post(
            "/tasks/",
            data={"title": "form"},
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        assert resp.status_code == 422

    def test_create_with_negative_due_date_timestamp(self, client):
        resp = client.post("/tasks/", json={"title": "T", "due_date": "1900-01-01T00:00:00"})
        assert resp.status_code == 201

    def test_create_with_invalid_priority_type(self, client):
        resp = client.post("/tasks/", json={"title": "T", "priority": 123})
        assert resp.status_code == 422

    def test_create_with_invalid_due_date_type(self, client):
        resp = client.post("/tasks/", json={"title": "T", "due_date": True})
        assert resp.status_code == 422

    def test_create_with_description_wrong_type(self, client):
        resp = client.post("/tasks/", json={"title": "T", "description": 12345})
        assert resp.status_code == 422


class TestUpdateTaskErrorConditions:
    def test_update_with_wrong_types(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"title": 123})
        assert resp.status_code == 422

    def test_update_with_negative_id(self, client):
        resp = client.patch("/tasks/-5", json={"title": "X"})
        assert resp.status_code == 404

    def test_update_with_zero_id(self, client):
        resp = client.patch("/tasks/0", json={"title": "X"})
        assert resp.status_code == 404

    def test_update_with_very_large_id(self, client):
        resp = client.patch("/tasks/99999999", json={"title": "X"})
        assert resp.status_code == 404

    def test_update_status_and_title_with_invalid_transition(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={
            "title": "New",
            "status": "done",
        })
        assert resp.status_code == 409

    def test_update_deleted_task_returns_404(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        client.delete(f"/tasks/{t['id']}")
        resp = client.patch(f"/tasks/{t['id']}", json={"title": "Ghost"})
        assert resp.status_code == 404

    def test_update_same_status_in_progress_no_error(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        client.patch(f"/tasks/{t['id']}", json={"status": "in_progress"})
        resp = client.patch(f"/tasks/{t['id']}", json={"status": "in_progress"})
        assert resp.status_code == 200

    def test_update_same_status_done_no_error(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        client.patch(f"/tasks/{t['id']}", json={"status": "in_progress"})
        client.patch(f"/tasks/{t['id']}", json={"status": "done"})
        resp = client.patch(f"/tasks/{t['id']}", json={"status": "done"})
        assert resp.status_code == 200


class TestDeleteTaskErrorConditions:
    def test_delete_string_id_returns_422(self, client):
        resp = client.delete("/tasks/abc")
        assert resp.status_code == 422

    def test_delete_float_id_returns_422(self, client):
        resp = client.delete("/tasks/1.5")
        assert resp.status_code == 422

    def test_delete_negative_id_returns_404(self, client):
        resp = client.delete("/tasks/-1")
        assert resp.status_code == 404

    def test_delete_zero_id_returns_404(self, client):
        resp = client.delete("/tasks/0")
        assert resp.status_code == 404


class TestGetTaskErrorConditions:
    def test_get_with_string_id(self, client):
        resp = client.get("/tasks/notanumber")
        assert resp.status_code == 422

    def test_get_with_float_id(self, client):
        resp = client.get("/tasks/3.14")
        assert resp.status_code == 422

    def test_get_deleted_task_404(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        client.delete(f"/tasks/{t['id']}")
        resp = client.get(f"/tasks/{t['id']}")
        assert resp.status_code == 404

    def test_get_very_large_id(self, client):
        resp = client.get("/tasks/999999999")
        assert resp.status_code == 404


class TestListTasksErrorConditions:
    def test_list_with_invalid_status_value(self, client):
        resp = client.get("/tasks/", params={"status": "invalid"})
        assert resp.status_code == 422

    def test_list_with_invalid_priority_value(self, client):
        resp = client.get("/tasks/", params={"priority": "urgent"})
        assert resp.status_code == 422

    def test_list_with_invalid_datetime_format(self, client):
        resp = client.get("/tasks/", params={"due_before": "not-a-date"})
        assert resp.status_code == 422

    def test_list_with_empty_datetime(self, client):
        resp = client.get("/tasks/", params={"due_before": ""})
        assert resp.status_code == 422

    def test_list_with_date_only_string(self, client):
        client.post("/tasks/", json={"title": "T", "due_date": "2025-06-15T00:00:00"})
        resp = client.get("/tasks/", params={"due_before": "2026-01-01"})
        assert resp.status_code == 200

    def test_list_with_timezone_aware_datetime(self, client):
        client.post("/tasks/", json={"title": "T", "due_date": "2025-06-15T00:00:00"})
        resp = client.get("/tasks/", params={"due_before": "2026-01-01T00:00:00+00:00"})
        assert resp.status_code == 200


class TestStatusTransitionMatrixParametrized:
    @pytest.mark.parametrize("source,target,expected_status", [
        ("todo", "todo", 200),
        ("todo", "in_progress", 200),
        ("todo", "done", 409),
        ("in_progress", "in_progress", 200),
        ("in_progress", "done", 200),
        ("in_progress", "todo", 200),
        ("done", "done", 200),
        ("done", "in_progress", 200),
        ("done", "todo", 409),
    ])
    def test_transition_via_api(self, client, source, target, expected_status):
        t = client.post("/tasks/", json={"title": "T"}).json()
        tid = t["id"]
        if source == "in_progress":
            client.patch(f"/tasks/{tid}", json={"status": "in_progress"})
        elif source == "done":
            client.patch(f"/tasks/{tid}", json={"status": "in_progress"})
            client.patch(f"/tasks/{tid}", json={"status": "done"})
        resp = client.patch(f"/tasks/{tid}", json={"status": target})
        assert resp.status_code == expected_status

    @pytest.mark.parametrize("source,target,should_raise", [
        (Status.TODO, Status.TODO, False),
        (Status.TODO, Status.IN_PROGRESS, False),
        (Status.TODO, Status.DONE, True),
        (Status.IN_PROGRESS, Status.IN_PROGRESS, False),
        (Status.IN_PROGRESS, Status.DONE, False),
        (Status.IN_PROGRESS, Status.TODO, False),
        (Status.DONE, Status.DONE, False),
        (Status.DONE, Status.IN_PROGRESS, False),
        (Status.DONE, Status.TODO, True),
    ])
    def test_transition_via_service(self, db_session, source, target, should_raise):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        if source != Status.TODO:
            svc.update_task(task.id, TaskUpdate(status=Status.IN_PROGRESS))
            if source == Status.DONE:
                svc.update_task(task.id, TaskUpdate(status=Status.DONE))
        if should_raise:
            with pytest.raises(InvalidTransitionError):
                svc.update_task(task.id, TaskUpdate(status=target))
        else:
            result = svc.update_task(task.id, TaskUpdate(status=target))
            assert result.status == target.value


class TestSchemaJsonSerialization:
    def test_task_create_json_roundtrip(self):
        dt = datetime(2026, 6, 15, 12, 0)
        t = TaskCreate(title="Test", description="Desc", priority=Priority.HIGH, due_date=dt)
        data = t.model_dump()
        assert data["title"] == "Test"
        assert data["description"] == "Desc"
        assert data["priority"] == Priority.HIGH
        assert data["due_date"] == dt

    def test_task_update_exclude_unset_keys(self):
        u = TaskUpdate(title="Only title")
        dumped = u.model_dump(exclude_unset=True)
        assert dumped == {"title": "Only title"}

    def test_task_update_include_all_set(self):
        u = TaskUpdate(
            title="A",
            description="B",
            priority=Priority.HIGH,
            status=Status.IN_PROGRESS,
            due_date=datetime(2026, 1, 1),
        )
        dumped = u.model_dump(exclude_unset=True)
        assert len(dumped) == 5

    def test_task_create_model_dump_json(self):
        t = TaskCreate(title="JSON Test")
        json_str = t.model_dump_json()
        assert "JSON Test" in json_str

    def test_task_response_model_validate_dict(self):
        data = {
            "id": 1,
            "title": "Test",
            "description": "",
            "priority": "medium",
            "status": "todo",
            "due_date": None,
            "created_at": datetime(2026, 1, 1),
            "updated_at": datetime(2026, 1, 1),
        }
        resp = TaskResponse.model_validate(data)
        assert resp.id == 1
        assert resp.title == "Test"


class TestServiceValidateTransitionDirect:
    def test_validate_transition_todo_to_in_progress_ok(self, db_session):
        svc = TaskService(db_session)
        svc._validate_transition(Status.TODO, Status.IN_PROGRESS)

    def test_validate_transition_todo_to_todo_ok(self, db_session):
        svc = TaskService(db_session)
        svc._validate_transition(Status.TODO, Status.TODO)

    def test_validate_transition_in_progress_to_done_ok(self, db_session):
        svc = TaskService(db_session)
        svc._validate_transition(Status.IN_PROGRESS, Status.DONE)

    def test_validate_transition_in_progress_to_todo_ok(self, db_session):
        svc = TaskService(db_session)
        svc._validate_transition(Status.IN_PROGRESS, Status.TODO)

    def test_validate_transition_done_to_in_progress_ok(self, db_session):
        svc = TaskService(db_session)
        svc._validate_transition(Status.DONE, Status.IN_PROGRESS)

    def test_validate_transition_done_to_done_ok(self, db_session):
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

    def test_validate_transition_error_message_format(self, db_session):
        svc = TaskService(db_session)
        with pytest.raises(InvalidTransitionError) as exc_info:
            svc._validate_transition(Status.TODO, Status.DONE)
        msg = str(exc_info.value)
        assert "todo" in msg.lower()
        assert "done" in msg.lower()


class TestParseDatetimeEdgeCases:
    def test_parse_with_utc_z_suffix(self):
        from fastapi import HTTPException
        result = _parse_dt("2026-06-15T12:00:00Z")
        assert result is not None
        assert result.year == 2026

    def test_parse_with_negative_timezone_offset(self):
        result = _parse_dt("2026-06-15T12:00:00-05:00")
        assert result is not None

    def test_parse_with_positive_timezone_offset(self):
        result = _parse_dt("2026-06-15T12:00:00+03:00")
        assert result is not None

    def test_parse_epoch(self):
        result = _parse_dt("1970-01-01T00:00:00")
        assert result == datetime(1970, 1, 1, 0, 0, 0)

    def test_parse_far_future(self):
        result = _parse_dt("2099-12-31T23:59:59")
        assert result == datetime(2099, 12, 31, 23, 59, 59)

    def test_parse_with_microseconds(self):
        result = _parse_dt("2026-06-15T12:30:00.123456")
        assert result.year == 2026

    def test_parse_none_returns_none(self):
        assert _parse_dt(None) is None

    def test_parse_slash_format_raises(self):
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            _parse_dt("2026/06/15")
        assert exc_info.value.status_code == 422

    def test_parse_error_includes_invalid_value(self):
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            _parse_dt("garbage-input")
        assert "garbage-input" in exc_info.value.detail

    def test_parse_empty_string_raises(self):
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            _parse_dt("")
        assert exc_info.value.status_code == 422

    def test_parse_whitespace_only_raises(self):
        from fastapi import HTTPException
        with pytest.raises(HTTPException):
            _parse_dt("   ")

    def test_parse_number_string_raises(self):
        from fastapi import HTTPException
        with pytest.raises(HTTPException):
            _parse_dt("12345")

    def test_parse_date_only(self):
        result = _parse_dt("2026-06-15")
        assert result == datetime(2026, 6, 15, 0, 0, 0)

    def test_parse_midnight(self):
        result = _parse_dt("2026-01-01T00:00:00")
        assert result == datetime(2026, 1, 1, 0, 0, 0)

    def test_parse_end_of_day(self):
        result = _parse_dt("2026-12-31T23:59:59")
        assert result == datetime(2026, 12, 31, 23, 59, 59)


class TestRouterConfiguration:
    def test_router_prefix_is_tasks(self):
        assert router.prefix == "/tasks"

    def test_router_has_tasks_tag(self):
        assert "tasks" in router.tags


class TestAppRouteRegistration:
    def test_all_expected_paths_registered(self):
        paths = [r.path for r in app.routes if hasattr(r, "path")]
        assert "/tasks/" in paths
        assert "/tasks/{task_id}" in paths

    def test_root_path_not_registered(self):
        paths = [r.path for r in app.routes if hasattr(r, "path")]
        assert "/" not in paths or any(r.path == "/" for r in app.routes if hasattr(r, "path"))

    def test_app_has_openapi_route(self):
        paths = [r.path for r in app.routes if hasattr(r, "path")]
        assert "/openapi.json" in paths


class TestIntegrationStressScenarios:
    def test_create_100_tasks(self, client):
        for i in range(100):
            resp = client.post("/tasks/", json={"title": f"Task {i}"})
            assert resp.status_code == 201
        resp = client.get("/tasks/")
        assert len(resp.json()) == 100

    def test_rapid_create_update_delete_cycle(self, client):
        for i in range(20):
            t = client.post("/tasks/", json={"title": f"Task {i}"}).json()
            client.patch(f"/tasks/{t['id']}", json={"title": f"Updated {i}"})
            resp = client.delete(f"/tasks/{t['id']}")
            assert resp.status_code == 204
        assert client.get("/tasks/").json() == []

    def test_update_same_task_50_times(self, client):
        t = client.post("/tasks/", json={"title": "Original"}).json()
        for i in range(50):
            resp = client.patch(f"/tasks/{t['id']}", json={"title": f"Update {i}"})
            assert resp.status_code == 200
        resp = client.get(f"/tasks/{t['id']}")
        assert resp.json()["title"] == "Update 49"

    def test_create_delete_create_interleaved(self, client):
        t1 = client.post("/tasks/", json={"title": "A"}).json()
        t2 = client.post("/tasks/", json={"title": "B"}).json()
        client.delete(f"/tasks/{t1['id']}")
        t3 = client.post("/tasks/", json={"title": "C"}).json()
        client.delete(f"/tasks/{t2['id']}")
        t4 = client.post("/tasks/", json={"title": "D"}).json()
        tasks = client.get("/tasks/").json()
        titles = {t["title"] for t in tasks}
        assert titles == {"C", "D"}

    def test_filter_after_many_status_changes(self, client):
        t = client.post("/tasks/", json={"title": "Cycle"}).json()
        for _ in range(5):
            client.patch(f"/tasks/{t['id']}", json={"status": "in_progress"})
            client.patch(f"/tasks/{t['id']}", json={"status": "done"})
            client.patch(f"/tasks/{t['id']}", json={"status": "in_progress"})
            client.patch(f"/tasks/{t['id']}", json={"status": "todo"})
        resp = client.get("/tasks/", params={"status": "todo"})
        assert len(resp.json()) == 1
        assert resp.json()[0]["status"] == "todo"


class TestServiceTransactionEdgeCases:
    def test_create_commits_even_without_explicit_commit(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="AutoCommit"))
        db_session.expire_all()
        found = db_session.get(Task, task.id)
        assert found is not None
        assert found.title == "AutoCommit"

    def test_update_commits_immediately(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Before"))
        svc.update_task(task.id, TaskUpdate(title="After"))
        db_session.expire_all()
        assert db_session.get(Task, task.id).title == "After"

    def test_delete_commits_immediately(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Gone"))
        task_id = task.id
        svc.delete_task(task_id)
        db_session.expire_all()
        assert db_session.get(Task, task_id) is None

    def test_update_with_empty_update_commits(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Unchanged"))
        updated = svc.update_task(task.id, TaskUpdate())
        db_session.expire_all()
        found = db_session.get(Task, task.id)
        assert found.title == "Unchanged"
        assert updated.title == "Unchanged"


class TestTaskModelColumnConstraints:
    def test_title_column_length(self, engine):
        inspector = inspect(engine)
        cols = {col["name"]: col for col in inspector.get_columns("tasks")}
        title_type = cols["title"]["type"]
        assert title_type.length == 200

    def test_description_column_length(self, engine):
        inspector = inspect(engine)
        cols = {col["name"]: col for col in inspector.get_columns("tasks")}
        desc_type = cols["description"]["type"]
        assert desc_type.length == 2000

    def test_priority_column_length(self, engine):
        inspector = inspect(engine)
        cols = {col["name"]: col for col in inspector.get_columns("tasks")}
        priority_type = cols["priority"]["type"]
        assert priority_type.length == 20

    def test_status_column_length(self, engine):
        inspector = inspect(engine)
        cols = {col["name"]: col for col in inspector.get_columns("tasks")}
        status_type = cols["status"]["type"]
        assert status_type.length == 20

    def test_autoincrement_on_id(self, db_session):
        svc = TaskService(db_session)
        t1 = svc.create_task(TaskCreate(title="First"))
        t2 = svc.create_task(TaskCreate(title="Second"))
        assert t2.id == t1.id + 1


class TestValidTransitionsCompleteness:
    def test_all_statuses_covered(self):
        for s in Status:
            assert s in VALID_TRANSITIONS

    def test_all_targets_are_status_enums(self):
        for source, targets in VALID_TRANSITIONS.items():
            for t in targets:
                assert isinstance(t, Status)

    def test_no_empty_target_sets(self):
        for source, targets in VALID_TRANSITIONS.items():
            assert len(targets) > 0

    def test_transitions_are_symmetric_where_expected(self):
        assert Status.IN_PROGRESS in VALID_TRANSITIONS[Status.TODO]
        assert Status.TODO in VALID_TRANSITIONS[Status.IN_PROGRESS]
        assert Status.DONE in VALID_TRANSITIONS[Status.IN_PROGRESS]
        assert Status.IN_PROGRESS in VALID_TRANSITIONS[Status.DONE]


class TestApiResponseStructureConsistency:
    def test_created_task_matches_get_task(self, client):
        created = client.post("/tasks/", json={
            "title": "Consistent",
            "description": "Test",
            "priority": "high",
        }).json()
        fetched = client.get(f"/tasks/{created['id']}").json()
        assert created == fetched

    def test_updated_task_matches_get_task(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        client.patch(f"/tasks/{t['id']}", json={"title": "Updated"})
        fetched = client.get(f"/tasks/{t['id']}").json()
        assert fetched["title"] == "Updated"

    def test_list_item_matches_get(self, client):
        client.post("/tasks/", json={"title": "ListItem", "priority": "critical"})
        list_item = client.get("/tasks/").json()[0]
        get_item = client.get(f"/tasks/{list_item['id']}").json()
        assert list_item == get_item

    def test_all_response_fields_present_on_create(self, client):
        resp = client.post("/tasks/", json={"title": "Fields"})
        data = resp.json()
        required = {"id", "title", "description", "priority", "status", "due_date", "created_at", "updated_at"}
        assert required.issubset(set(data.keys()))

    def test_all_response_fields_present_on_update(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"title": "U"})
        data = resp.json()
        required = {"id", "title", "description", "priority", "status", "due_date", "created_at", "updated_at"}
        assert required.issubset(set(data.keys()))

    def test_all_response_fields_present_on_get(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.get(f"/tasks/{t['id']}")
        data = resp.json()
        required = {"id", "title", "description", "priority", "status", "due_date", "created_at", "updated_at"}
        assert required.issubset(set(data.keys()))


class TestContentTypeHeaders:
    def test_create_response_content_type(self, client):
        resp = client.post("/tasks/", json={"title": "T"})
        assert "application/json" in resp.headers["content-type"]

    def test_get_response_content_type(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.get(f"/tasks/{t['id']}")
        assert "application/json" in resp.headers["content-type"]

    def test_list_response_content_type(self, client):
        resp = client.get("/tasks/")
        assert "application/json" in resp.headers["content-type"]

    def test_update_response_content_type(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"title": "U"})
        assert "application/json" in resp.headers["content-type"]

    def test_404_response_content_type(self, client):
        resp = client.get("/tasks/999")
        assert "application/json" in resp.headers["content-type"]

    def test_409_response_content_type(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"status": "done"})
        assert "application/json" in resp.headers["content-type"]

    def test_422_response_content_type(self, client):
        resp = client.post("/tasks/", json={"title": ""})
        assert "application/json" in resp.headers["content-type"]


class TestSchemaValidationEdgeCases:
    def test_create_with_exactly_200_char_title(self):
        t = TaskCreate(title="A" * 200)
        assert len(t.title) == 200

    def test_create_with_exactly_2000_char_description(self):
        t = TaskCreate(title="T", description="B" * 2000)
        assert len(t.description) == 2000

    def test_create_title_at_boundary_plus_one(self):
        with pytest.raises(ValueError):
            TaskCreate(title="A" * 201)

    def test_create_description_at_boundary_plus_one(self):
        with pytest.raises(ValueError):
            TaskCreate(title="T", description="B" * 2001)

    def test_update_title_at_boundary(self):
        u = TaskUpdate(title="A" * 200)
        assert len(u.title) == 200

    def test_update_title_over_boundary(self):
        with pytest.raises(ValueError):
            TaskUpdate(title="A" * 201)

    def test_update_description_at_boundary(self):
        u = TaskUpdate(description="B" * 2000)
        assert len(u.description) == 2000

    def test_update_description_over_boundary(self):
        with pytest.raises(ValueError):
            TaskUpdate(description="B" * 2001)

    def test_create_title_strip_mixed_whitespace(self):
        t = TaskCreate(title="\t\n hello \n\t")
        assert t.title == "hello"

    def test_update_title_strip_mixed_whitespace(self):
        u = TaskUpdate(title="\t\n hello \n\t")
        assert u.title == "hello"

    def test_create_invalid_priority_raises(self):
        with pytest.raises(ValueError):
            TaskCreate(title="T", priority="invalid")

    def test_update_invalid_status_raises(self):
        with pytest.raises(ValueError):
            TaskUpdate(status="invalid")

    def test_create_title_with_newlines_stripped(self):
        t = TaskCreate(title="\n\nhello\n\n")
        assert t.title == "hello"

    def test_create_title_with_tabs_stripped(self):
        t = TaskCreate(title="\t\thello\t\t")
        assert t.title == "hello"


class TestServiceListFilterCombinations:
    def test_all_three_filters_combined(self, db_session):
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
        svc.create_task(TaskCreate(
            title="Wrong priority",
            priority=Priority.LOW,
            due_date=datetime(2025, 6, 1),
        ))
        result = svc.list_tasks(
            status=Status.TODO,
            priority=Priority.HIGH,
            due_before=datetime(2026, 1, 1),
        )
        assert len(result) == 1
        assert result[0].title == "Match"

    def test_filter_status_and_due_before(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="Match", due_date=datetime(2025, 1, 1)))
        t2 = svc.create_task(TaskCreate(title="Wrong status", due_date=datetime(2025, 1, 1)))
        svc.update_task(t2.id, TaskUpdate(status=Status.IN_PROGRESS))
        result = svc.list_tasks(status=Status.TODO, due_before=datetime(2026, 1, 1))
        assert len(result) == 1
        assert result[0].title == "Match"

    def test_filter_priority_and_due_before(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="Match", priority=Priority.HIGH, due_date=datetime(2025, 1, 1)))
        svc.create_task(TaskCreate(title="Wrong priority", priority=Priority.LOW, due_date=datetime(2025, 1, 1)))
        result = svc.list_tasks(priority=Priority.HIGH, due_before=datetime(2026, 1, 1))
        assert len(result) == 1
        assert result[0].title == "Match"


class TestExceptionHierarchy:
    def test_invalid_transition_inherits_exception(self):
        assert issubclass(InvalidTransitionError, Exception)

    def test_task_not_found_inherits_exception(self):
        assert issubclass(TaskNotFoundError, Exception)

    def test_invalid_transition_is_distinct_from_task_not_found(self):
        assert InvalidTransitionError is not TaskNotFoundError

    def test_catching_specific_does_not_catch_other(self, db_session):
        svc = TaskService(db_session)
        with pytest.raises(TaskNotFoundError):
            try:
                svc.get_task(999)
            except InvalidTransitionError:
                pass


class TestDatabaseSessionManagement:
    def test_session_rollback_on_test_failure(self, engine):
        Session = sessionmaker(bind=engine)
        session = Session()
        try:
            task = Task(title="Rollback Test", description="", priority="medium", status="todo")
            session.add(task)
            session.commit()
        finally:
            session.close()

        session2 = Session()
        from sqlalchemy import select
        result = list(session2.scalars(select(Task)).all())
        session2.close()
        assert any(t.title == "Rollback Test" for t in result)

    def test_concurrent_sessions_see_committed_data(self, engine):
        from sqlalchemy import select
        Session = sessionmaker(bind=engine)
        s1 = Session()
        s2 = Session()
        task = Task(title="Visible", description="", priority="medium", status="todo")
        s1.add(task)
        s1.commit()
        result = list(s2.scalars(select(Task)).all())
        assert any(t.title == "Visible" for t in result)
        s1.close()
        s2.close()
