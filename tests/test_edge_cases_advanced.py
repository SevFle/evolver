import pytest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch, MagicMock

from fastapi import HTTPException
from sqlalchemy import create_engine, select, text, inspect
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db, init_db
from app.models import Priority, Status, Task, VALID_TRANSITIONS
from app.router import _parse_dt, _service
from app.schemas import TaskCreate, TaskResponse, TaskUpdate
from app.services import InvalidTransitionError, TaskNotFoundError, TaskService


class TestDatabaseNotNullConstraints:
    def test_title_not_null_at_db_level(self, engine):
        Session = sessionmaker(bind=engine)
        session = Session()
        task = Task(title=None, description="", priority="medium", status="todo")
        session.add(task)
        with pytest.raises(Exception):
            session.commit()
        session.rollback()
        session.close()

    def test_description_default_prevents_null(self, engine):
        Session = sessionmaker(bind=engine)
        session = Session()
        task = Task(title="T", priority="medium", status="todo")
        session.add(task)
        session.commit()
        assert task.description == ""
        session.close()

    def test_priority_default_prevents_null(self, engine):
        Session = sessionmaker(bind=engine)
        session = Session()
        task = Task(title="T", description="", status="todo")
        session.add(task)
        session.commit()
        assert task.priority == "medium"
        session.close()

    def test_status_default_prevents_null(self, engine):
        Session = sessionmaker(bind=engine)
        session = Session()
        task = Task(title="T", description="", priority="medium")
        session.add(task)
        session.commit()
        assert task.status == "todo"
        session.close()

    def test_task_with_valid_data_inserts_successfully(self, engine):
        Session = sessionmaker(bind=engine)
        session = Session()
        task = Task(title="Valid", description="", priority="medium", status="todo")
        session.add(task)
        session.commit()
        assert task.id is not None
        session.close()


class TestSchemaJsonSerialization:
    def test_task_create_model_dump_json_roundtrip(self):
        dt = datetime(2026, 6, 15, 12, 0)
        t = TaskCreate(title="Test", description="Desc", priority=Priority.HIGH, due_date=dt)
        json_str = t.model_dump_json()
        assert '"Test"' in json_str
        assert "Desc" in json_str

    def test_task_update_model_dump_json_with_partial(self):
        u = TaskUpdate(title="Only")
        json_str = u.model_dump_json()
        assert '"Only"' in json_str

    def test_task_response_model_validate_json(self):
        data = {
            "id": 1,
            "title": "Test",
            "description": "",
            "priority": "medium",
            "status": "todo",
            "due_date": None,
            "created_at": "2026-01-01T00:00:00",
            "updated_at": "2026-01-01T00:00:00",
        }
        resp = TaskResponse.model_validate(data)
        assert resp.id == 1
        assert resp.title == "Test"

    def test_task_create_model_dump_includes_all_fields(self):
        t = TaskCreate(title="T")
        dumped = t.model_dump()
        assert "title" in dumped
        assert "description" in dumped
        assert "priority" in dumped
        assert "due_date" in dumped

    def test_task_update_model_dump_includes_all_fields(self):
        u = TaskUpdate()
        dumped = u.model_dump()
        assert "title" in dumped
        assert "description" in dumped
        assert "priority" in dumped
        assert "status" in dumped
        assert "due_date" in dumped

    def test_task_response_serialization_types(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Types"))
        resp = TaskResponse.model_validate(task)
        data = resp.model_dump()
        assert isinstance(data["id"], int)
        assert isinstance(data["title"], str)
        assert isinstance(data["description"], str)
        assert isinstance(data["priority"], str)
        assert isinstance(data["status"], str)


class TestServiceSessionStateManagement:
    def test_create_commits_and_refreshes(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Commit"))
        assert task.id is not None
        assert db_session.get(Task, task.id) is not None

    def test_update_commits_and_refreshes(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Before"))
        updated = svc.update_task(task.id, TaskUpdate(title="After"))
        assert updated.title == "After"
        db_session.expire_all()
        assert db_session.get(Task, task.id).title == "After"

    def test_delete_commits_and_removes(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Remove"))
        task_id = task.id
        svc.delete_task(task_id)
        with pytest.raises(TaskNotFoundError):
            svc.get_task(task_id)

    def test_list_after_create_returns_newest_first(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="Old"))
        db_session.execute(text("UPDATE tasks SET created_at = datetime('now', '-1 second') WHERE title = 'Old'"))
        db_session.commit()
        svc.create_task(TaskCreate(title="New"))
        tasks = svc.list_tasks()
        assert tasks[0].title == "New"
        assert tasks[1].title == "Old"


class TestStatusTransitionInvariants:
    @pytest.mark.parametrize("source", list(Status))
    def test_same_status_transition_always_valid(self, db_session, source):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        if source != Status.TODO:
            svc.update_task(task.id, TaskUpdate(status=Status.IN_PROGRESS))
            if source == Status.DONE:
                svc.update_task(task.id, TaskUpdate(status=Status.DONE))
        result = svc.update_task(task.id, TaskUpdate(status=source))
        assert result.status == source.value

    @pytest.mark.parametrize("source,target", [
        (Status.TODO, Status.DONE),
        (Status.DONE, Status.TODO),
    ])
    def test_invalid_transitions_always_raise(self, db_session, source, target):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        if source != Status.TODO:
            svc.update_task(task.id, TaskUpdate(status=Status.IN_PROGRESS))
            if source == Status.DONE:
                svc.update_task(task.id, TaskUpdate(status=Status.DONE))
        with pytest.raises(InvalidTransitionError):
            svc.update_task(task.id, TaskUpdate(status=target))

    def test_valid_transitions_dict_is_complete(self):
        all_statuses = set(Status)
        for status in Status:
            assert status in VALID_TRANSITIONS
        for source, targets in VALID_TRANSITIONS.items():
            assert source in all_statuses
            for t in targets:
                assert t in all_statuses

    def test_transition_graph_has_no_self_loops(self):
        for source, targets in VALID_TRANSITIONS.items():
            assert source not in targets

    def test_transition_graph_is_reachable(self):
        reachable_from_todo = set()
        queue = [Status.TODO]
        while queue:
            current = queue.pop(0)
            for target in VALID_TRANSITIONS.get(current, set()):
                if target not in reachable_from_todo and target != current:
                    reachable_from_todo.add(target)
                    queue.append(target)
        assert Status.IN_PROGRESS in reachable_from_todo
        assert Status.DONE in reachable_from_todo


class TestTaskUpdatePartialUpdateSemantics:
    def test_exclude_unset_only_includes_changed_fields(self):
        u = TaskUpdate(title="New")
        dumped = u.model_dump(exclude_unset=True)
        assert dumped == {"title": "New"}

    def test_exclude_unset_includes_explicitly_set_none(self):
        u = TaskUpdate(due_date=None)
        dumped = u.model_dump(exclude_unset=True)
        assert dumped == {"due_date": None}

    def test_exclude_unset_empty_update_gives_empty_dict(self):
        u = TaskUpdate()
        dumped = u.model_dump(exclude_unset=True)
        assert dumped == {}

    def test_update_with_explicitly_set_none_due_date_clears_it(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T", due_date=datetime(2026, 1, 1)))
        assert task.due_date is not None
        updated = svc.update_task(task.id, TaskUpdate(due_date=None))
        assert updated.due_date is None

    def test_update_with_no_due_date_field_does_not_clear_it(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T", due_date=datetime(2026, 1, 1)))
        updated = svc.update_task(task.id, TaskUpdate(title="New"))
        assert updated.due_date is not None
        assert updated.due_date.year == 2026

    def test_update_with_explicitly_set_none_description_raises(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T", description="Has content"))
        with pytest.raises(Exception):
            svc.update_task(task.id, TaskUpdate(description=None))


class TestParseDatetimeAdvanced:
    def test_parse_with_utc_timezone(self):
        result = _parse_dt("2026-06-15T12:00:00+00:00")
        assert result is not None
        assert result.year == 2026

    def test_parse_with_negative_timezone_offset(self):
        result = _parse_dt("2026-06-15T12:00:00-07:00")
        assert result is not None

    def test_parse_with_positive_timezone_offset(self):
        result = _parse_dt("2026-06-15T12:00:00+09:00")
        assert result is not None

    def test_parse_date_only_iso(self):
        result = _parse_dt("2026-06-15")
        assert result == datetime(2026, 6, 15, 0, 0, 0)

    def test_parse_with_seconds(self):
        result = _parse_dt("2026-06-15T12:30:45")
        assert result.second == 45

    def test_parse_error_is_422(self):
        with pytest.raises(HTTPException) as exc_info:
            _parse_dt("invalid")
        assert exc_info.value.status_code == 422

    def test_parse_error_detail_contains_value(self):
        with pytest.raises(HTTPException) as exc_info:
            _parse_dt("bad-date")
        assert "bad-date" in exc_info.value.detail

    @pytest.mark.parametrize("invalid_input", [
        "not-a-date",
        "2026/06/15",
        "06-15-2026",
        "June 15, 2026",
        "  ",
        "12345",
        "abc123",
    ])
    def test_various_invalid_formats_raise(self, invalid_input):
        with pytest.raises(HTTPException):
            _parse_dt(invalid_input)


class TestApiErrorFormatConsistency:
    @pytest.mark.parametrize("method,path,body,expected_code", [
        ("GET", "/tasks/999", None, 404),
        ("PATCH", "/tasks/999", {"title": "X"}, 404),
        ("DELETE", "/tasks/999", None, 404),
    ])
    def test_404_responses_have_detail_key(self, client, method, path, body, expected_code):
        if method == "GET":
            resp = client.get(path)
        elif method == "PATCH":
            resp = client.patch(path, json=body)
        elif method == "DELETE":
            resp = client.delete(path)
        assert resp.status_code == expected_code
        assert "detail" in resp.json()
        assert isinstance(resp.json()["detail"], str)

    def test_409_response_has_detail_key(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"status": "done"})
        assert resp.status_code == 409
        assert "detail" in resp.json()
        assert isinstance(resp.json()["detail"], str)

    @pytest.mark.parametrize("payload", [
        {"title": ""},
        {"title": "   "},
        {"title": "x" * 201},
        {},
        {"description": "no title"},
    ])
    def test_422_responses_have_detail_key(self, client, payload):
        resp = client.post("/tasks/", json=payload)
        assert resp.status_code == 422
        assert "detail" in resp.json()


class TestApiFullResponseStructure:
    def test_create_response_all_fields_present_and_typed(self, client):
        resp = client.post("/tasks/", json={
            "title": "Struct",
            "description": "Desc",
            "priority": "high",
            "due_date": "2026-06-15T00:00:00",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert isinstance(data["id"], int)
        assert isinstance(data["title"], str)
        assert isinstance(data["description"], str)
        assert isinstance(data["priority"], str)
        assert isinstance(data["status"], str)
        assert data["due_date"] is not None
        assert isinstance(data["created_at"], str)
        assert isinstance(data["updated_at"], str)

    def test_list_response_each_item_has_all_fields(self, client):
        client.post("/tasks/", json={"title": "A"})
        client.post("/tasks/", json={"title": "B"})
        resp = client.get("/tasks/")
        assert resp.status_code == 200
        for item in resp.json():
            expected_keys = {"id", "title", "description", "priority", "status", "due_date", "created_at", "updated_at"}
            assert set(item.keys()) == expected_keys

    def test_update_response_all_fields_present(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"title": "Updated"})
        data = resp.json()
        expected_keys = {"id", "title", "description", "priority", "status", "due_date", "created_at", "updated_at"}
        assert set(data.keys()) == expected_keys

    def test_get_response_all_fields_present(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.get(f"/tasks/{t['id']}")
        data = resp.json()
        expected_keys = {"id", "title", "description", "priority", "status", "due_date", "created_at", "updated_at"}
        assert set(data.keys()) == expected_keys


class TestApiWorkflowIntegration:
    def test_create_read_update_read_delete_read(self, client):
        created = client.post("/tasks/", json={
            "title": "Workflow",
            "description": "Test workflow",
            "priority": "high",
        })
        assert created.status_code == 201
        task_id = created.json()["id"]

        fetched = client.get(f"/tasks/{task_id}")
        assert fetched.status_code == 200
        assert fetched.json()["title"] == "Workflow"
        assert fetched.json()["status"] == "todo"

        updated = client.patch(f"/tasks/{task_id}", json={
            "status": "in_progress",
            "priority": "critical",
        })
        assert updated.status_code == 200
        assert updated.json()["status"] == "in_progress"
        assert updated.json()["priority"] == "critical"

        refetched = client.get(f"/tasks/{task_id}")
        assert refetched.json()["status"] == "in_progress"
        assert refetched.json()["title"] == "Workflow"

        deleted = client.delete(f"/tasks/{task_id}")
        assert deleted.status_code == 204

        gone = client.get(f"/tasks/{task_id}")
        assert gone.status_code == 404

    def test_multi_task_status_progression(self, client):
        tasks = []
        for i in range(3):
            resp = client.post("/tasks/", json={"title": f"Task {i}"})
            tasks.append(resp.json()["id"])

        for tid in tasks:
            resp = client.patch(f"/tasks/{tid}", json={"status": "in_progress"})
            assert resp.status_code == 200

        for tid in tasks:
            resp = client.patch(f"/tasks/{tid}", json={"status": "done"})
            assert resp.status_code == 200

        resp = client.get("/tasks/", params={"status": "done"})
        assert len(resp.json()) == 3

    def test_filter_after_status_changes(self, client):
        t1 = client.post("/tasks/", json={"title": "A", "priority": "high"}).json()
        t2 = client.post("/tasks/", json={"title": "B", "priority": "low"}).json()

        client.patch(f"/tasks/{t1['id']}", json={"status": "in_progress"})
        client.patch(f"/tasks/{t2['id']}", json={"status": "in_progress"})

        in_progress = client.get("/tasks/", params={"status": "in_progress"})
        assert len(in_progress.json()) == 2

        high_in_progress = client.get("/tasks/", params={
            "status": "in_progress",
            "priority": "high",
        })
        assert len(high_in_progress.json()) == 1
        assert high_in_progress.json()[0]["title"] == "A"

    def test_delete_one_preserves_others_and_filters(self, client):
        t1 = client.post("/tasks/", json={"title": "Keep", "priority": "high"}).json()
        t2 = client.post("/tasks/", json={"title": "Delete", "priority": "low"}).json()

        client.delete(f"/tasks/{t2['id']}")

        all_tasks = client.get("/tasks/")
        assert len(all_tasks.json()) == 1
        assert all_tasks.json()[0]["title"] == "Keep"

        high_tasks = client.get("/tasks/", params={"priority": "high"})
        assert len(high_tasks.json()) == 1

        low_tasks = client.get("/tasks/", params={"priority": "low"})
        assert len(low_tasks.json()) == 0


class TestServiceFilterBoundaryValues:
    def test_due_before_with_exact_same_datetime(self, db_session):
        svc = TaskService(db_session)
        exact = datetime(2026, 6, 15, 12, 0, 0)
        svc.create_task(TaskCreate(title="Exact", due_date=exact))
        result = svc.list_tasks(due_before=exact)
        assert len(result) == 1
        assert result[0].title == "Exact"

    def test_due_before_one_second_before(self, db_session):
        svc = TaskService(db_session)
        dt = datetime(2026, 6, 15, 12, 0, 1)
        svc.create_task(TaskCreate(title="Just after", due_date=dt))
        result = svc.list_tasks(due_before=datetime(2026, 6, 15, 12, 0, 0))
        assert len(result) == 0

    def test_due_before_one_second_after(self, db_session):
        svc = TaskService(db_session)
        dt = datetime(2026, 6, 15, 11, 59, 59)
        svc.create_task(TaskCreate(title="Just before", due_date=dt))
        result = svc.list_tasks(due_before=datetime(2026, 6, 15, 12, 0, 0))
        assert len(result) == 1

    def test_list_with_many_mixed_due_dates(self, db_session):
        svc = TaskService(db_session)
        for i in range(10):
            year = 2020 + i
            svc.create_task(TaskCreate(title=f"Task {i}", due_date=datetime(year, 1, 1)))
        result = svc.list_tasks(due_before=datetime(2025, 1, 1))
        assert len(result) == 6

    def test_list_no_filters_returns_all_priorities(self, db_session):
        svc = TaskService(db_session)
        for p in Priority:
            svc.create_task(TaskCreate(title=f"Task {p.value}", priority=p))
        result = svc.list_tasks()
        priorities = {t.priority for t in result}
        assert priorities == {"low", "medium", "high", "critical"}


class TestApiContentTypeAndHeaders:
    def test_delete_returns_204_no_content(self, client):
        t = client.post("/tasks/", json={"title": "Delete"}).json()
        resp = client.delete(f"/tasks/{t['id']}")
        assert resp.status_code == 204
        assert resp.content == b""

    def test_create_returns_201(self, client):
        resp = client.post("/tasks/", json={"title": "New"})
        assert resp.status_code == 201

    def test_get_returns_200(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.get(f"/tasks/{t['id']}")
        assert resp.status_code == 200

    def test_list_returns_200(self, client):
        resp = client.get("/tasks/")
        assert resp.status_code == 200

    def test_update_returns_200(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"title": "U"})
        assert resp.status_code == 200


class TestServiceCreateWithEdgeCaseData:
    def test_create_with_description_containing_sql_keywords(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(
            title="T",
            description="SELECT * FROM tasks; DROP TABLE tasks; --",
        ))
        assert "SELECT" in task.description
        assert svc.list_tasks() == [task]

    def test_create_with_unicode_title_and_description(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(
            title="日本語テスト 🎌",
            description="Привет мир مرحبا",
        ))
        assert task.title == "日本語テスト 🎌"
        assert "Привет" in task.description

    def test_create_with_minimal_data(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="X"))
        assert task.title == "X"
        assert task.description == ""
        assert task.priority == Priority.MEDIUM.value
        assert task.status == Status.TODO.value
        assert task.due_date is None

    def test_create_with_maximal_data(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(
            title="X" * 200,
            description="D" * 2000,
            priority=Priority.CRITICAL,
            due_date=datetime(2099, 12, 31, 23, 59, 59),
        ))
        assert len(task.title) == 200
        assert len(task.description) == 2000
        assert task.priority == Priority.CRITICAL.value
        assert task.due_date.year == 2099


class TestApiFilterWithSpecialCharacters:
    def test_list_filter_by_status_with_multiple_tasks(self, client):
        for i in range(5):
            client.post("/tasks/", json={"title": f"Task {i}"})
        t = client.post("/tasks/", json={"title": "Progress"}).json()
        client.patch(f"/tasks/{t['id']}", json={"status": "in_progress"})

        todo_resp = client.get("/tasks/", params={"status": "todo"})
        in_prog_resp = client.get("/tasks/", params={"status": "in_progress"})
        assert len(todo_resp.json()) == 5
        assert len(in_prog_resp.json()) == 1

    def test_list_filter_priority_with_many_tasks(self, client):
        for p in ["low", "medium", "high", "critical"]:
            for i in range(3):
                client.post("/tasks/", json={"title": f"{p}-{i}", "priority": p})

        for p in ["low", "medium", "high", "critical"]:
            resp = client.get("/tasks/", params={"priority": p})
            assert len(resp.json()) == 3


class TestServiceUpdateWithTransitionAndOtherFields:
    def test_update_status_and_priority_in_one_call(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        updated = svc.update_task(task.id, TaskUpdate(
            status=Status.IN_PROGRESS,
            priority=Priority.CRITICAL,
        ))
        assert updated.status == Status.IN_PROGRESS.value
        assert updated.priority == Priority.CRITICAL.value

    def test_update_status_and_title_in_one_call(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Old"))
        updated = svc.update_task(task.id, TaskUpdate(
            status=Status.IN_PROGRESS,
            title="New",
        ))
        assert updated.status == Status.IN_PROGRESS.value
        assert updated.title == "New"

    def test_update_invalid_transition_with_other_fields_still_fails(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        with pytest.raises(InvalidTransitionError):
            svc.update_task(task.id, TaskUpdate(
                status=Status.DONE,
                title="New Title",
            ))

    def test_update_status_then_separate_priority(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        svc.update_task(task.id, TaskUpdate(status=Status.IN_PROGRESS))
        updated = svc.update_task(task.id, TaskUpdate(priority=Priority.CRITICAL))
        assert updated.status == Status.IN_PROGRESS.value
        assert updated.priority == Priority.CRITICAL.value


class TestTaskResponseModelValidation:
    def test_response_from_model_preserves_all_types(self, db_session):
        svc = TaskService(db_session)
        due = datetime(2026, 12, 31, 23, 59, 59)
        task = svc.create_task(TaskCreate(
            title="Full",
            description="Complete",
            priority=Priority.CRITICAL,
            due_date=due,
        ))
        resp = TaskResponse.model_validate(task)
        assert isinstance(resp.id, int)
        assert resp.title == "Full"
        assert resp.description == "Complete"
        assert resp.priority == "critical"
        assert resp.status == "todo"
        assert resp.due_date == due
        assert isinstance(resp.created_at, datetime)
        assert isinstance(resp.updated_at, datetime)

    def test_response_without_due_date(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="No Due"))
        resp = TaskResponse.model_validate(task)
        assert resp.due_date is None

    def test_response_field_count(self):
        assert len(TaskResponse.model_fields) == 8


class TestApiStressScenarios:
    def test_create_50_tasks_and_list_all(self, client):
        for i in range(50):
            resp = client.post("/tasks/", json={"title": f"Task {i:03d}"})
            assert resp.status_code == 201

        resp = client.get("/tasks/")
        assert len(resp.json()) == 50

    def test_update_single_task_30_times(self, client):
        t = client.post("/tasks/", json={"title": "Original"}).json()
        for i in range(30):
            resp = client.patch(f"/tasks/{t['id']}", json={"title": f"v{i}"})
            assert resp.status_code == 200

        final = client.get(f"/tasks/{t['id']}").json()
        assert final["title"] == "v29"

    def test_create_update_delete_interleaved(self, client):
        ids = []
        for i in range(10):
            resp = client.post("/tasks/", json={"title": f"Task {i}"})
            ids.append(resp.json()["id"])
            if i > 0:
                client.patch(f"/tasks/{ids[-2]}", json={"status": "in_progress"})

        in_progress = client.get("/tasks/", params={"status": "in_progress"})
        assert len(in_progress.json()) == 9

        for tid in ids[:5]:
            client.delete(f"/tasks/{tid}")

        remaining = client.get("/tasks/")
        assert len(remaining.json()) == 5

    def test_status_transition_cycles(self, client):
        t = client.post("/tasks/", json={"title": "Cycle"}).json()
        tid = t["id"]

        for _ in range(10):
            client.patch(f"/tasks/{tid}", json={"status": "in_progress"})
            client.patch(f"/tasks/{tid}", json={"status": "done"})
            client.patch(f"/tasks/{tid}", json={"status": "in_progress"})
            client.patch(f"/tasks/{tid}", json={"status": "todo"})

        resp = client.get(f"/tasks/{tid}")
        assert resp.json()["status"] == "todo"


class TestServiceDeletePatterns:
    def test_delete_first_of_many(self, db_session):
        svc = TaskService(db_session)
        t1 = svc.create_task(TaskCreate(title="First"))
        svc.create_task(TaskCreate(title="Second"))
        svc.create_task(TaskCreate(title="Third"))
        svc.delete_task(t1.id)
        remaining = svc.list_tasks()
        assert len(remaining) == 2
        titles = {t.title for t in remaining}
        assert titles == {"Second", "Third"}

    def test_delete_last_of_many(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="First"))
        svc.create_task(TaskCreate(title="Second"))
        t3 = svc.create_task(TaskCreate(title="Third"))
        svc.delete_task(t3.id)
        remaining = svc.list_tasks()
        assert len(remaining) == 2
        titles = {t.title for t in remaining}
        assert titles == {"First", "Second"}

    def test_delete_all_in_sequence(self, db_session):
        svc = TaskService(db_session)
        tasks = [svc.create_task(TaskCreate(title=f"T{i}")) for i in range(5)]
        for t in tasks:
            svc.delete_task(t.id)
        assert svc.list_tasks() == []

    def test_delete_and_recreate(self, db_session):
        svc = TaskService(db_session)
        t1 = svc.create_task(TaskCreate(title="First"))
        svc.delete_task(t1.id)
        t2 = svc.create_task(TaskCreate(title="Second"))
        assert t2.id is not None
        assert len(svc.list_tasks()) == 1
        assert svc.list_tasks()[0].title == "Second"


class TestApiInputValidationEdgeCases:
    def test_create_with_title_type_number(self, client):
        resp = client.post("/tasks/", json={"title": 42})
        assert resp.status_code == 422

    def test_create_with_title_type_array(self, client):
        resp = client.post("/tasks/", json={"title": ["array"]})
        assert resp.status_code == 422

    def test_create_with_title_type_object(self, client):
        resp = client.post("/tasks/", json={"title": {"key": "val"}})
        assert resp.status_code == 422

    def test_create_with_title_type_bool(self, client):
        resp = client.post("/tasks/", json={"title": True})
        assert resp.status_code == 422

    def test_create_with_priority_type_number(self, client):
        resp = client.post("/tasks/", json={"title": "T", "priority": 1})
        assert resp.status_code == 422

    def test_create_with_due_date_type_number(self, client):
        resp = client.post("/tasks/", json={"title": "T", "due_date": 12345})
        assert resp.status_code in (201, 422)

    def test_patch_with_status_type_number(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"status": 1})
        assert resp.status_code == 422

    def test_create_with_empty_json_object(self, client):
        resp = client.post("/tasks/", json={})
        assert resp.status_code == 422


class TestServiceGetTaskDetails:
    def test_get_returns_fresh_object(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Original"))
        svc.update_task(task.id, TaskUpdate(title="Updated"))
        fetched = svc.get_task(task.id)
        assert fetched.title == "Updated"

    def test_get_all_fields_match_create(self, db_session):
        svc = TaskService(db_session)
        due = datetime(2026, 12, 31, 12, 0)
        created = svc.create_task(TaskCreate(
            title="Full",
            description="Complete",
            priority=Priority.HIGH,
            due_date=due,
        ))
        fetched = svc.get_task(created.id)
        assert fetched.id == created.id
        assert fetched.title == created.title
        assert fetched.description == created.description
        assert fetched.priority == created.priority
        assert fetched.status == created.status
        assert fetched.due_date == created.due_date
