import pytest
from datetime import datetime


class TestCreateTask:
    def test_create_task_success(self, client):
        resp = client.post("/tasks/", json={"title": "My task"})
        assert resp.status_code == 201
        data = resp.json()
        assert data["title"] == "My task"
        assert data["status"] == "todo"
        assert data["priority"] == "medium"
        assert data["id"] == 1

    def test_create_task_full_payload(self, client):
        resp = client.post("/tasks/", json={
            "title": "Important",
            "description": "Do it now",
            "priority": "critical",
            "due_date": "2026-12-31T23:59:00",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["priority"] == "critical"
        assert data["description"] == "Do it now"

    def test_create_task_empty_title_rejected(self, client):
        resp = client.post("/tasks/", json={"title": ""})
        assert resp.status_code == 422

    def test_create_task_blank_title_rejected(self, client):
        resp = client.post("/tasks/", json={"title": "   "})
        assert resp.status_code == 422

    def test_create_task_title_too_long(self, client):
        resp = client.post("/tasks/", json={"title": "x" * 201})
        assert resp.status_code == 422

    def test_create_task_description_too_long(self, client):
        resp = client.post("/tasks/", json={"title": "ok", "description": "x" * 2001})
        assert resp.status_code == 422

    def test_create_task_invalid_priority(self, client):
        resp = client.post("/tasks/", json={"title": "ok", "priority": "urgent"})
        assert resp.status_code == 422

    def test_create_task_missing_title(self, client):
        resp = client.post("/tasks/", json={"description": "no title"})
        assert resp.status_code == 422

    def test_create_task_strips_whitespace_title(self, client):
        resp = client.post("/tasks/", json={"title": "  spaced  "})
        assert resp.status_code == 201
        assert resp.json()["title"] == "spaced"

    def test_create_task_response_has_all_fields(self, client):
        resp = client.post("/tasks/", json={"title": "Complete"})
        assert resp.status_code == 201
        data = resp.json()
        expected_keys = {"id", "title", "description", "priority", "status", "due_date", "created_at", "updated_at"}
        assert set(data.keys()) == expected_keys

    def test_create_task_response_types(self, client):
        resp = client.post("/tasks/", json={"title": "Types"})
        data = resp.json()
        assert isinstance(data["id"], int)
        assert isinstance(data["title"], str)
        assert isinstance(data["description"], str)
        assert isinstance(data["priority"], str)
        assert isinstance(data["status"], str)
        assert isinstance(data["created_at"], str)
        assert isinstance(data["updated_at"], str)

    def test_create_task_with_due_date(self, client):
        resp = client.post("/tasks/", json={
            "title": "Scheduled",
            "due_date": "2026-06-15T12:00:00",
        })
        assert resp.status_code == 201
        assert resp.json()["due_date"] == "2026-06-15T12:00:00"

    def test_create_task_without_due_date(self, client):
        resp = client.post("/tasks/", json={"title": "No date"})
        assert resp.status_code == 201
        assert resp.json()["due_date"] is None

    def test_create_task_invalid_due_date(self, client):
        resp = client.post("/tasks/", json={"title": "T", "due_date": "not-a-date"})
        assert resp.status_code == 422

    def test_create_task_with_all_priorities(self, client):
        for priority in ["low", "medium", "high", "critical"]:
            resp = client.post("/tasks/", json={"title": f"Task {priority}", "priority": priority})
            assert resp.status_code == 201
            assert resp.json()["priority"] == priority

    def test_create_task_with_description(self, client):
        resp = client.post("/tasks/", json={"title": "T", "description": "Detailed description"})
        assert resp.status_code == 201
        assert resp.json()["description"] == "Detailed description"

    def test_create_task_extra_fields_ignored(self, client):
        resp = client.post("/tasks/", json={"title": "T", "extra_field": "ignored"})
        assert resp.status_code == 201


class TestGetTask:
    def test_get_existing_task(self, client):
        created = client.post("/tasks/", json={"title": "Find me"}).json()
        resp = client.get(f"/tasks/{created['id']}")
        assert resp.status_code == 200
        assert resp.json()["title"] == "Find me"

    def test_get_nonexistent_task_404(self, client):
        resp = client.get("/tasks/999")
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()

    def test_get_task_invalid_id(self, client):
        resp = client.get("/tasks/abc")
        assert resp.status_code == 422

    def test_get_task_negative_id_404(self, client):
        resp = client.get("/tasks/-1")
        assert resp.status_code == 404

    def test_get_task_zero_id_404(self, client):
        resp = client.get("/tasks/0")
        assert resp.status_code == 404

    def test_get_task_response_structure(self, client):
        created = client.post("/tasks/", json={"title": "Structure"}).json()
        resp = client.get(f"/tasks/{created['id']}")
        data = resp.json()
        expected_keys = {"id", "title", "description", "priority", "status", "due_date", "created_at", "updated_at"}
        assert set(data.keys()) == expected_keys

    def test_get_task_returns_correct_data(self, client):
        client.post("/tasks/", json={
            "title": "Specific",
            "description": "Desc",
            "priority": "high",
            "due_date": "2026-06-15T00:00:00",
        })
        resp = client.get("/tasks/1")
        data = resp.json()
        assert data["title"] == "Specific"
        assert data["description"] == "Desc"
        assert data["priority"] == "high"
        assert data["status"] == "todo"
        assert data["due_date"] is not None

    def test_get_large_id_404(self, client):
        resp = client.get("/tasks/999999")
        assert resp.status_code == 404

    def test_get_task_decimal_id_422(self, client):
        resp = client.get("/tasks/1.5")
        assert resp.status_code == 422


class TestListTasks:
    def test_list_empty(self, client):
        resp = client.get("/tasks/")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_list_all_tasks(self, client):
        client.post("/tasks/", json={"title": "A"})
        client.post("/tasks/", json={"title": "B"})
        resp = client.get("/tasks/")
        assert len(resp.json()) == 2

    def test_list_filter_by_status(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        client.patch(f"/tasks/{t['id']}", json={"status": "in_progress"})
        resp = client.get("/tasks/", params={"status": "in_progress"})
        assert len(resp.json()) == 1

    def test_list_filter_by_priority(self, client):
        client.post("/tasks/", json={"title": "Low", "priority": "low"})
        client.post("/tasks/", json={"title": "High", "priority": "high"})
        resp = client.get("/tasks/", params={"priority": "high"})
        assert len(resp.json()) == 1
        assert resp.json()[0]["title"] == "High"

    def test_list_filter_by_due_before(self, client):
        client.post("/tasks/", json={"title": "Past", "due_date": "2025-01-01T00:00:00"})
        client.post("/tasks/", json={"title": "Future", "due_date": "2030-01-01T00:00:00"})
        resp = client.get("/tasks/", params={"due_before": "2026-01-01T00:00:00"})
        assert len(resp.json()) == 1
        assert resp.json()[0]["title"] == "Past"

    def test_list_invalid_status_filter(self, client):
        resp = client.get("/tasks/", params={"status": "nonexistent"})
        assert resp.status_code == 422

    def test_list_invalid_datetime_filter(self, client):
        resp = client.get("/tasks/", params={"due_before": "not-a-date"})
        assert resp.status_code == 422

    def test_list_combined_status_and_priority(self, client):
        client.post("/tasks/", json={"title": "Match", "priority": "high"})
        client.post("/tasks/", json={"title": "Wrong priority", "priority": "low"})
        resp = client.get("/tasks/", params={"status": "todo", "priority": "high"})
        assert len(resp.json()) == 1
        assert resp.json()[0]["title"] == "Match"

    def test_list_returns_all_created(self, client):
        client.post("/tasks/", json={"title": "First"})
        client.post("/tasks/", json={"title": "Second"})
        client.post("/tasks/", json={"title": "Third"})
        resp = client.get("/tasks/")
        titles = [t["title"] for t in resp.json()]
        assert set(titles) == {"First", "Second", "Third"}
        assert len(titles) == 3

    def test_list_filter_todo_returns_initial_state(self, client):
        client.post("/tasks/", json={"title": "New task"})
        resp = client.get("/tasks/", params={"status": "todo"})
        assert len(resp.json()) == 1

    def test_list_filter_done_empty_initially(self, client):
        client.post("/tasks/", json={"title": "Not done"})
        resp = client.get("/tasks/", params={"status": "done"})
        assert resp.json() == []

    def test_list_all_priorities_filterable(self, client):
        for p in ["low", "medium", "high", "critical"]:
            client.post("/tasks/", json={"title": f"Task {p}", "priority": p})
        resp = client.get("/tasks/", params={"priority": "critical"})
        assert len(resp.json()) == 1
        assert resp.json()[0]["priority"] == "critical"

    def test_list_returns_array(self, client):
        resp = client.get("/tasks/")
        assert isinstance(resp.json(), list)


class TestUpdateTask:
    def test_update_title(self, client):
        t = client.post("/tasks/", json={"title": "Old"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"title": "New"})
        assert resp.status_code == 200
        assert resp.json()["title"] == "New"

    def test_update_status_valid_transition(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"status": "in_progress"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "in_progress"

    def test_update_status_invalid_transition(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"status": "done"})
        assert resp.status_code == 409
        assert "transition" in resp.json()["detail"].lower() or "todo" in resp.json()["detail"].lower()

    def test_update_nonexistent_task(self, client):
        resp = client.patch("/tasks/999", json={"title": "X"})
        assert resp.status_code == 404

    def test_update_empty_title_rejected(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"title": ""})
        assert resp.status_code == 422

    def test_full_lifecycle(self, client):
        t = client.post("/tasks/", json={"title": "Lifecycle"}).json()
        assert t["status"] == "todo"

        resp = client.patch(f"/tasks/{t['id']}", json={"status": "in_progress"})
        assert resp.json()["status"] == "in_progress"

        resp = client.patch(f"/tasks/{t['id']}", json={"status": "done"})
        assert resp.json()["status"] == "done"

        resp = client.patch(f"/tasks/{t['id']}", json={"status": "in_progress"})
        assert resp.json()["status"] == "in_progress"

        resp = client.patch(f"/tasks/{t['id']}", json={"status": "todo"})
        assert resp.json()["status"] == "todo"

    def test_update_priority(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"priority": "critical"})
        assert resp.json()["priority"] == "critical"

    def test_update_description(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"description": "New desc"})
        assert resp.status_code == 200
        assert resp.json()["description"] == "New desc"

    def test_update_due_date(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"due_date": "2027-12-31T00:00:00"})
        assert resp.status_code == 200
        assert resp.json()["due_date"] == "2027-12-31T00:00:00"

    def test_update_with_empty_body(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={})
        assert resp.status_code == 200
        assert resp.json()["title"] == "T"

    def test_update_same_status_todo(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"status": "todo"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "todo"

    def test_update_multiple_fields(self, client):
        t = client.post("/tasks/", json={"title": "Old", "description": "Old desc"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={
            "title": "New Title",
            "description": "New Desc",
            "priority": "high",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "New Title"
        assert data["description"] == "New Desc"
        assert data["priority"] == "high"

    def test_update_preserves_unspecified_fields(self, client):
        t = client.post("/tasks/", json={"title": "Keep", "description": "Keep this"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"priority": "low"})
        data = resp.json()
        assert data["title"] == "Keep"
        assert data["description"] == "Keep this"
        assert data["priority"] == "low"

    def test_update_negative_id_404(self, client):
        resp = client.patch("/tasks/-1", json={"title": "X"})
        assert resp.status_code == 404

    def test_update_invalid_status_value(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"status": "cancelled"})
        assert resp.status_code == 422

    def test_update_invalid_priority_value(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"priority": "super_high"})
        assert resp.status_code == 422

    def test_update_title_too_long(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"title": "x" * 201})
        assert resp.status_code == 422

    def test_update_description_too_long(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"description": "x" * 2001})
        assert resp.status_code == 422

    def test_update_whitespace_title_rejected(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"title": "   "})
        assert resp.status_code == 422

    def test_update_strips_title_whitespace(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"title": "  trimmed  "})
        assert resp.status_code == 200
        assert resp.json()["title"] == "trimmed"

    def test_update_409_error_format(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"status": "done"})
        assert resp.status_code == 409
        data = resp.json()
        assert "detail" in data

    def test_update_404_error_format(self, client):
        resp = client.patch("/tasks/999", json={"title": "X"})
        assert resp.status_code == 404
        assert "detail" in resp.json()


class TestDeleteTask:
    def test_delete_existing_task(self, client):
        t = client.post("/tasks/", json={"title": "Delete me"}).json()
        resp = client.delete(f"/tasks/{t['id']}")
        assert resp.status_code == 204

        resp = client.get(f"/tasks/{t['id']}")
        assert resp.status_code == 404

    def test_delete_nonexistent_task(self, client):
        resp = client.delete("/tasks/999")
        assert resp.status_code == 404

    def test_delete_twice(self, client):
        t = client.post("/tasks/", json={"title": "Once"}).json()
        client.delete(f"/tasks/{t['id']}")
        resp = client.delete(f"/tasks/{t['id']}")
        assert resp.status_code == 404

    def test_delete_preserves_others(self, client):
        client.post("/tasks/", json={"title": "Keep"})
        t2 = client.post("/tasks/", json={"title": "Delete"}).json()
        client.delete(f"/tasks/{t2['id']}")
        resp = client.get("/tasks/")
        assert len(resp.json()) == 1
        assert resp.json()[0]["title"] == "Keep"

    def test_delete_returns_no_body(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.delete(f"/tasks/{t['id']}")
        assert resp.status_code == 204
        assert resp.content == b""

    def test_delete_negative_id_404(self, client):
        resp = client.delete("/tasks/-1")
        assert resp.status_code == 404

    def test_delete_invalid_id_422(self, client):
        resp = client.delete("/tasks/abc")
        assert resp.status_code == 422

    def test_delete_404_error_format(self, client):
        resp = client.delete("/tasks/999")
        assert resp.status_code == 404
        assert "detail" in resp.json()


class TestResponseFormat:
    def test_created_task_response_has_timestamps(self, client):
        resp = client.post("/tasks/", json={"title": "Timestamps"})
        data = resp.json()
        assert "created_at" in data
        assert "updated_at" in data
        assert data["created_at"] is not None
        assert data["updated_at"] is not None

    def test_list_response_is_json_array(self, client):
        resp = client.get("/tasks/")
        assert resp.headers["content-type"] == "application/json"
        assert isinstance(resp.json(), list)

    def test_single_task_response_is_json_object(self, client):
        client.post("/tasks/", json={"title": "T"})
        resp = client.get("/tasks/1")
        assert resp.headers["content-type"] == "application/json"
        assert isinstance(resp.json(), dict)
