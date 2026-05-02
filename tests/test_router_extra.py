import pytest
from datetime import datetime

from app.router import _parse_dt, _service, router
from app.services import TaskService
from fastapi import HTTPException


class TestServiceDependency:
    def test_service_creates_task_service(self, db_session):
        svc = _service(db_session)
        assert isinstance(svc, TaskService)
        assert svc.db is db_session


class TestParseDatetimeExtra:
    def test_parse_date_with_slashes_raises(self):
        with pytest.raises(HTTPException) as exc_info:
            _parse_dt("2026/06/15")
        assert exc_info.value.status_code == 422

    def test_parse_random_text_raises(self):
        with pytest.raises(HTTPException) as exc_info:
            _parse_dt("hello world")
        assert exc_info.value.status_code == 422

    def test_parse_iso_with_z_suffix(self):
        result = _parse_dt("2026-06-15T12:00:00Z")
        assert result is not None
        assert result.year == 2026

    def test_parse_date_with_negative_offset(self):
        result = _parse_dt("2026-06-15T12:00:00-05:00")
        assert result is not None
        assert result.year == 2026

    def test_parse_datetime_at_epoch(self):
        result = _parse_dt("1970-01-01T00:00:00")
        assert result == datetime(1970, 1, 1, 0, 0, 0)

    def test_parse_far_future_date(self):
        result = _parse_dt("2099-12-31T23:59:59")
        assert result == datetime(2099, 12, 31, 23, 59, 59)

    def test_parse_whitespace_string_raises(self):
        with pytest.raises(HTTPException):
            _parse_dt("  ")

    def test_parse_number_string_raises(self):
        with pytest.raises(HTTPException):
            _parse_dt("12345")

    def test_parse_error_detail_is_string(self):
        with pytest.raises(HTTPException) as exc_info:
            _parse_dt("bad")
        assert isinstance(exc_info.value.detail, str)

    def test_parse_valid_datetime_preserves_seconds(self):
        result = _parse_dt("2026-06-15T12:30:45")
        assert result.second == 45


class TestRouterConfiguration:
    def test_router_prefix(self):
        assert router.prefix == "/tasks"

    def test_router_tags(self):
        assert "tasks" in router.tags


class TestRouterIntegrationExtra:
    def test_create_task_with_default_description(self, client):
        resp = client.post("/tasks/", json={"title": "No desc"})
        assert resp.status_code == 201
        assert resp.json()["description"] == ""

    def test_get_task_after_update_preserves_updated_data(self, client):
        t = client.post("/tasks/", json={"title": "Original"}).json()
        client.patch(f"/tasks/{t['id']}", json={
            "title": "Updated",
            "description": "New desc",
            "priority": "critical",
        })
        resp = client.get(f"/tasks/{t['id']}")
        data = resp.json()
        assert data["title"] == "Updated"
        assert data["description"] == "New desc"
        assert data["priority"] == "critical"

    def test_list_ordering_newest_first(self, client):
        client.post("/tasks/", json={"title": "First"})
        client.post("/tasks/", json={"title": "Second"})
        resp = client.get("/tasks/")
        data = resp.json()
        titles = {t["title"] for t in data}
        assert titles == {"First", "Second"}
        assert len(data) == 2

    def test_create_update_delete_full_flow(self, client):
        created = client.post("/tasks/", json={
            "title": "Flow",
            "priority": "high",
            "due_date": "2026-12-31T00:00:00",
        })
        assert created.status_code == 201
        task_id = created.json()["id"]

        updated = client.patch(f"/tasks/{task_id}", json={"status": "in_progress"})
        assert updated.status_code == 200
        assert updated.json()["status"] == "in_progress"

        deleted = client.delete(f"/tasks/{task_id}")
        assert deleted.status_code == 204

        get_resp = client.get(f"/tasks/{task_id}")
        assert get_resp.status_code == 404

    def test_list_after_delete_shows_remaining(self, client):
        client.post("/tasks/", json={"title": "A"})
        t2 = client.post("/tasks/", json={"title": "B"}).json()
        client.post("/tasks/", json={"title": "C"})
        client.delete(f"/tasks/{t2['id']}")
        resp = client.get("/tasks/")
        titles = {t["title"] for t in resp.json()}
        assert titles == {"A", "C"}

    def test_update_status_transition_chain(self, client):
        t = client.post("/tasks/", json={"title": "Chain"}).json()
        tid = t["id"]

        resp = client.patch(f"/tasks/{tid}", json={"status": "in_progress"})
        assert resp.json()["status"] == "in_progress"

        resp = client.patch(f"/tasks/{tid}", json={"status": "done"})
        assert resp.json()["status"] == "done"

        resp = client.patch(f"/tasks/{tid}", json={"status": "in_progress"})
        assert resp.json()["status"] == "in_progress"

        resp = client.patch(f"/tasks/{tid}", json={"status": "todo"})
        assert resp.json()["status"] == "todo"

        resp = client.get(f"/tasks/{tid}")
        assert resp.json()["status"] == "todo"

    def test_create_tasks_with_each_priority_and_filter(self, client):
        for p in ["low", "medium", "high", "critical"]:
            client.post("/tasks/", json={"title": f"Task {p}", "priority": p})

        for p in ["low", "medium", "high", "critical"]:
            resp = client.get("/tasks/", params={"priority": p})
            assert len(resp.json()) == 1
            assert resp.json()[0]["priority"] == p

    def test_update_title_preserves_status(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        client.patch(f"/tasks/{t['id']}", json={"status": "in_progress"})
        resp = client.patch(f"/tasks/{t['id']}", json={"title": "New"})
        assert resp.json()["status"] == "in_progress"
        assert resp.json()["title"] == "New"

    def test_update_priority_does_not_affect_status(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        client.patch(f"/tasks/{t['id']}", json={"status": "in_progress"})
        resp = client.patch(f"/tasks/{t['id']}", json={"priority": "critical"})
        assert resp.json()["status"] == "in_progress"
        assert resp.json()["priority"] == "critical"

    def test_delete_then_create_new_task(self, client):
        t1 = client.post("/tasks/", json={"title": "Old"}).json()
        client.delete(f"/tasks/{t1['id']}")
        t2 = client.post("/tasks/", json={"title": "New"}).json()
        resp = client.get("/tasks/")
        assert len(resp.json()) == 1
        assert resp.json()[0]["title"] == "New"

    def test_get_task_id_matches_created(self, client):
        resp = client.post("/tasks/", json={"title": "ID check"})
        created_id = resp.json()["id"]
        resp = client.get(f"/tasks/{created_id}")
        assert resp.json()["id"] == created_id

    def test_list_filter_by_status_after_deletion(self, client):
        t1 = client.post("/tasks/", json={"title": "Delete"}).json()
        client.patch(f"/tasks/{t1['id']}", json={"status": "in_progress"})
        t2 = client.post("/tasks/", json={"title": "Keep"}).json()
        client.patch(f"/tasks/{t2['id']}", json={"status": "in_progress"})
        client.delete(f"/tasks/{t1['id']}")
        resp = client.get("/tasks/", params={"status": "in_progress"})
        assert len(resp.json()) == 1
        assert resp.json()[0]["title"] == "Keep"

    def test_update_with_only_status_field(self, client):
        t = client.post("/tasks/", json={"title": "T", "description": "D"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"status": "in_progress"})
        data = resp.json()
        assert data["title"] == "T"
        assert data["description"] == "D"
        assert data["status"] == "in_progress"

    def test_multiple_updates_in_sequence(self, client):
        t = client.post("/tasks/", json={"title": "Seq"}).json()
        tid = t["id"]

        client.patch(f"/tasks/{tid}", json={"title": "Step 1"})
        client.patch(f"/tasks/{tid}", json={"description": "Step 2"})
        client.patch(f"/tasks/{tid}", json={"priority": "high"})
        resp = client.get(f"/tasks/{tid}")
        data = resp.json()
        assert data["title"] == "Step 1"
        assert data["description"] == "Step 2"
        assert data["priority"] == "high"
