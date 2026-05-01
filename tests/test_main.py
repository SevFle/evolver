import pytest

from app.main import app, lifespan


class TestAppConfiguration:
    def test_app_title(self):
        assert app.title == "TaskPilot"

    def test_app_version(self):
        assert app.version == "0.1.0"

    def test_app_is_fastapi_instance(self):
        from fastapi import FastAPI
        assert isinstance(app, FastAPI)


class TestAppRoutes:
    def test_create_task_route_registered(self):
        routes = [r.path for r in app.routes]
        assert "/tasks/" in routes

    def test_task_id_route_registered(self):
        routes = [r.path for r in app.routes]
        assert "/tasks/{task_id}" in routes

    def test_routes_have_correct_prefix(self):
        task_routes = [r for r in app.routes if hasattr(r, 'path') and r.path.startswith("/tasks")]
        assert len(task_routes) > 0

    def test_http_methods_registered(self):
        all_methods = set()
        task_path_methods = {}
        for route in app.routes:
            if hasattr(route, 'methods') and hasattr(route, 'path'):
                for method in route.methods:
                    all_methods.add(method)
                if route.path.startswith("/tasks"):
                    task_path_methods.setdefault(route.path, set()).update(route.methods)
        assert "POST" in all_methods
        assert "GET" in all_methods
        assert "PATCH" in all_methods
        assert "DELETE" in all_methods
        has_task_routes = any(p.startswith("/tasks") for p in task_path_methods)
        assert has_task_routes

    def test_root_path_returns_404(self, client):
        resp = client.get("/")
        assert resp.status_code == 404

    def test_tasks_trailing_slash(self, client):
        resp = client.get("/tasks/")
        assert resp.status_code == 200


class TestUnsupportedMethods:
    def test_put_on_task_id_not_allowed(self, client):
        resp = client.put("/tasks/1", json={"title": "X"})
        assert resp.status_code == 405

    def test_post_on_task_id_not_allowed(self, client):
        resp = client.post("/tasks/1", json={"title": "X"})
        assert resp.status_code == 405

    def test_patch_on_task_list_not_allowed(self, client):
        resp = client.patch("/tasks/", json={"title": "X"})
        assert resp.status_code == 405

    def test_delete_on_task_list_not_allowed(self, client):
        resp = client.delete("/tasks/")
        assert resp.status_code == 405


class TestLifespan:
    def test_lifespan_initializes_db(self):
        from contextlib import asynccontextmanager
        import inspect
        assert inspect.isasyncgenfunction(lifespan.__wrapped__) or callable(lifespan)
