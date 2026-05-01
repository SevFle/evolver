import pytest


class TestSqlInjectionProtection:
    def test_sql_injection_in_title(self, client):
        resp = client.post("/tasks/", json={"title": "'; DROP TABLE tasks; --"})
        assert resp.status_code == 201
        assert resp.json()["title"] == "'; DROP TABLE tasks; --"
        resp = client.get("/tasks/")
        assert len(resp.json()) == 1

    def test_sql_injection_in_description(self, client):
        resp = client.post("/tasks/", json={
            "title": "T",
            "description": "'; DELETE FROM tasks WHERE 1=1; --",
        })
        assert resp.status_code == 201
        resp = client.get("/tasks/")
        assert len(resp.json()) == 1

    def test_sql_injection_in_task_id_path(self, client):
        resp = client.get("/tasks/1 OR 1=1")
        assert resp.status_code == 422

    def test_sql_injection_in_filter_params(self, client):
        resp = client.get("/tasks/", params={"status": "' OR '1'='1"})
        assert resp.status_code == 422

    def test_task_data_persists_after_injection_attempt(self, client):
        client.post("/tasks/", json={"title": "Safe task"})
        client.post("/tasks/", json={"title": "'; DROP TABLE tasks; --"})
        resp = client.get("/tasks/")
        assert len(resp.json()) == 2
        titles = {t["title"] for t in resp.json()}
        assert "Safe task" in titles


class TestXssProtection:
    def test_script_tag_in_title(self, client):
        resp = client.post("/tasks/", json={"title": "<script>alert('xss')</script>"})
        assert resp.status_code == 201
        data = resp.json()
        assert "<script>" in data["title"]

    def test_html_entities_in_description(self, client):
        resp = client.post("/tasks/", json={
            "title": "T",
            "description": "<img src=x onerror=alert(1)>",
        })
        assert resp.status_code == 201
        assert "<img" in resp.json()["description"]

    def test_script_in_update_title(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"title": "<script>document.cookie</script>"})
        assert resp.status_code == 200
        assert "<script>" in resp.json()["title"]

    def test_javascript_uri_in_title(self, client):
        resp = client.post("/tasks/", json={"title": "javascript:alert(1)"})
        assert resp.status_code == 201
        assert resp.json()["title"] == "javascript:alert(1)"

    def test_event_handler_in_description(self, client):
        resp = client.post("/tasks/", json={
            "title": "T",
            "description": 'onmouseover="alert(1)"',
        })
        assert resp.status_code == 201
        assert "onmouseover" in resp.json()["description"]

    def test_get_task_returns_exact_title(self, client):
        xss_payload = "<script>alert('xss')</script>"
        t = client.post("/tasks/", json={"title": xss_payload}).json()
        resp = client.get(f"/tasks/{t['id']}")
        assert resp.json()["title"] == xss_payload


class TestMalformedInput:
    def test_non_json_body(self, client):
        resp = client.post("/tasks/", content="not json", headers={"Content-Type": "application/json"})
        assert resp.status_code == 422

    def test_json_array_instead_of_object(self, client):
        resp = client.post("/tasks/", json=[{"title": "T"}])
        assert resp.status_code == 422

    def test_json_number_instead_of_object(self, client):
        resp = client.post("/tasks/", json=42)
        assert resp.status_code == 422

    def test_null_body(self, client):
        resp = client.post("/tasks/", json=None)
        assert resp.status_code == 422

    def test_wrong_content_type(self, client):
        resp = client.post("/tasks/", content="title=test", headers={"Content-Type": "text/plain"})
        assert resp.status_code == 422

    def test_boolean_in_title_field(self, client):
        resp = client.post("/tasks/", json={"title": True})
        assert resp.status_code == 422

    def test_number_in_title_field(self, client):
        resp = client.post("/tasks/", json={"title": 123})
        assert resp.status_code == 422

    def test_array_in_title_field(self, client):
        resp = client.post("/tasks/", json={"title": ["a", "b"]})
        assert resp.status_code == 422

    def test_object_in_description_field(self, client):
        resp = client.post("/tasks/", json={"title": "T", "description": {"key": "val"}})
        assert resp.status_code == 422

    def test_patch_with_array_body(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json=[{"title": "X"}])
        assert resp.status_code == 422


class TestBoundaryValues:
    def test_title_exactly_200_chars(self, client):
        resp = client.post("/tasks/", json={"title": "A" * 200})
        assert resp.status_code == 201

    def test_description_exactly_2000_chars(self, client):
        resp = client.post("/tasks/", json={"title": "T", "description": "A" * 2000})
        assert resp.status_code == 201

    def test_title_201_chars_rejected(self, client):
        resp = client.post("/tasks/", json={"title": "A" * 201})
        assert resp.status_code == 422

    def test_description_2001_chars_rejected(self, client):
        resp = client.post("/tasks/", json={"title": "T", "description": "A" * 2001})
        assert resp.status_code == 422

    def test_title_single_character(self, client):
        resp = client.post("/tasks/", json={"title": "X"})
        assert resp.status_code == 201
        assert resp.json()["title"] == "X"

    def test_title_multibyte_unicode(self, client):
        resp = client.post("/tasks/", json={"title": "\U0001f600\U0001f600"})
        assert resp.status_code == 201

    def test_description_with_only_whitespace_valid(self, client):
        resp = client.post("/tasks/", json={"title": "T", "description": "   "})
        assert resp.status_code == 201

    def test_title_with_null_bytes(self, client):
        resp = client.post("/tasks/", json={"title": "test\x00title"})
        assert resp.status_code in (201, 422)

    def test_description_with_very_long_single_word(self, client):
        resp = client.post("/tasks/", json={"title": "T", "description": "A" * 2000})
        assert resp.status_code == 201
        assert len(resp.json()["description"]) == 2000


class TestDataIntegrity:
    def test_deleted_task_id_not_reused(self, client):
        t1 = client.post("/tasks/", json={"title": "First"}).json()
        t2 = client.post("/tasks/", json={"title": "Second"}).json()
        client.delete(f"/tasks/{t1['id']}")
        t3 = client.post("/tasks/", json={"title": "Third"}).json()
        assert t3["id"] > t2["id"]

    def test_update_does_not_change_id(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        original_id = t["id"]
        resp = client.patch(f"/tasks/{t['id']}", json={"title": "Updated"})
        assert resp.json()["id"] == original_id

    def test_create_preserves_exact_description(self, client):
        desc = "Line 1\nLine 2\nLine 3"
        resp = client.post("/tasks/", json={"title": "T", "description": desc})
        assert resp.json()["description"] == desc

    def test_update_preserves_unrelated_fields(self, client):
        t = client.post("/tasks/", json={
            "title": "Original",
            "description": "Keep this",
            "priority": "high",
            "due_date": "2026-12-31T00:00:00",
        }).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"title": "Changed"})
        data = resp.json()
        assert data["title"] == "Changed"
        assert data["description"] == "Keep this"
        assert data["priority"] == "high"
        assert data["due_date"] is not None
        assert data["status"] == "todo"

    def test_task_count_after_operations(self, client):
        t1 = client.post("/tasks/", json={"title": "A"}).json()
        t2 = client.post("/tasks/", json={"title": "B"}).json()
        assert len(client.get("/tasks/").json()) == 2
        client.delete(f"/tasks/{t1['id']}")
        assert len(client.get("/tasks/").json()) == 1
        client.post("/tasks/", json={"title": "C"})
        assert len(client.get("/tasks/").json()) == 2

    def test_status_transitions_full_cycle(self, client):
        t = client.post("/tasks/", json={"title": "Cycle"}).json()
        client.patch(f"/tasks/{t['id']}", json={"status": "in_progress"})
        client.patch(f"/tasks/{t['id']}", json={"status": "done"})
        client.patch(f"/tasks/{t['id']}", json={"status": "in_progress"})
        client.patch(f"/tasks/{t['id']}", json={"status": "todo"})
        resp = client.get(f"/tasks/{t['id']}")
        assert resp.json()["status"] == "todo"
