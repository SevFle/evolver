import pytest
from datetime import datetime

from app.router import _parse_dt


class TestParseDatetime:
    def test_none_returns_none(self):
        assert _parse_dt(None) is None

    def test_valid_iso_datetime(self):
        result = _parse_dt("2026-06-15T12:30:00")
        assert result == datetime(2026, 6, 15, 12, 30, 0)

    def test_valid_iso_date_only(self):
        result = _parse_dt("2026-06-15")
        assert result == datetime(2026, 6, 15, 0, 0, 0)

    def test_valid_with_timezone_suffix(self):
        result = _parse_dt("2026-06-15T12:00:00+00:00")
        assert result.year == 2026
        assert result.month == 6
        assert result.day == 15

    def test_invalid_string_raises_422(self):
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            _parse_dt("not-a-datetime")
        assert exc_info.value.status_code == 422
        assert "not-a-datetime" in exc_info.value.detail

    def test_empty_string_raises_422(self):
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            _parse_dt("")
        assert exc_info.value.status_code == 422

    def test_partial_date_raises_422(self):
        from fastapi import HTTPException
        with pytest.raises(HTTPException):
            _parse_dt("2026-13-01")

    def test_invalid_month_raises_422(self):
        from fastapi import HTTPException
        with pytest.raises(HTTPException):
            _parse_dt("2026-13-45T00:00:00")

    def test_error_detail_contains_value(self):
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            _parse_dt("garbage")
        assert "garbage" in str(exc_info.value.detail)

    def test_valid_datetime_with_microseconds(self):
        result = _parse_dt("2026-06-15T12:30:00.123456")
        assert result.year == 2026
        assert result.second == 0

    def test_midnight_datetime(self):
        result = _parse_dt("2026-01-01T00:00:00")
        assert result == datetime(2026, 1, 1, 0, 0, 0)

    def test_end_of_day_datetime(self):
        result = _parse_dt("2026-12-31T23:59:59")
        assert result == datetime(2026, 12, 31, 23, 59, 59)


class TestRouterEdgeCases:
    def test_create_task_then_list_returns_all(self, client):
        client.post("/tasks/", json={"title": "First"})
        client.post("/tasks/", json={"title": "Second"})
        client.post("/tasks/", json={"title": "Third"})
        resp = client.get("/tasks/")
        data = resp.json()
        titles = {t["title"] for t in data}
        assert titles == {"First", "Second", "Third"}

    def test_update_nonexistent_task_error_message(self, client):
        resp = client.patch("/tasks/999", json={"title": "X"})
        assert resp.status_code == 404
        assert resp.json()["detail"] == "Task not found"

    def test_delete_nonexistent_task_error_message(self, client):
        resp = client.delete("/tasks/999")
        assert resp.status_code == 404
        assert resp.json()["detail"] == "Task not found"

    def test_get_task_nonexistent_error_message(self, client):
        resp = client.get("/tasks/999")
        assert resp.status_code == 404
        assert resp.json()["detail"] == "Task not found"

    def test_create_task_response_has_id(self, client):
        resp = client.post("/tasks/", json={"title": "T"})
        assert "id" in resp.json()
        assert isinstance(resp.json()["id"], int)

    def test_list_filter_invalid_priority(self, client):
        resp = client.get("/tasks/", params={"priority": "nonexistent"})
        assert resp.status_code == 422

    def test_create_multiple_tasks_unique_ids(self, client):
        ids = set()
        for i in range(5):
            resp = client.post("/tasks/", json={"title": f"Task {i}"})
            ids.add(resp.json()["id"])
        assert len(ids) == 5

    def test_update_task_invalid_transition_detail_format(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"status": "done"})
        detail = resp.json()["detail"]
        assert "todo" in detail.lower()
        assert "done" in detail.lower()

    def test_list_filter_due_before_with_iso_string(self, client):
        client.post("/tasks/", json={"title": "Past", "due_date": "2024-06-01T00:00:00"})
        resp = client.get("/tasks/", params={"due_before": "2025-01-01T00:00:00"})
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_list_filter_combined_all_three(self, client):
        client.post("/tasks/", json={
            "title": "Match",
            "priority": "high",
            "due_date": "2025-06-01T00:00:00",
        })
        client.post("/tasks/", json={
            "title": "Wrong priority",
            "priority": "low",
            "due_date": "2025-06-01T00:00:00",
        })
        t = client.post("/tasks/", json={
            "title": "Wrong status",
            "priority": "high",
            "due_date": "2025-06-01T00:00:00",
        }).json()
        client.patch(f"/tasks/{t['id']}", json={"status": "in_progress"})
        resp = client.get("/tasks/", params={
            "status": "todo",
            "priority": "high",
            "due_before": "2026-01-01T00:00:00",
        })
        assert len(resp.json()) == 1
        assert resp.json()[0]["title"] == "Match"

    def test_patch_with_null_due_date(self, client):
        t = client.post("/tasks/", json={
            "title": "T",
            "due_date": "2026-06-01T00:00:00",
        }).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"due_date": None})
        assert resp.status_code == 200
        assert resp.json()["due_date"] is None

    def test_create_and_delete_and_recreate(self, client):
        t1 = client.post("/tasks/", json={"title": "First"}).json()
        client.delete(f"/tasks/{t1['id']}")
        t2 = client.post("/tasks/", json={"title": "Second"}).json()
        resp = client.get(f"/tasks/{t2['id']}")
        assert resp.status_code == 200
        assert resp.json()["title"] == "Second"
        remaining = client.get("/tasks/").json()
        assert len(remaining) == 1
        assert remaining[0]["title"] == "Second"
