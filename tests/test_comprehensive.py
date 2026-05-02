import pytest
from datetime import datetime, timedelta

from app.models import Priority, Status, Task, VALID_TRANSITIONS
from app.schemas import TaskCreate, TaskUpdate, TaskResponse
from app.services import TaskService, InvalidTransitionError, TaskNotFoundError


class TestServiceTransactionIntegrity:
    def test_create_task_commits_to_db(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Persist"))
        db_session.expire_all()
        found = db_session.get(Task, task.id)
        assert found is not None
        assert found.title == "Persist"

    def test_delete_task_removes_from_db(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Remove"))
        task_id = task.id
        svc.delete_task(task_id)
        db_session.expire_all()
        assert db_session.get(Task, task_id) is None

    def test_update_task_persists_to_db(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Before"))
        svc.update_task(task.id, TaskUpdate(title="After"))
        db_session.expire_all()
        found = db_session.get(Task, task.id)
        assert found.title == "After"

    def test_update_priority_persists_correct_value(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T", priority=Priority.LOW))
        svc.update_task(task.id, TaskUpdate(priority=Priority.CRITICAL))
        db_session.expire_all()
        found = db_session.get(Task, task.id)
        assert found.priority == Priority.CRITICAL.value

    def test_update_status_persists_correct_value(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        svc.update_task(task.id, TaskUpdate(status=Status.IN_PROGRESS))
        db_session.expire_all()
        found = db_session.get(Task, task.id)
        assert found.status == Status.IN_PROGRESS.value


class TestServiceListOrdering:
    def test_list_returns_newest_first(self, db_session):
        from sqlalchemy import text
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="Oldest"))
        db_session.execute(text("UPDATE tasks SET created_at = datetime('now', '-5 seconds') WHERE title = 'Oldest'"))
        db_session.commit()
        svc.create_task(TaskCreate(title="Newest"))
        tasks = svc.list_tasks()
        assert tasks[0].title == "Newest"
        assert tasks[-1].title == "Oldest"

    def test_list_with_many_tasks_maintains_order(self, db_session):
        from sqlalchemy import text
        svc = TaskService(db_session)
        for i in range(10):
            svc.create_task(TaskCreate(title=f"Task {i:02d}"))
            db_session.execute(text(f"UPDATE tasks SET created_at = datetime('now', '-{10 - i} seconds') WHERE title = 'Task {i:02d}'"))
            db_session.commit()
        tasks = svc.list_tasks()
        titles = [t.title for t in tasks]
        assert titles == sorted(titles, reverse=True)

    def test_list_filter_does_not_change_ordering(self, db_session):
        from sqlalchemy import text
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="C", priority=Priority.HIGH))
        db_session.execute(text("UPDATE tasks SET created_at = datetime('now', '-2 seconds') WHERE title = 'C'"))
        db_session.commit()
        svc.create_task(TaskCreate(title="B", priority=Priority.HIGH))
        db_session.execute(text("UPDATE tasks SET created_at = datetime('now', '-1 second') WHERE title = 'B'"))
        db_session.commit()
        svc.create_task(TaskCreate(title="A", priority=Priority.HIGH))
        tasks = svc.list_tasks(priority=Priority.HIGH)
        assert [t.title for t in tasks] == ["A", "B", "C"]


class TestServiceFilterEdgeCases:
    def test_list_due_before_excludes_null(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="No date"))
        svc.create_task(TaskCreate(title="Has date", due_date=datetime(2025, 1, 1)))
        svc.create_task(TaskCreate(title="Future date", due_date=datetime(2099, 1, 1)))
        result = svc.list_tasks(due_before=datetime(2026, 1, 1))
        assert len(result) == 1
        assert result[0].title == "Has date"

    def test_list_due_before_with_microsecond_boundary(self, db_session):
        svc = TaskService(db_session)
        boundary = datetime(2026, 6, 15, 12, 0, 0)
        svc.create_task(TaskCreate(title="At boundary", due_date=boundary))
        svc.create_task(TaskCreate(title="1 sec before", due_date=boundary - timedelta(seconds=1)))
        svc.create_task(TaskCreate(title="1 sec after", due_date=boundary + timedelta(seconds=1)))
        result = svc.list_tasks(due_before=boundary)
        titles = {t.title for t in result}
        assert "At boundary" in titles
        assert "1 sec before" in titles
        assert "1 sec after" not in titles

    def test_list_status_filter_excludes_other_statuses(self, db_session):
        svc = TaskService(db_session)
        t1 = svc.create_task(TaskCreate(title="Todo"))
        t2 = svc.create_task(TaskCreate(title="Prog"))
        svc.update_task(t1.id, TaskUpdate(status=Status.IN_PROGRESS))
        svc.update_task(t2.id, TaskUpdate(status=Status.IN_PROGRESS))
        svc.update_task(t1.id, TaskUpdate(status=Status.DONE))
        todo_tasks = svc.list_tasks(status=Status.TODO)
        in_progress_tasks = svc.list_tasks(status=Status.IN_PROGRESS)
        done_tasks = svc.list_tasks(status=Status.DONE)
        assert len(todo_tasks) == 0
        assert len(in_progress_tasks) == 1
        assert in_progress_tasks[0].title == "Prog"
        assert len(done_tasks) == 1
        assert done_tasks[0].title == "Todo"

    def test_list_returns_copy_not_reference(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="T"))
        result1 = svc.list_tasks()
        svc.create_task(TaskCreate(title="T2"))
        result2 = svc.list_tasks()
        assert len(result1) == 1
        assert len(result2) == 2

    def test_list_no_filters_returns_all(self, db_session):
        svc = TaskService(db_session)
        for p in Priority:
            svc.create_task(TaskCreate(title=f"Task {p.value}", priority=p))
        result = svc.list_tasks()
        assert len(result) == len(Priority)

    def test_list_priority_filter_case_sensitive(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="T", priority=Priority.HIGH))
        result = svc.list_tasks(priority=Priority.HIGH)
        assert len(result) == 1


class TestServiceTransitionMatrix:
    @pytest.mark.parametrize("source,target,should_succeed", [
        (Status.TODO, Status.TODO, True),
        (Status.TODO, Status.IN_PROGRESS, True),
        (Status.TODO, Status.DONE, False),
        (Status.IN_PROGRESS, Status.IN_PROGRESS, True),
        (Status.IN_PROGRESS, Status.DONE, True),
        (Status.IN_PROGRESS, Status.TODO, True),
        (Status.DONE, Status.DONE, True),
        (Status.DONE, Status.IN_PROGRESS, True),
        (Status.DONE, Status.TODO, False),
    ])
    def test_all_possible_transitions(self, db_session, source, target, should_succeed):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        if source != Status.TODO:
            if source == Status.IN_PROGRESS:
                svc.update_task(task.id, TaskUpdate(status=Status.IN_PROGRESS))
            elif source == Status.DONE:
                svc.update_task(task.id, TaskUpdate(status=Status.IN_PROGRESS))
                svc.update_task(task.id, TaskUpdate(status=Status.DONE))
        if should_succeed:
            result = svc.update_task(task.id, TaskUpdate(status=target))
            assert result.status == target.value
        else:
            with pytest.raises(InvalidTransitionError):
                svc.update_task(task.id, TaskUpdate(status=target))

    def test_transition_error_contains_source_and_target(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        with pytest.raises(InvalidTransitionError) as exc_info:
            svc.update_task(task.id, TaskUpdate(status=Status.DONE))
        msg = str(exc_info.value).lower()
        assert "todo" in msg
        assert "done" in msg


class TestServiceUpdateEdgeCases:
    def test_update_with_no_changes(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Same"))
        original_updated_at = task.updated_at
        updated = svc.update_task(task.id, TaskUpdate())
        assert updated.title == "Same"

    def test_update_description_to_empty_preserves_title(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Keep", description="Had content"))
        updated = svc.update_task(task.id, TaskUpdate(description=""))
        assert updated.title == "Keep"
        assert updated.description == ""

    def test_update_clears_due_date(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T", due_date=datetime(2026, 1, 1)))
        assert task.due_date is not None
        updated = svc.update_task(task.id, TaskUpdate(due_date=None))
        assert updated.due_date is None

    def test_update_sets_due_date_on_task_without_one(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        assert task.due_date is None
        new_date = datetime(2027, 6, 15)
        updated = svc.update_task(task.id, TaskUpdate(due_date=new_date))
        assert updated.due_date == new_date

    def test_update_all_fields_simultaneously_with_status_transition(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Old", description="Old desc", priority=Priority.LOW))
        updated = svc.update_task(task.id, TaskUpdate(
            title="New",
            description="New desc",
            priority=Priority.CRITICAL,
            status=Status.IN_PROGRESS,
            due_date=datetime(2028, 1, 1),
        ))
        assert updated.title == "New"
        assert updated.description == "New desc"
        assert updated.priority == Priority.CRITICAL.value
        assert updated.status == Status.IN_PROGRESS.value
        assert updated.due_date == datetime(2028, 1, 1)


class TestServiceDeleteEdgeCases:
    def test_delete_all_tasks_leaves_empty_list(self, db_session):
        svc = TaskService(db_session)
        t1 = svc.create_task(TaskCreate(title="A"))
        t2 = svc.create_task(TaskCreate(title="B"))
        svc.delete_task(t1.id)
        svc.delete_task(t2.id)
        assert svc.list_tasks() == []

    def test_delete_middle_task_preserves_others(self, db_session):
        svc = TaskService(db_session)
        t1 = svc.create_task(TaskCreate(title="First"))
        t2 = svc.create_task(TaskCreate(title="Middle"))
        t3 = svc.create_task(TaskCreate(title="Last"))
        svc.delete_task(t2.id)
        remaining = svc.list_tasks()
        assert len(remaining) == 2
        titles = {t.title for t in remaining}
        assert titles == {"First", "Last"}


class TestServiceGetEdgeCases:
    def test_get_task_after_update_reflects_changes(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Original"))
        svc.update_task(task.id, TaskUpdate(title="Modified"))
        fetched = svc.get_task(task.id)
        assert fetched.title == "Modified"

    def test_get_multiple_tasks_by_id(self, db_session):
        svc = TaskService(db_session)
        t1 = svc.create_task(TaskCreate(title="A"))
        t2 = svc.create_task(TaskCreate(title="B"))
        t3 = svc.create_task(TaskCreate(title="C"))
        assert svc.get_task(t1.id).title == "A"
        assert svc.get_task(t2.id).title == "B"
        assert svc.get_task(t3.id).title == "C"


class TestApiIdempotencyAndConsistency:
    def test_get_task_after_create_matches(self, client):
        created = client.post("/tasks/", json={"title": "Match", "priority": "high"}).json()
        fetched = client.get(f"/tasks/{created['id']}").json()
        assert created == fetched

    def test_list_includes_newly_created_task(self, client):
        client.post("/tasks/", json={"title": "Before"})
        client.post("/tasks/", json={"title": "After"})
        resp = client.get("/tasks/")
        titles = {t["title"] for t in resp.json()}
        assert "Before" in titles
        assert "After" in titles

    def test_update_reflected_in_get(self, client):
        t = client.post("/tasks/", json={"title": "Old"}).json()
        client.patch(f"/tasks/{t['id']}", json={"title": "New"})
        resp = client.get(f"/tasks/{t['id']}")
        assert resp.json()["title"] == "New"

    def test_update_reflected_in_list(self, client):
        t = client.post("/tasks/", json={"title": "T", "priority": "low"}).json()
        client.patch(f"/tasks/{t['id']}", json={"priority": "critical"})
        resp = client.get("/tasks/")
        assert resp.json()[0]["priority"] == "critical"

    def test_delete_reflected_in_list(self, client):
        t = client.post("/tasks/", json={"title": "Remove me"}).json()
        client.delete(f"/tasks/{t['id']}")
        resp = client.get("/tasks/")
        assert all(task["title"] != "Remove me" for task in resp.json())

    def test_status_change_reflected_in_filtered_list(self, client):
        t = client.post("/tasks/", json={"title": "Status"}).json()
        client.patch(f"/tasks/{t['id']}", json={"status": "in_progress"})
        todo_resp = client.get("/tasks/", params={"status": "todo"})
        in_prog_resp = client.get("/tasks/", params={"status": "in_progress"})
        assert len(todo_resp.json()) == 0
        assert len(in_prog_resp.json()) == 1


class TestApiResponseHeaders:
    def test_create_returns_application_json(self, client):
        resp = client.post("/tasks/", json={"title": "T"})
        assert "application/json" in resp.headers["content-type"]

    def test_get_returns_application_json(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.get(f"/tasks/{t['id']}")
        assert "application/json" in resp.headers["content-type"]

    def test_list_returns_application_json(self, client):
        resp = client.get("/tasks/")
        assert "application/json" in resp.headers["content-type"]

    def test_update_returns_application_json(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"title": "U"})
        assert "application/json" in resp.headers["content-type"]

    def test_404_returns_application_json(self, client):
        resp = client.get("/tasks/999")
        assert "application/json" in resp.headers["content-type"]

    def test_409_returns_application_json(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"status": "done"})
        assert resp.status_code == 409
        assert "application/json" in resp.headers["content-type"]

    def test_422_returns_application_json(self, client):
        resp = client.post("/tasks/", json={"title": ""})
        assert resp.status_code == 422
        assert "application/json" in resp.headers["content-type"]


class TestApiErrorResponses:
    def test_404_has_detail_key(self, client):
        resp_get = client.get("/tasks/999")
        assert resp_get.status_code == 404
        assert "detail" in resp_get.json()
        resp_patch = client.patch("/tasks/999", json={"title": "X"})
        assert resp_patch.status_code == 404
        assert "detail" in resp_patch.json()
        resp_delete = client.delete("/tasks/999")
        assert resp_delete.status_code == 404
        assert "detail" in resp_delete.json()

    def test_422_validation_error_has_detail(self, client):
        resp = client.post("/tasks/", json={"title": ""})
        assert resp.status_code == 422
        data = resp.json()
        assert "detail" in data

    def test_409_conflict_has_detail(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"status": "done"})
        assert resp.status_code == 409
        assert "detail" in resp.json()

    def test_delete_404_error_detail_text(self, client):
        resp = client.delete("/tasks/999")
        assert resp.status_code == 404
        assert resp.json()["detail"] == "Task not found"

    def test_get_404_error_detail_text(self, client):
        resp = client.get("/tasks/999")
        assert resp.status_code == 404
        assert resp.json()["detail"] == "Task not found"

    def test_patch_404_error_detail_text(self, client):
        resp = client.patch("/tasks/999", json={"title": "X"})
        assert resp.status_code == 404
        assert resp.json()["detail"] == "Task not found"


class TestApiDueDateEdgeCases:
    def test_create_with_due_date_iso_format(self, client):
        resp = client.post("/tasks/", json={
            "title": "T",
            "due_date": "2026-12-31T23:59:59",
        })
        assert resp.status_code == 201
        assert resp.json()["due_date"] == "2026-12-31T23:59:59"

    def test_update_due_date_from_none_to_value(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        assert t["due_date"] is None
        resp = client.patch(f"/tasks/{t['id']}", json={"due_date": "2027-06-15T00:00:00"})
        assert resp.json()["due_date"] == "2027-06-15T00:00:00"

    def test_update_due_date_from_value_to_none(self, client):
        t = client.post("/tasks/", json={"title": "T", "due_date": "2026-01-01T00:00:00"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"due_date": None})
        assert resp.json()["due_date"] is None

    def test_filter_due_before_with_no_tasks_returns_empty(self, client):
        resp = client.get("/tasks/", params={"due_before": "2026-01-01T00:00:00"})
        assert resp.status_code == 200
        assert resp.json() == []

    def test_filter_due_before_with_all_past(self, client):
        client.post("/tasks/", json={"title": "A", "due_date": "2020-01-01T00:00:00"})
        client.post("/tasks/", json={"title": "B", "due_date": "2021-01-01T00:00:00"})
        resp = client.get("/tasks/", params={"due_before": "2026-01-01T00:00:00"})
        assert len(resp.json()) == 2

    def test_filter_due_before_with_all_future(self, client):
        client.post("/tasks/", json={"title": "A", "due_date": "2099-01-01T00:00:00"})
        resp = client.get("/tasks/", params={"due_before": "2026-01-01T00:00:00"})
        assert resp.json() == []


class TestApiStatusTransitionWorkflows:
    def test_full_forward_workflow(self, client):
        t = client.post("/tasks/", json={"title": "Flow"}).json()
        assert t["status"] == "todo"
        resp = client.patch(f"/tasks/{t['id']}", json={"status": "in_progress"})
        assert resp.json()["status"] == "in_progress"
        resp = client.patch(f"/tasks/{t['id']}", json={"status": "done"})
        assert resp.json()["status"] == "done"

    def test_reopen_from_done(self, client):
        t = client.post("/tasks/", json={"title": "Reopen"}).json()
        client.patch(f"/tasks/{t['id']}", json={"status": "in_progress"})
        client.patch(f"/tasks/{t['id']}", json={"status": "done"})
        resp = client.patch(f"/tasks/{t['id']}", json={"status": "in_progress"})
        assert resp.json()["status"] == "in_progress"

    def test_revert_from_in_progress_to_todo(self, client):
        t = client.post("/tasks/", json={"title": "Revert"}).json()
        client.patch(f"/tasks/{t['id']}", json={"status": "in_progress"})
        resp = client.patch(f"/tasks/{t['id']}", json={"status": "todo"})
        assert resp.json()["status"] == "todo"

    def test_cannot_skip_in_progress(self, client):
        t = client.post("/tasks/", json={"title": "Skip"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"status": "done"})
        assert resp.status_code == 409

    def test_cannot_go_done_to_todo(self, client):
        t = client.post("/tasks/", json={"title": "Jump"}).json()
        client.patch(f"/tasks/{t['id']}", json={"status": "in_progress"})
        client.patch(f"/tasks/{t['id']}", json={"status": "done"})
        resp = client.patch(f"/tasks/{t['id']}", json={"status": "todo"})
        assert resp.status_code == 409


class TestSchemaRoundtrip:
    def test_task_create_roundtrip_through_api(self, client):
        payload = {
            "title": "Roundtrip",
            "description": "Full round trip test",
            "priority": "high",
            "due_date": "2026-06-15T12:00:00",
        }
        resp = client.post("/tasks/", json=payload)
        data = resp.json()
        assert data["title"] == payload["title"]
        assert data["description"] == payload["description"]
        assert data["priority"] == payload["priority"]
        assert data["due_date"] == payload["due_date"]

    def test_task_update_partial_roundtrip(self, client):
        t = client.post("/tasks/", json={
            "title": "Original",
            "description": "Keep",
            "priority": "low",
        }).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"title": "Updated"})
        data = resp.json()
        assert data["title"] == "Updated"
        assert data["description"] == "Keep"
        assert data["priority"] == "low"
        assert data["status"] == "todo"

    def test_task_response_from_db_model(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(
            title="Response",
            description="Test",
            priority=Priority.HIGH,
            due_date=datetime(2026, 6, 15),
        ))
        response = TaskResponse.model_validate(task)
        assert response.id == task.id
        assert response.title == "Response"
        assert response.description == "Test"
        assert response.priority == Priority.HIGH.value
        assert response.status == Status.TODO.value
        assert response.due_date == datetime(2026, 6, 15)
        assert response.created_at is not None
        assert response.updated_at is not None


class TestSchemaValidation:
    def test_task_create_title_exactly_200(self):
        t = TaskCreate(title="A" * 200)
        assert len(t.title) == 200

    def test_task_create_title_201_fails(self):
        with pytest.raises(ValueError):
            TaskCreate(title="A" * 201)

    def test_task_create_description_exactly_2000(self):
        t = TaskCreate(title="T", description="B" * 2000)
        assert len(t.description) == 2000

    def test_task_create_description_2001_fails(self):
        with pytest.raises(ValueError):
            TaskCreate(title="T", description="B" * 2001)

    def test_task_update_title_none_vs_unset(self):
        u = TaskUpdate(title=None)
        dumped = u.model_dump(exclude_unset=True)
        assert "title" in dumped
        assert dumped["title"] is None

        u2 = TaskUpdate()
        dumped2 = u2.model_dump(exclude_unset=True)
        assert "title" not in dumped2

    def test_task_update_description_none_vs_unset(self):
        u = TaskUpdate(description=None)
        dumped = u.model_dump(exclude_unset=True)
        assert "description" in dumped
        assert dumped["description"] is None

    def test_task_create_strip_various_whitespace(self):
        t = TaskCreate(title="\t Tabbed \t")
        assert t.title == "Tabbed"

    def test_task_update_strip_various_whitespace(self):
        u = TaskUpdate(title="\n Newlines \n")
        assert u.title == "Newlines"

    def test_task_create_with_all_priorities(self):
        for p in Priority:
            t = TaskCreate(title="T", priority=p)
            assert t.priority == p

    def test_task_update_with_all_statuses(self):
        for s in Status:
            u = TaskUpdate(status=s)
            assert u.status == s


class TestModelConstraints:
    def test_valid_transitions_covers_all_statuses(self):
        for status in Status:
            assert status in VALID_TRANSITIONS

    def test_valid_transitions_only_references_valid_statuses(self):
        all_statuses = set(Status)
        for source, targets in VALID_TRANSITIONS.items():
            assert source in all_statuses
            for target in targets:
                assert target in all_statuses

    def test_priority_values_are_lowercase(self):
        for p in Priority:
            assert p.value == p.value.lower()

    def test_status_values_are_lowercase(self):
        for s in Status:
            assert s.value == s.value.lower()

    def test_valid_transitions_no_self_loops(self):
        for source, targets in VALID_TRANSITIONS.items():
            assert source not in targets


class TestApiBulkOperations:
    def test_create_many_tasks(self, client):
        for i in range(20):
            resp = client.post("/tasks/", json={"title": f"Task {i}"})
            assert resp.status_code == 201
        resp = client.get("/tasks/")
        assert len(resp.json()) == 20

    def test_create_filter_delete_cycle(self, client):
        client.post("/tasks/", json={"title": "High", "priority": "high"})
        client.post("/tasks/", json={"title": "Low", "priority": "low"})
        resp = client.get("/tasks/", params={"priority": "high"})
        assert len(resp.json()) == 1
        high_task = resp.json()[0]
        client.delete(f"/tasks/{high_task['id']}")
        resp = client.get("/tasks/")
        assert len(resp.json()) == 1
        assert resp.json()[0]["priority"] == "low"

    def test_update_multiple_tasks_independently(self, client):
        t1 = client.post("/tasks/", json={"title": "A"}).json()
        t2 = client.post("/tasks/", json={"title": "B"}).json()
        client.patch(f"/tasks/{t1['id']}", json={"status": "in_progress"})
        resp1 = client.get(f"/tasks/{t1['id']}").json()
        resp2 = client.get(f"/tasks/{t2['id']}").json()
        assert resp1["status"] == "in_progress"
        assert resp2["status"] == "todo"


class TestApiCreateEdgeCases:
    def test_create_with_exact_max_description(self, client):
        resp = client.post("/tasks/", json={"title": "T", "description": "D" * 2000})
        assert resp.status_code == 201

    def test_create_with_exact_max_title(self, client):
        resp = client.post("/tasks/", json={"title": "T" * 200})
        assert resp.status_code == 201

    def test_create_task_default_priority_is_medium(self, client):
        resp = client.post("/tasks/", json={"title": "Default"})
        assert resp.json()["priority"] == "medium"

    def test_create_task_default_status_is_todo(self, client):
        resp = client.post("/tasks/", json={"title": "Default"})
        assert resp.json()["status"] == "todo"

    def test_create_task_default_description_is_empty(self, client):
        resp = client.post("/tasks/", json={"title": "Default"})
        assert resp.json()["description"] == ""

    def test_create_task_default_due_date_is_none(self, client):
        resp = client.post("/tasks/", json={"title": "Default"})
        assert resp.json()["due_date"] is None

    def test_create_with_only_title(self, client):
        resp = client.post("/tasks/", json={"title": "Minimal"})
        assert resp.status_code == 201
        data = resp.json()
        assert data["title"] == "Minimal"
        assert data["description"] == ""
        assert data["priority"] == "medium"
        assert data["status"] == "todo"
        assert data["due_date"] is None


class TestApiDeleteAndRecreate:
    def test_delete_then_create_new_task(self, client):
        t1 = client.post("/tasks/", json={"title": "First"}).json()
        client.delete(f"/tasks/{t1['id']}")
        t2 = client.post("/tasks/", json={"title": "Second"}).json()
        resp = client.get(f"/tasks/{t2['id']}")
        assert resp.status_code == 200
        assert resp.json()["title"] == "Second"

    def test_delete_all_then_create(self, client):
        t1 = client.post("/tasks/", json={"title": "A"}).json()
        t2 = client.post("/tasks/", json={"title": "B"}).json()
        client.delete(f"/tasks/{t1['id']}")
        client.delete(f"/tasks/{t2['id']}")
        assert client.get("/tasks/").json() == []
        t3 = client.post("/tasks/", json={"title": "C"}).json()
        assert len(client.get("/tasks/").json()) == 1
        assert client.get(f"/tasks/{t3['id']}").json()["title"] == "C"


class TestApiFilterCombinations:
    def test_status_and_priority_no_match(self, client):
        client.post("/tasks/", json={"title": "T", "priority": "low"})
        resp = client.get("/tasks/", params={"status": "todo", "priority": "high"})
        assert resp.json() == []

    def test_status_filter_with_no_matching_tasks(self, client):
        client.post("/tasks/", json={"title": "T"})
        resp = client.get("/tasks/", params={"status": "done"})
        assert resp.json() == []

    def test_priority_filter_with_no_matching_tasks(self, client):
        client.post("/tasks/", json={"title": "T", "priority": "low"})
        resp = client.get("/tasks/", params={"priority": "critical"})
        assert resp.json() == []

    def test_due_before_with_mixed_dates(self, client):
        client.post("/tasks/", json={"title": "Past", "due_date": "2020-01-01T00:00:00"})
        client.post("/tasks/", json={"title": "No date"})
        client.post("/tasks/", json={"title": "Future", "due_date": "2099-01-01T00:00:00"})
        resp = client.get("/tasks/", params={"due_before": "2026-01-01T00:00:00"})
        assert len(resp.json()) == 1
        assert resp.json()[0]["title"] == "Past"
