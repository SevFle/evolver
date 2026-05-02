import pytest
from datetime import datetime


class TestSecurityExtra:
    def test_sql_injection_in_update_title(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={
            "title": "'; DROP TABLE tasks; --"
        })
        assert resp.status_code == 200
        resp = client.get("/tasks/")
        assert len(resp.json()) == 1

    def test_sql_injection_in_update_description(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={
            "description": "'; DELETE FROM tasks; --"
        })
        assert resp.status_code == 200
        resp = client.get("/tasks/")
        assert len(resp.json()) == 1

    def test_sql_injection_in_delete_id(self, client):
        resp = client.delete("/tasks/1; DROP TABLE tasks")
        assert resp.status_code == 422

    def test_path_traversal_in_id(self, client):
        resp = client.get("/tasks/../etc/passwd")
        assert resp.status_code in (404, 422)

    def test_very_long_title_accepted_within_limit(self, client):
        resp = client.post("/tasks/", json={"title": "A" * 200})
        assert resp.status_code == 201

    def test_very_long_title_rejected_over_limit(self, client):
        resp = client.post("/tasks/", json={"title": "A" * 201})
        assert resp.status_code == 422

    def test_emoji_in_title(self, client):
        resp = client.post("/tasks/", json={"title": "🎉🎊 Party 🎂"})
        assert resp.status_code == 201
        assert resp.json()["title"] == "🎉🎊 Party 🎂"

    def test_emoji_in_description(self, client):
        resp = client.post("/tasks/", json={
            "title": "T",
            "description": "Hello 🌍 World 🚀",
        })
        assert resp.status_code == 201
        assert resp.json()["description"] == "Hello 🌍 World 🚀"

    def test_mixed_scripts_in_title(self, client):
        payload = "<script>alert(1)</script><img src=x onerror=alert(2)>"
        resp = client.post("/tasks/", json={"title": payload})
        assert resp.status_code == 201
        assert resp.json()["title"] == payload

    def test_encoded_html_in_description(self, client):
        resp = client.post("/tasks/", json={
            "title": "T",
            "description": "&lt;script&gt;alert(1)&lt;/script&gt;",
        })
        assert resp.status_code == 201

    def test_crlf_injection_in_title(self, client):
        resp = client.post("/tasks/", json={"title": "test\r\nHeader: injected"})
        assert resp.status_code in (201, 422)

    def test_null_byte_in_description(self, client):
        resp = client.post("/tasks/", json={
            "title": "T",
            "description": "test\x00description",
        })
        assert resp.status_code in (201, 422)

    def test_large_number_of_tasks(self, client):
        for i in range(50):
            resp = client.post("/tasks/", json={"title": f"Task {i}"})
            assert resp.status_code == 201
        resp = client.get("/tasks/")
        assert len(resp.json()) == 50

    def test_rapid_create_update_cycle(self, client):
        t = client.post("/tasks/", json={"title": "Rapid"}).json()
        for i in range(10):
            resp = client.patch(f"/tasks/{t['id']}", json={"title": f"Update {i}"})
            assert resp.status_code == 200
        final = client.get(f"/tasks/{t['id']}")
        assert final.json()["title"] == "Update 9"

    def test_update_nonexistent_after_delete_returns_404(self, client):
        t = client.post("/tasks/", json={"title": "Delete"}).json()
        client.delete(f"/tasks/{t['id']}")
        resp = client.patch(f"/tasks/{t['id']}", json={"title": "Ghost"})
        assert resp.status_code == 404

    def test_get_nonexistent_after_delete_returns_404(self, client):
        t = client.post("/tasks/", json={"title": "Delete"}).json()
        client.delete(f"/tasks/{t['id']}")
        resp = client.get(f"/tasks/{t['id']}")
        assert resp.status_code == 404

    def test_unicode_in_all_fields(self, client):
        resp = client.post("/tasks/", json={
            "title": "タスク名前",
            "description": "Описание задачи",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["title"] == "タスク名前"
        assert data["description"] == "Описание задачи"

    def test_response_content_type_is_json(self, client):
        client.post("/tasks/", json={"title": "T"})
        resp = client.get("/tasks/1")
        assert "application/json" in resp.headers.get("content-type", "")

    def test_create_with_all_fields_unicode(self, client):
        resp = client.post("/tasks/", json={
            "title": "重要的任务",
            "description": "這是一個測試描述",
            "priority": "high",
            "due_date": "2026-12-31T23:59:59",
        })
        assert resp.status_code == 201

    def test_patch_with_extra_ignored_fields(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={
            "title": "Updated",
            "malicious_field": "should be ignored",
        })
        assert resp.status_code == 200
        assert resp.json()["title"] == "Updated"

    def test_invalid_status_transition_returns_409_not_500(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"status": "done"})
        assert resp.status_code == 409

    def test_double_delete_returns_404(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp1 = client.delete(f"/tasks/{t['id']}")
        assert resp1.status_code == 204
        resp2 = client.delete(f"/tasks/{t['id']}")
        assert resp2.status_code == 404

    def test_delete_then_get_404(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        client.delete(f"/tasks/{t['id']}")
        resp = client.get(f"/tasks/{t['id']}")
        assert resp.status_code == 404

    def test_status_cannot_skip_from_todo_to_done(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"status": "done"})
        assert resp.status_code == 409

    def test_done_cannot_transition_to_todo(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        client.patch(f"/tasks/{t['id']}", json={"status": "in_progress"})
        client.patch(f"/tasks/{t['id']}", json={"status": "done"})
        resp = client.patch(f"/tasks/{t['id']}", json={"status": "todo"})
        assert resp.status_code == 409
