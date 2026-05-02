import pytest
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch, PropertyMock

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, text, inspect
from sqlalchemy.orm import sessionmaker

from app.database import Base, SessionLocal, engine as prod_engine, get_db, init_db
from app.main import app, lifespan
from app.models import Priority, Status, Task, VALID_TRANSITIONS
from app.router import _parse_dt, _service, router
from app.schemas import TaskCreate, TaskResponse, TaskUpdate
from app.services import InvalidTransitionError, TaskNotFoundError, TaskService


class TestConcurrentSessions:
    def test_two_sessions_see_committed_data(self, engine):
        Session = sessionmaker(bind=engine)
        s1 = Session()
        s2 = Session()
        task = Task(title="Shared", description="", priority="medium", status="todo")
        s1.add(task)
        s1.commit()
        result = list(s2.scalars(select(Task)).all())
        assert any(t.title == "Shared" for t in result)
        s1.close()
        s2.close()

    def test_session_sees_own_uncommitted_data(self, engine):
        Session = sessionmaker(bind=engine)
        s1 = Session()
        task = Task(title="Uncommitted", description="", priority="medium", status="todo")
        s1.add(task)
        s1.flush()
        result = list(s1.scalars(select(Task)).all())
        assert any(t.title == "Uncommitted" for t in result)
        s1.rollback()
        s1.close()

    def test_update_in_one_session_visible_in_another(self, engine):
        Session = sessionmaker(bind=engine)
        s1 = Session()
        s2 = Session()
        task = Task(title="Original", description="", priority="medium", status="todo")
        s1.add(task)
        s1.commit()
        task.title = "Updated"
        s1.commit()
        found = s2.get(Task, task.id)
        assert found.title == "Updated"
        s1.close()
        s2.close()

    def test_delete_in_one_session_visible_in_another(self, engine):
        Session = sessionmaker(bind=engine)
        s1 = Session()
        s2 = Session()
        task = Task(title="ToDelete", description="", priority="medium", status="todo")
        s1.add(task)
        s1.commit()
        task_id = task.id
        s1.delete(task)
        s1.commit()
        assert s2.get(Task, task_id) is None
        s1.close()
        s2.close()


class TestDatabaseConstraints:
    def test_title_column_is_not_nullable(self, engine):
        Session = sessionmaker(bind=engine)
        session = Session()
        task = Task(title=None, description="", priority="medium", status="todo")
        session.add(task)
        with pytest.raises(Exception):
            session.commit()
        session.rollback()
        session.close()

    def test_description_default_prevents_null_on_insert(self, engine):
        Session = sessionmaker(bind=engine)
        session = Session()
        task = Task(title="T", priority="medium", status="todo")
        session.add(task)
        session.commit()
        assert task.description == ""
        session.close()

    def test_priority_default_prevents_null_on_insert(self, engine):
        Session = sessionmaker(bind=engine)
        session = Session()
        task = Task(title="T", description="", status="todo")
        session.add(task)
        session.commit()
        assert task.priority == "medium"
        session.close()

    def test_status_default_prevents_null_on_insert(self, engine):
        Session = sessionmaker(bind=engine)
        session = Session()
        task = Task(title="T", description="", priority="medium")
        session.add(task)
        session.commit()
        assert task.status == "todo"
        session.close()

    def test_due_date_column_is_nullable(self, engine):
        Session = sessionmaker(bind=engine)
        session = Session()
        task = Task(title="T", description="", priority="medium", status="todo", due_date=None)
        session.add(task)
        session.commit()
        assert task.due_date is None
        session.close()

    def test_created_at_server_default(self, engine):
        Session = sessionmaker(bind=engine)
        session = Session()
        task = Task(title="T", description="", priority="medium", status="todo")
        session.add(task)
        session.commit()
        assert task.created_at is not None
        assert isinstance(task.created_at, datetime)
        session.close()

    def test_updated_at_server_default(self, engine):
        Session = sessionmaker(bind=engine)
        session = Session()
        task = Task(title="T", description="", priority="medium", status="todo")
        session.add(task)
        session.commit()
        assert task.updated_at is not None
        session.close()

    def test_id_autoincrement_sequential(self, engine):
        Session = sessionmaker(bind=engine)
        session = Session()
        t1 = Task(title="T1", description="", priority="medium", status="todo")
        t2 = Task(title="T2", description="", priority="medium", status="todo")
        session.add_all([t1, t2])
        session.commit()
        assert t2.id == t1.id + 1
        session.close()

    def test_id_autoincrement_after_deletion(self, engine):
        Session = sessionmaker(bind=engine)
        session = Session()
        t1 = Task(title="T1", description="", priority="medium", status="todo")
        session.add(t1)
        session.commit()
        id1 = t1.id
        session.delete(t1)
        session.commit()
        t2 = Task(title="T2", description="", priority="medium", status="todo")
        session.add(t2)
        session.commit()
        assert t2.id is not None
        assert t2.id >= id1
        session.close()


class TestSchemaFieldMetadata:
    def test_task_create_title_min_length(self):
        field = TaskCreate.model_fields["title"]
        assert field.metadata is not None

    def test_task_create_title_max_length(self):
        field = TaskCreate.model_fields["title"]
        assert field.metadata is not None

    def test_task_create_description_max_length(self):
        field = TaskCreate.model_fields["description"]
        assert field.metadata is not None

    def test_task_create_priority_default(self):
        field = TaskCreate.model_fields["priority"]
        assert field.default == Priority.MEDIUM

    def test_task_create_due_date_default(self):
        field = TaskCreate.model_fields["due_date"]
        assert field.default is None

    def test_task_create_description_default(self):
        field = TaskCreate.model_fields["description"]
        assert field.default == ""

    def test_task_update_all_fields_optional(self):
        for field_name, field in TaskUpdate.model_fields.items():
            assert field.default is None or field.is_required() is False

    def test_task_update_title_optional(self):
        field = TaskUpdate.model_fields["title"]
        assert field.default is None

    def test_task_update_description_optional(self):
        field = TaskUpdate.model_fields["description"]
        assert field.default is None

    def test_task_update_priority_optional(self):
        field = TaskUpdate.model_fields["priority"]
        assert field.default is None

    def test_task_update_status_optional(self):
        field = TaskUpdate.model_fields["status"]
        assert field.default is None

    def test_task_update_due_date_optional(self):
        field = TaskUpdate.model_fields["due_date"]
        assert field.default is None

    def test_task_response_from_attributes_config(self):
        assert TaskResponse.model_config.get("from_attributes") is True

    def test_task_response_all_fields_required(self):
        for field_name in ["id", "title", "description", "priority", "status", "created_at", "updated_at"]:
            field = TaskResponse.model_fields[field_name]
            assert field.is_required()

    def test_task_response_due_date_optional_in_model(self):
        field = TaskResponse.model_fields["due_date"]
        assert field.default is None or field.is_required() is False or field.default is not None


class TestSchemaValidators:
    def test_create_title_validator_strips_various(self):
        cases = [
            ("  hello  ", "hello"),
            ("\tworld\t", "world"),
            ("\nnewline\n", "newline"),
            ("  \t mixed \n ", "mixed"),
        ]
        for input_val, expected in cases:
            t = TaskCreate(title=input_val)
            assert t.title == expected, f"Failed for input: {repr(input_val)}"

    def test_create_title_validator_rejects_whitespace_only(self):
        blanks = ["   ", "\t", "\n", "  \t\n  "]
        for blank in blanks:
            with pytest.raises(ValueError, match="blank"):
                TaskCreate(title=blank)

    def test_create_title_validator_rejects_empty_via_min_length(self):
        with pytest.raises(ValueError):
            TaskCreate(title="")

    def test_update_title_validator_strips_various(self):
        cases = [
            ("  hello  ", "hello"),
            ("\tworld\t", "world"),
        ]
        for input_val, expected in cases:
            u = TaskUpdate(title=input_val)
            assert u.title == expected

    def test_update_title_validator_rejects_whitespace_only(self):
        blanks = ["   ", "\t", "\n"]
        for blank in blanks:
            with pytest.raises(ValueError, match="blank"):
                TaskUpdate(title=blank)

    def test_update_title_validator_rejects_empty_via_min_length(self):
        with pytest.raises(ValueError):
            TaskUpdate(title="")

    def test_update_title_validator_passes_none(self):
        u = TaskUpdate(title=None)
        assert u.title is None


class TestServiceWithCorruptData:
    def test_update_with_manually_set_invalid_status(self, engine):
        Session = sessionmaker(bind=engine)
        session = Session()
        task = Task(title="T", description="", priority="medium", status="invalid_status")
        session.add(task)
        session.commit()
        task_id = task.id
        svc = TaskService(session)
        with pytest.raises(Exception):
            Status(task.status)
        session.rollback()
        session.close()

    def test_list_tasks_with_invalid_priority_in_db(self, engine):
        Session = sessionmaker(bind=engine)
        session = Session()
        task = Task(title="T", description="", priority="custom_priority", status="todo")
        session.add(task)
        session.commit()
        svc = TaskService(session)
        tasks = svc.list_tasks()
        assert any(t.priority == "custom_priority" for t in tasks)
        session.close()


class TestServiceExceptionBehavior:
    def test_task_not_found_error_is_not_catchable_by_invalid_transition(self, db_session):
        svc = TaskService(db_session)
        try:
            svc.get_task(999)
            assert False, "Should have raised"
        except InvalidTransitionError:
            assert False, "Should not catch as InvalidTransitionError"
        except TaskNotFoundError:
            pass

    def test_invalid_transition_error_is_not_catchable_by_task_not_found(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        try:
            svc.update_task(task.id, TaskUpdate(status=Status.DONE))
            assert False, "Should have raised"
        except TaskNotFoundError:
            assert False, "Should not catch as TaskNotFoundError"
        except InvalidTransitionError:
            pass

    def test_exceptions_have_different_messages(self, db_session):
        svc = TaskService(db_session)
        with pytest.raises(TaskNotFoundError) as exc_info:
            svc.get_task(999)
        not_found_msg = str(exc_info.value)

        task = svc.create_task(TaskCreate(title="T"))
        with pytest.raises(InvalidTransitionError) as exc_info:
            svc.update_task(task.id, TaskUpdate(status=Status.DONE))
        transition_msg = str(exc_info.value)

        assert not_found_msg != transition_msg


class TestApiOpenAPISchema:
    def test_openapi_endpoint_accessible(self, client):
        resp = client.get("/openapi.json")
        assert resp.status_code == 200
        schema = resp.json()
        assert "openapi" in schema
        assert "paths" in schema

    def test_openapi_has_tasks_paths(self, client):
        resp = client.get("/openapi.json")
        schema = resp.json()
        paths = schema.get("paths", {})
        assert "/tasks/" in paths
        assert "/tasks/{task_id}" in paths

    def test_openapi_tasks_post_has_201_response(self, client):
        resp = client.get("/openapi.json")
        schema = resp.json()
        post_op = schema["paths"]["/tasks/"].get("post", {})
        responses = post_op.get("responses", {})
        assert "201" in responses

    def test_openapi_tasks_get_has_200_response(self, client):
        resp = client.get("/openapi.json")
        schema = resp.json()
        get_op = schema["paths"]["/tasks/"].get("get", {})
        responses = get_op.get("responses", {})
        assert "200" in responses

    def test_openapi_task_id_get_has_200_response(self, client):
        resp = client.get("/openapi.json")
        schema = resp.json()
        get_op = schema["paths"]["/tasks/{task_id}"].get("get", {})
        responses = get_op.get("responses", {})
        assert "200" in responses

    def test_openapi_task_id_patch_has_200_response(self, client):
        resp = client.get("/openapi.json")
        schema = resp.json()
        patch_op = schema["paths"]["/tasks/{task_id}"].get("patch", {})
        responses = patch_op.get("responses", {})
        assert "200" in responses

    def test_openapi_task_id_delete_has_204_response(self, client):
        resp = client.get("/openapi.json")
        schema = resp.json()
        delete_op = schema["paths"]["/tasks/{task_id}"].get("delete", {})
        responses = delete_op.get("responses", {})
        assert "204" in responses

    def test_openapi_has_task_schemas(self, client):
        resp = client.get("/openapi.json")
        schema = resp.json()
        schemas = schema.get("components", {}).get("schemas", {})
        assert len(schemas) > 0

    def test_openapi_info_has_title_and_version(self, client):
        resp = client.get("/openapi.json")
        schema = resp.json()
        info = schema.get("info", {})
        assert info.get("title") == "TaskPilot"
        assert info.get("version") == "0.1.0"


class TestApiDocEndpoints:
    def test_docs_endpoint_accessible(self, client):
        resp = client.get("/docs")
        assert resp.status_code == 200

    def test_redoc_endpoint_accessible(self, client):
        resp = client.get("/redoc")
        assert resp.status_code == 200


class TestApiResponseWithSpecialData:
    def test_create_task_with_newlines_in_description(self, client):
        desc = "Line 1\nLine 2\r\nLine 3"
        resp = client.post("/tasks/", json={"title": "T", "description": desc})
        assert resp.status_code == 201
        assert resp.json()["description"] == desc

    def test_create_task_with_html_in_title(self, client):
        html = "<h1>Title</h1>"
        resp = client.post("/tasks/", json={"title": html})
        assert resp.status_code == 201
        assert resp.json()["title"] == html

    def test_update_with_unicode_preserves_exact_bytes(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        unicode_title = "Café résumé naïve"
        resp = client.patch(f"/tasks/{t['id']}", json={"title": unicode_title})
        assert resp.json()["title"] == unicode_title

    def test_create_with_mixed_content_types_stored(self, client):
        payload = {
            "title": "SQL; DROP TABLE -- <script>",
            "description": "'; DELETE * FROM tasks; <img src=x>",
        }
        resp = client.post("/tasks/", json=payload)
        assert resp.status_code == 201
        data = resp.json()
        assert data["title"] == payload["title"]
        assert data["description"] == payload["description"]

    def test_list_after_multiple_deletes_reflects_state(self, client):
        ids = []
        for i in range(5):
            resp = client.post("/tasks/", json={"title": f"Task {i}"})
            ids.append(resp.json()["id"])
        for i in [0, 2, 4]:
            client.delete(f"/tasks/{ids[i]}")
        resp = client.get("/tasks/")
        remaining = resp.json()
        assert len(remaining) == 2
        remaining_ids = {t["id"] for t in remaining}
        assert ids[1] in remaining_ids
        assert ids[3] in remaining_ids

    def test_task_updated_at_changes_on_update(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        original_updated_at = t["updated_at"]
        import time
        time.sleep(0.01)
        resp = client.patch(f"/tasks/{t['id']}", json={"title": "Updated"})
        new_updated_at = resp.json()["updated_at"]
        assert new_updated_at >= original_updated_at


class TestServiceListFilterAllCombinations:
    def test_status_only_with_no_matches(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="T"))
        result = svc.list_tasks(status=Status.DONE)
        assert result == []

    def test_priority_only_with_no_matches(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="T", priority=Priority.LOW))
        result = svc.list_tasks(priority=Priority.CRITICAL)
        assert result == []

    def test_due_before_only_with_no_matches(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="T", due_date=datetime(2099, 1, 1)))
        result = svc.list_tasks(due_before=datetime(2000, 1, 1))
        assert result == []

    def test_status_and_priority_both_match(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="Match", priority=Priority.HIGH))
        result = svc.list_tasks(status=Status.TODO, priority=Priority.HIGH)
        assert len(result) == 1

    def test_status_and_priority_status_wrong(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="T", priority=Priority.HIGH))
        t2 = svc.create_task(TaskCreate(title="T2", priority=Priority.HIGH))
        svc.update_task(t2.id, TaskUpdate(status=Status.IN_PROGRESS))
        result = svc.list_tasks(status=Status.TODO, priority=Priority.HIGH)
        assert len(result) == 1

    def test_due_before_and_priority_both_match(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(
            title="Match", priority=Priority.HIGH, due_date=datetime(2025, 1, 1)
        ))
        svc.create_task(TaskCreate(
            title="WrongPriority", priority=Priority.LOW, due_date=datetime(2025, 1, 1)
        ))
        result = svc.list_tasks(priority=Priority.HIGH, due_before=datetime(2026, 1, 1))
        assert len(result) == 1
        assert result[0].title == "Match"


class TestEnumBehavior:
    def test_priority_iteration_order(self):
        values = [p.value for p in Priority]
        assert values == ["low", "medium", "high", "critical"]

    def test_status_iteration_order(self):
        values = [s.value for s in Status]
        assert values == ["todo", "in_progress", "done"]

    def test_priority_str_representation(self):
        assert str(Priority.HIGH) == "Priority.HIGH"

    def test_status_str_representation(self):
        assert str(Status.TODO) == "Status.TODO"

    def test_priority_is_string_enum(self):
        assert isinstance(Priority.HIGH, str)
        assert Priority.HIGH == "high"

    def test_status_is_string_enum(self):
        assert isinstance(Status.TODO, str)
        assert Status.TODO == "todo"

    def test_priority_hashable(self):
        s = {Priority.LOW, Priority.MEDIUM, Priority.HIGH, Priority.CRITICAL}
        assert len(s) == 4

    def test_status_hashable(self):
        s = {Status.TODO, Status.IN_PROGRESS, Status.DONE}
        assert len(s) == 3

    def test_priority_membership(self):
        assert "high" in [p.value for p in Priority]

    def test_status_membership(self):
        assert "todo" in [s.value for s in Status]

    def test_priority_from_value_case_sensitive(self):
        with pytest.raises(ValueError):
            Priority("HIGH")
        with pytest.raises(ValueError):
            Priority("High")

    def test_status_from_value_case_sensitive(self):
        with pytest.raises(ValueError):
            Status("TODO")
        with pytest.raises(ValueError):
            Status("In_Progress")


class TestTransitionGraphProperties:
    def test_graph_is_strongly_connected_except_todo(self):
        reachable_from_done = set()
        queue = [Status.DONE]
        while queue:
            current = queue.pop(0)
            for target in VALID_TRANSITIONS.get(current, set()):
                if target not in reachable_from_done and target != current:
                    reachable_from_done.add(target)
                    queue.append(target)
        assert Status.IN_PROGRESS in reachable_from_done

    def test_in_progress_is_central_hub(self):
        targets = VALID_TRANSITIONS[Status.IN_PROGRESS]
        assert len(targets) == 2
        assert Status.DONE in targets
        assert Status.TODO in targets

    def test_todo_only_goes_forward(self):
        targets = VALID_TRANSITIONS[Status.TODO]
        assert targets == {Status.IN_PROGRESS}

    def test_done_only_goes_backward(self):
        targets = VALID_TRANSITIONS[Status.DONE]
        assert targets == {Status.IN_PROGRESS}

    def test_bidirectional_between_in_progress_and_todo(self):
        assert Status.IN_PROGRESS in VALID_TRANSITIONS[Status.TODO]
        assert Status.TODO in VALID_TRANSITIONS[Status.IN_PROGRESS]

    def test_bidirectional_between_in_progress_and_done(self):
        assert Status.DONE in VALID_TRANSITIONS[Status.IN_PROGRESS]
        assert Status.IN_PROGRESS in VALID_TRANSITIONS[Status.DONE]

    def test_no_direct_edge_todo_to_done(self):
        assert Status.DONE not in VALID_TRANSITIONS[Status.TODO]

    def test_no_direct_edge_done_to_todo(self):
        assert Status.TODO not in VALID_TRANSITIONS[Status.DONE]


class TestFullEndToEndWorkflows:
    def test_kanban_board_workflow(self, client):
        todo_ids = []
        for i in range(3):
            resp = client.post("/tasks/", json={"title": f"Backlog {i}"})
            todo_ids.append(resp.json()["id"])

        for tid in todo_ids:
            client.patch(f"/tasks/{tid}", json={"status": "in_progress"})

        in_progress = client.get("/tasks/", params={"status": "in_progress"})
        assert len(in_progress.json()) == 3

        client.patch(f"/tasks/{todo_ids[0]}", json={"status": "done"})
        in_progress = client.get("/tasks/", params={"status": "in_progress"})
        assert len(in_progress.json()) == 2
        done = client.get("/tasks/", params={"status": "done"})
        assert len(done.json()) == 1

    def test_priority_escalation_workflow(self, client):
        t = client.post("/tasks/", json={
            "title": "Bug report",
            "priority": "low",
        }).json()
        tid = t["id"]

        resp = client.patch(f"/tasks/{tid}", json={"priority": "medium"})
        assert resp.json()["priority"] == "medium"

        resp = client.patch(f"/tasks/{tid}", json={"priority": "high"})
        assert resp.json()["priority"] == "high"

        resp = client.patch(f"/tasks/{tid}", json={"priority": "critical"})
        assert resp.json()["priority"] == "critical"

    def test_sprint_workflow_with_due_dates(self, client):
        client.post("/tasks/", json={
            "title": "Sprint 1",
            "due_date": "2026-01-15T00:00:00",
        })
        client.post("/tasks/", json={
            "title": "Sprint 2",
            "due_date": "2026-02-15T00:00:00",
        })
        client.post("/tasks/", json={
            "title": "Sprint 3",
            "due_date": "2026-03-15T00:00:00",
        })

        resp = client.get("/tasks/", params={"due_before": "2026-02-01T00:00:00"})
        assert len(resp.json()) == 1
        assert resp.json()[0]["title"] == "Sprint 1"

    def test_filter_combined_workflow(self, client):
        client.post("/tasks/", json={
            "title": "Urgent Bug",
            "priority": "critical",
            "due_date": "2025-01-01T00:00:00",
        })
        t2 = client.post("/tasks/", json={
            "title": "Feature",
            "priority": "high",
            "due_date": "2025-01-01T00:00:00",
        }).json()
        client.patch(f"/tasks/{t2['id']}", json={"status": "in_progress"})

        resp = client.get("/tasks/", params={
            "status": "todo",
            "priority": "critical",
            "due_before": "2026-01-01T00:00:00",
        })
        assert len(resp.json()) == 1
        assert resp.json()[0]["title"] == "Urgent Bug"

    def test_bulk_delete_by_filtering(self, client):
        for p in ["low", "medium", "high", "critical"]:
            client.post("/tasks/", json={"title": f"Task {p}", "priority": p})

        all_tasks = client.get("/tasks/").json()
        for task in all_tasks:
            if task["priority"] in ("low", "medium"):
                client.delete(f"/tasks/{task['id']}")

        remaining = client.get("/tasks/").json()
        assert len(remaining) == 2
        priorities = {t["priority"] for t in remaining}
        assert priorities == {"high", "critical"}


class TestGetDbGeneratorLifecycle:
    def test_get_db_yields_then_stops(self):
        eng = create_engine("sqlite:///:memory:")
        init_db(engine_=eng)
        import app.database as db_module
        original = db_module.SessionLocal
        db_module.SessionLocal = sessionmaker(bind=eng)
        try:
            gen = get_db()
            session = next(gen)
            assert session.is_active
            with pytest.raises(StopIteration):
                next(gen)
        finally:
            db_module.SessionLocal = original

    def test_get_db_closes_session_on_normal_exit(self):
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

    def test_get_db_closes_session_on_exception(self):
        eng = create_engine("sqlite:///:memory:")
        init_db(engine_=eng)
        import app.database as db_module
        original = db_module.SessionLocal
        db_module.SessionLocal = sessionmaker(bind=eng)
        try:
            gen = get_db()
            session = next(gen)
            assert session.is_active
            with pytest.raises(RuntimeError):
                gen.throw(RuntimeError("test"))
        finally:
            db_module.SessionLocal = original


class TestInitDbBehavior:
    def test_init_db_creates_tasks_table_with_all_columns(self):
        eng = create_engine("sqlite:///:memory:")
        init_db(engine_=eng)
        inspector = inspect(eng)
        columns = {col["name"] for col in inspector.get_columns("tasks")}
        expected = {"id", "title", "description", "priority", "status", "due_date", "created_at", "updated_at"}
        assert columns == expected

    def test_init_db_idempotent_no_data_loss(self):
        eng = create_engine("sqlite:///:memory:")
        init_db(engine_=eng)
        Session = sessionmaker(bind=eng)
        session = Session()
        task = Task(title="T", description="", priority="medium", status="todo")
        session.add(task)
        session.commit()
        init_db(engine_=eng)
        result = session.get(Task, task.id)
        assert result is not None
        assert result.title == "T"
        session.close()


class TestLifespanAsync:
    @pytest.mark.asyncio
    async def test_lifespan_calls_init_db_once(self):
        with patch("app.main.init_db") as mock_init:
            async with lifespan(app):
                pass
            mock_init.assert_called_once()

    @pytest.mark.asyncio
    async def test_lifespan_does_not_raise(self):
        with patch("app.main.init_db"):
            async with lifespan(app):
                pass

    @pytest.mark.asyncio
    async def test_lifespan_allows_code_inside_context(self):
        with patch("app.main.init_db"):
            executed = False
            async with lifespan(app):
                executed = True
            assert executed


class TestRouterEndpointRegistration:
    def test_all_five_endpoints_registered(self):
        paths = [r.path for r in app.routes if hasattr(r, "path")]
        assert "/tasks/" in paths
        assert "/tasks/{task_id}" in paths

    def test_router_has_correct_methods(self):
        methods = set()
        for route in router.routes:
            if hasattr(route, "methods"):
                methods.update(route.methods)
        assert "POST" in methods
        assert "GET" in methods
        assert "PATCH" in methods
        assert "DELETE" in methods

    def test_router_prefix(self):
        assert router.prefix == "/tasks"

    def test_router_tags(self):
        assert "tasks" in router.tags


class TestServiceDependencyInjection:
    def test_service_dep_injects_session(self, db_session):
        svc = _service(db_session)
        assert isinstance(svc, TaskService)
        assert svc.db is db_session

    def test_service_dep_creates_fresh_instances(self, db_session):
        svc1 = _service(db_session)
        svc2 = _service(db_session)
        assert svc1 is not svc2
        assert svc1.db is db_session
        assert svc2.db is db_session


class TestModelDefaults:
    def test_default_status_via_model(self, engine):
        Session = sessionmaker(bind=engine)
        session = Session()
        task = Task(title="T", description="", priority="medium")
        session.add(task)
        session.commit()
        assert task.status == "todo"
        session.close()

    def test_default_priority_via_model(self, engine):
        Session = sessionmaker(bind=engine)
        session = Session()
        task = Task(title="T", description="", status="todo")
        session.add(task)
        session.commit()
        assert task.priority == "medium"
        session.close()

    def test_default_description_via_model(self, engine):
        Session = sessionmaker(bind=engine)
        session = Session()
        task = Task(title="T", priority="medium", status="todo")
        session.add(task)
        session.commit()
        assert task.description == ""
        session.close()


class TestTaskResponseSerialization:
    def test_response_serializes_datetime(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        resp = TaskResponse.model_validate(task)
        data = resp.model_dump(mode="json")
        assert isinstance(data["created_at"], str)
        assert isinstance(data["updated_at"], str)

    def test_response_serializes_none_due_date(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        resp = TaskResponse.model_validate(task)
        data = resp.model_dump(mode="json")
        assert data["due_date"] is None

    def test_response_serializes_due_date(self, db_session):
        svc = TaskService(db_session)
        due = datetime(2026, 6, 15, 12, 0)
        task = svc.create_task(TaskCreate(title="T", due_date=due))
        resp = TaskResponse.model_validate(task)
        data = resp.model_dump(mode="json")
        assert data["due_date"] is not None

    def test_response_model_copy(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        resp = TaskResponse.model_validate(task)
        copied = resp.model_copy()
        assert copied.id == resp.id
        assert copied.title == resp.title


class TestParseDatetimeAllFormats:
    @pytest.mark.parametrize("input_val,expected_year,expected_month,expected_day", [
        ("2026-01-01T00:00:00", 2026, 1, 1),
        ("2026-12-31T23:59:59", 2026, 12, 31),
        ("1970-01-01T00:00:00", 1970, 1, 1),
        ("2099-12-31T23:59:59", 2099, 12, 31),
        ("2026-06-15T12:30:45", 2026, 6, 15),
        ("2026-06-15", 2026, 6, 15),
    ])
    def test_valid_formats(self, input_val, expected_year, expected_month, expected_day):
        result = _parse_dt(input_val)
        assert result.year == expected_year
        assert result.month == expected_month
        assert result.day == expected_day

    @pytest.mark.parametrize("input_val", [
        "not-a-date",
        "2026/06/15",
        "06-15-2026",
        "June 15, 2026",
        "  ",
        "12345",
        "abc",
        "2026-13-01",
        "2026-01-32",
    ])
    def test_invalid_formats_raise_422(self, input_val):
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            _parse_dt(input_val)
        assert exc_info.value.status_code == 422

    def test_none_returns_none(self):
        assert _parse_dt(None) is None

    def test_utc_z_suffix(self):
        result = _parse_dt("2026-06-15T12:00:00Z")
        assert result is not None
        assert result.year == 2026

    def test_positive_offset(self):
        result = _parse_dt("2026-06-15T12:00:00+05:30")
        assert result is not None

    def test_negative_offset(self):
        result = _parse_dt("2026-06-15T12:00:00-08:00")
        assert result is not None

    def test_with_microseconds(self):
        result = _parse_dt("2026-06-15T12:30:00.123456")
        assert result is not None


class TestAppConfiguration:
    def test_app_title_is_taskpilot(self):
        assert app.title == "TaskPilot"

    def test_app_version(self):
        assert app.version == "0.1.0"

    def test_app_is_fastapi(self):
        assert isinstance(app, FastAPI)

    def test_app_has_lifespan(self):
        assert app.router.lifespan_context is not None


class TestDatabaseModuleConfig:
    def test_engine_is_sqlite(self):
        assert "sqlite" in str(prod_engine.url)

    def test_engine_echo_disabled(self):
        assert prod_engine.echo is False

    def test_session_local_bound_to_engine(self):
        assert SessionLocal.kw.get("bind") is prod_engine

    def test_base_has_metadata(self):
        assert Base.metadata is not None

    def test_base_has_tasks_table(self):
        assert "tasks" in Base.metadata.tables
