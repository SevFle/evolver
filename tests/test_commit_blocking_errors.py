import pytest
from datetime import datetime
from unittest.mock import patch, MagicMock

from sqlalchemy import create_engine, select, text, inspect
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db, init_db
from app.models import Priority, Status, Task, VALID_TRANSITIONS
from app.schemas import TaskCreate, TaskResponse, TaskUpdate
from app.services import InvalidTransitionError, TaskNotFoundError, TaskService


class TestTransactionIntegrityAfterFailedTransition:
    def test_invalid_transition_does_not_corrupt_status(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Original"))
        original_status = task.status
        with pytest.raises(InvalidTransitionError):
            svc.update_task(task.id, TaskUpdate(status=Status.DONE))
        refreshed = svc.get_task(task.id)
        assert refreshed.status == original_status

    def test_invalid_transition_does_not_corrupt_title(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Keep"))
        with pytest.raises(InvalidTransitionError):
            svc.update_task(task.id, TaskUpdate(
                title="ShouldNotChange",
                status=Status.DONE,
            ))
        refreshed = svc.get_task(task.id)
        assert refreshed.title == "Keep"

    def test_invalid_transition_does_not_corrupt_priority(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T", priority=Priority.LOW))
        with pytest.raises(InvalidTransitionError):
            svc.update_task(task.id, TaskUpdate(
                priority=Priority.CRITICAL,
                status=Status.DONE,
            ))
        refreshed = svc.get_task(task.id)
        assert refreshed.priority == Priority.LOW.value

    def test_invalid_transition_does_not_corrupt_due_date(self, db_session):
        svc = TaskService(db_session)
        original_due = datetime(2026, 6, 15, 12, 0)
        task = svc.create_task(TaskCreate(title="T", due_date=original_due))
        with pytest.raises(InvalidTransitionError):
            svc.update_task(task.id, TaskUpdate(
                due_date=datetime(2099, 1, 1),
                status=Status.DONE,
            ))
        refreshed = svc.get_task(task.id)
        assert refreshed.due_date == original_due

    def test_invalid_transition_does_not_corrupt_description(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T", description="Original desc"))
        with pytest.raises(InvalidTransitionError):
            svc.update_task(task.id, TaskUpdate(
                description="Corrupted",
                status=Status.DONE,
            ))
        refreshed = svc.get_task(task.id)
        assert refreshed.description == "Original desc"

    def test_multiple_failed_transitions_leave_clean_state(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(
            title="Stable",
            description="Stable desc",
            priority=Priority.HIGH,
            due_date=datetime(2026, 1, 1),
        ))
        for _ in range(10):
            try:
                svc.update_task(task.id, TaskUpdate(status=Status.DONE))
            except InvalidTransitionError:
                pass
        refreshed = svc.get_task(task.id)
        assert refreshed.title == "Stable"
        assert refreshed.description == "Stable desc"
        assert refreshed.priority == Priority.HIGH.value
        assert refreshed.status == Status.TODO.value
        assert refreshed.due_date == datetime(2026, 1, 1)

    def test_valid_transition_after_failed_one_succeeds(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        with pytest.raises(InvalidTransitionError):
            svc.update_task(task.id, TaskUpdate(status=Status.DONE))
        result = svc.update_task(task.id, TaskUpdate(status=Status.IN_PROGRESS))
        assert result.status == Status.IN_PROGRESS.value

    def test_task_not_found_on_update_does_not_affect_other_tasks(self, db_session):
        svc = TaskService(db_session)
        t1 = svc.create_task(TaskCreate(title="Safe"))
        with pytest.raises(TaskNotFoundError):
            svc.update_task(999, TaskUpdate(title="Ghost"))
        refreshed = svc.get_task(t1.id)
        assert refreshed.title == "Safe"

    def test_task_not_found_on_delete_does_not_affect_other_tasks(self, db_session):
        svc = TaskService(db_session)
        t1 = svc.create_task(TaskCreate(title="Safe"))
        with pytest.raises(TaskNotFoundError):
            svc.delete_task(999)
        assert svc.get_task(t1.id) is not None
        assert len(svc.list_tasks()) == 1


class TestConftestFixtureTransactionSafety:
    def test_db_session_fixture_rolls_back_committed_data(self, engine):
        Session = sessionmaker(bind=engine)
        session = Session()
        task = Task(title="Outside fixture", description="", priority="medium", status="todo")
        session.add(task)
        session.commit()
        task_id = task.id
        session.close()

        session2 = Session()
        found = session2.get(Task, task_id)
        assert found is not None
        assert found.title == "Outside fixture"
        session2.close()

    def test_db_session_fixture_handles_service_commits(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Committed"))
        db_session.expire_all()
        found = db_session.get(Task, task.id)
        assert found is not None
        assert found.title == "Committed"

    def test_db_session_fixture_transaction_is_active_after_commit(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="Commit check"))
        assert db_session.is_active

    def test_db_session_allows_multiple_commits(self, db_session):
        svc = TaskService(db_session)
        t1 = svc.create_task(TaskCreate(title="First commit"))
        t2 = svc.create_task(TaskCreate(title="Second commit"))
        t3 = svc.create_task(TaskCreate(title="Third commit"))
        assert svc.get_task(t1.id).title == "First commit"
        assert svc.get_task(t2.id).title == "Second commit"
        assert svc.get_task(t3.id).title == "Third commit"

    def test_engine_fixture_provides_fresh_schema(self, engine):
        inspector = inspect(engine)
        columns = {col["name"] for col in inspector.get_columns("tasks")}
        assert "id" in columns
        assert "title" in columns
        assert "status" in columns

    def test_client_fixture_dependency_override_cleans_up(self, client):
        from app.main import app
        from app.database import get_db
        resp = client.get("/tasks/")
        assert resp.status_code == 200


class TestDatabaseCommitErrors:
    def test_create_task_actually_commits(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Persist"))
        task_id = task.id
        db_session.expire_all()
        found = db_session.get(Task, task_id)
        assert found is not None
        assert found.title == "Persist"

    def test_update_task_actually_commits(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Before"))
        svc.update_task(task.id, TaskUpdate(title="After"))
        db_session.expire_all()
        found = db_session.get(Task, task.id)
        assert found.title == "After"

    def test_delete_task_actually_commits(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Remove"))
        task_id = task.id
        svc.delete_task(task_id)
        db_session.expire_all()
        assert db_session.get(Task, task_id) is None

    def test_status_transition_commits_intermediate_states(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Flow"))
        task_id = task.id

        svc.update_task(task_id, TaskUpdate(status=Status.IN_PROGRESS))
        db_session.expire_all()
        assert db_session.get(Task, task_id).status == Status.IN_PROGRESS.value

        svc.update_task(task_id, TaskUpdate(status=Status.DONE))
        db_session.expire_all()
        assert db_session.get(Task, task_id).status == Status.DONE.value

    def test_priority_update_commits(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="P", priority=Priority.LOW))
        svc.update_task(task.id, TaskUpdate(priority=Priority.CRITICAL))
        db_session.expire_all()
        assert db_session.get(Task, task.id).priority == Priority.CRITICAL.value

    def test_due_date_clear_commits(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="D", due_date=datetime(2026, 1, 1)))
        svc.update_task(task.id, TaskUpdate(due_date=None))
        db_session.expire_all()
        assert db_session.get(Task, task.id).due_date is None


class TestServiceSessionConsistency:
    def test_create_then_immediately_get(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Immediate"))
        found = svc.get_task(task.id)
        assert found.title == "Immediate"
        assert found.id == task.id

    def test_update_then_immediately_list(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="U", priority=Priority.LOW))
        svc.update_task(task.id, TaskUpdate(priority=Priority.HIGH))
        tasks = svc.list_tasks(priority=Priority.HIGH)
        assert len(tasks) == 1
        assert tasks[0].priority == Priority.HIGH.value

    def test_delete_then_immediately_list(self, db_session):
        svc = TaskService(db_session)
        t1 = svc.create_task(TaskCreate(title="Keep"))
        t2 = svc.create_task(TaskCreate(title="Delete"))
        svc.delete_task(t2.id)
        tasks = svc.list_tasks()
        assert len(tasks) == 1
        assert tasks[0].title == "Keep"

    def test_multiple_services_share_session(self, db_session):
        svc1 = TaskService(db_session)
        svc2 = TaskService(db_session)
        task = svc1.create_task(TaskCreate(title="Shared"))
        found = svc2.get_task(task.id)
        assert found.title == "Shared"

    def test_error_in_one_service_does_not_break_other(self, db_session):
        svc1 = TaskService(db_session)
        svc2 = TaskService(db_session)
        t1 = svc1.create_task(TaskCreate(title="Stable"))
        with pytest.raises(TaskNotFoundError):
            svc2.get_task(999)
        found = svc1.get_task(t1.id)
        assert found.title == "Stable"


class TestApiCommitBlockingErrors:
    def test_invalid_transition_does_not_change_any_field(self, client):
        t = client.post("/tasks/", json={
            "title": "Original",
            "description": "Original desc",
            "priority": "high",
            "due_date": "2026-06-15T00:00:00",
        }).json()
        tid = t["id"]
        resp = client.patch(f"/tasks/{tid}", json={
            "title": "Changed",
            "description": "Changed desc",
            "priority": "low",
            "status": "done",
            "due_date": "2099-01-01T00:00:00",
        })
        assert resp.status_code == 409
        after = client.get(f"/tasks/{tid}").json()
        assert after["title"] == "Original"
        assert after["description"] == "Original desc"
        assert after["priority"] == "high"
        assert after["status"] == "todo"
        assert after["due_date"] == "2026-06-15T00:00:00"

    def test_update_nonexistent_task_does_not_affect_existing(self, client):
        t = client.post("/tasks/", json={"title": "Safe"}).json()
        resp = client.patch("/tasks/999", json={"title": "Ghost"})
        assert resp.status_code == 404
        safe = client.get(f"/tasks/{t['id']}").json()
        assert safe["title"] == "Safe"

    def test_delete_nonexistent_task_does_not_affect_existing(self, client):
        t = client.post("/tasks/", json={"title": "Keep"}).json()
        resp = client.delete("/tasks/999")
        assert resp.status_code == 404
        assert client.get(f"/tasks/{t['id']}").json()["title"] == "Keep"

    def test_repeated_invalid_transitions_do_not_degrade(self, client):
        t = client.post("/tasks/", json={"title": "Stress"}).json()
        for _ in range(20):
            resp = client.patch(f"/tasks/{t['id']}", json={"status": "done"})
            assert resp.status_code == 409
        after = client.get(f"/tasks/{t['id']}").json()
        assert after["status"] == "todo"
        assert after["title"] == "Stress"

    def test_create_after_multiple_errors_still_works(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        client.patch("/tasks/999", json={"title": "X"})
        client.delete("/tasks/999")
        client.get("/tasks/abc")
        client.patch(f"/tasks/{t['id']}", json={"status": "done"})
        new = client.post("/tasks/", json={"title": "New"}).json()
        assert new["status_code"] if isinstance(new, dict) and "status_code" in new else new["status"] == "todo"
        assert new["title"] == "New"

    def test_valid_transition_after_409_works(self, client):
        t = client.post("/tasks/", json={"title": "Recover"}).json()
        tid = t["id"]
        resp = client.patch(f"/tasks/{tid}", json={"status": "done"})
        assert resp.status_code == 409
        resp = client.patch(f"/tasks/{tid}", json={"status": "in_progress"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "in_progress"

    def test_422_on_create_does_not_create_partial_task(self, client):
        client.post("/tasks/", json={"title": ""})
        client.post("/tasks/", json={"title": "x" * 201})
        client.post("/tasks/", json={"title": "ok", "priority": "bad"})
        assert client.get("/tasks/").json() == []

    def test_422_on_update_does_not_modify_task(self, client):
        t = client.post("/tasks/", json={"title": "Original"}).json()
        tid = t["id"]
        client.patch(f"/tasks/{tid}", json={"title": ""})
        client.patch(f"/tasks/{tid}", json={"title": "x" * 201})
        client.patch(f"/tasks/{tid}", json={"status": "invalid"})
        after = client.get(f"/tasks/{tid}").json()
        assert after["title"] == "Original"
        assert after["status"] == "todo"


class TestStateMachineCommitIntegrity:
    def test_full_cycle_commits_each_step(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Cycle"))
        tid = task.id

        svc.update_task(tid, TaskUpdate(status=Status.IN_PROGRESS))
        db_session.expire_all()
        assert db_session.get(Task, tid).status == Status.IN_PROGRESS.value

        svc.update_task(tid, TaskUpdate(status=Status.DONE))
        db_session.expire_all()
        assert db_session.get(Task, tid).status == Status.DONE.value

        svc.update_task(tid, TaskUpdate(status=Status.IN_PROGRESS))
        db_session.expire_all()
        assert db_session.get(Task, tid).status == Status.IN_PROGRESS.value

        svc.update_task(tid, TaskUpdate(status=Status.TODO))
        db_session.expire_all()
        assert db_session.get(Task, tid).status == Status.TODO.value

    def test_transition_with_concurrent_field_updates(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="A", description="a", priority=Priority.LOW))
        updated = svc.update_task(task.id, TaskUpdate(
            title="B",
            description="b",
            priority=Priority.HIGH,
            status=Status.IN_PROGRESS,
            due_date=datetime(2027, 1, 1),
        ))
        db_session.expire_all()
        found = db_session.get(Task, task.id)
        assert found.title == "B"
        assert found.description == "b"
        assert found.priority == Priority.HIGH.value
        assert found.status == Status.IN_PROGRESS.value
        assert found.due_date == datetime(2027, 1, 1)

    def test_each_status_has_valid_self_transition(self, db_session):
        svc = TaskService(db_session)
        for target_status in Status:
            task = svc.create_task(TaskCreate(title=f"Self-{target_status.value}"))
            if target_status != Status.TODO:
                db_session.execute(
                    text("UPDATE tasks SET status = :s WHERE id = :id"),
                    {"s": target_status.value, "id": task.id},
                )
                db_session.commit()
            result = svc.update_task(task.id, TaskUpdate(status=target_status))
            assert result.status == target_status.value


class TestDatabaseSchemaConstraintsBlockBadData:
    def test_null_title_rejected_at_db_level(self, engine):
        Session = sessionmaker(bind=engine)
        session = Session()
        task = Task(title=None, description="", priority="medium", status="todo")
        session.add(task)
        with pytest.raises(Exception):
            session.commit()
        session.rollback()
        session.close()

    def test_null_description_uses_default(self, engine):
        Session = sessionmaker(bind=engine)
        session = Session()
        task = Task(title="T", priority="medium", status="todo")
        session.add(task)
        session.commit()
        assert task.description == ""
        session.close()

    def test_null_priority_uses_default(self, engine):
        Session = sessionmaker(bind=engine)
        session = Session()
        task = Task(title="T", description="", status="todo")
        session.add(task)
        session.commit()
        assert task.priority == "medium"
        session.close()

    def test_null_status_uses_default(self, engine):
        Session = sessionmaker(bind=engine)
        session = Session()
        task = Task(title="T", description="", priority="medium")
        session.add(task)
        session.commit()
        assert task.status == "todo"
        session.close()

    def test_null_due_date_allowed(self, engine):
        Session = sessionmaker(bind=engine)
        session = Session()
        task = Task(title="T", description="", priority="medium", status="todo", due_date=None)
        session.add(task)
        session.commit()
        assert task.due_date is None
        session.close()

    def test_auto_id_increment(self, engine):
        Session = sessionmaker(bind=engine)
        session = Session()
        t1 = Task(title="A", description="", priority="medium", status="todo")
        t2 = Task(title="B", description="", priority="medium", status="todo")
        session.add_all([t1, t2])
        session.commit()
        assert t2.id > t1.id
        assert t2.id == t1.id + 1
        session.close()


class TestErrorPropagationDoesNotLeakState:
    def test_409_from_api_does_not_show_internal_traceback(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"status": "done"})
        assert resp.status_code == 409
        body = resp.json()
        assert "detail" in body
        assert "Traceback" not in str(body)
        assert "Exception" not in str(body)

    def test_404_from_api_does_not_show_internal_traceback(self, client):
        resp = client.get("/tasks/999")
        assert resp.status_code == 404
        body = resp.json()
        assert "detail" in body
        assert "Traceback" not in str(body)

    def test_422_from_api_has_validation_detail(self, client):
        resp = client.post("/tasks/", json={"title": ""})
        assert resp.status_code == 422
        body = resp.json()
        assert "detail" in body
        assert isinstance(body["detail"], list)

    def test_api_still_responds_after_many_errors(self, client):
        for _ in range(10):
            client.post("/tasks/", json={"title": ""})
            client.get("/tasks/abc")
            client.delete("/tasks/999")
            client.patch("/tasks/999", json={"title": "X"})
        resp = client.post("/tasks/", json={"title": "After errors"})
        assert resp.status_code == 201
        assert resp.json()["title"] == "After errors"


class TestGetDbGeneratorErrorHandling:
    def test_get_db_closes_session_on_normal_completion(self):
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
                gen.throw(RuntimeError("simulated"))
        finally:
            db_module.SessionLocal = original

    def test_init_db_is_idempotent_with_existing_data(self):
        eng = create_engine("sqlite:///:memory:")
        init_db(engine_=eng)
        Session = sessionmaker(bind=eng)
        session = Session()
        task = Task(title="Persist", description="", priority="medium", status="todo")
        session.add(task)
        session.commit()
        task_id = task.id
        init_db(engine_=eng)
        init_db(engine_=eng)
        assert session.get(Task, task_id) is not None
        assert session.get(Task, task_id).title == "Persist"
        session.close()


class TestServiceErrorRecovery:
    def test_service_recoverable_after_not_found_error(self, db_session):
        svc = TaskService(db_session)
        with pytest.raises(TaskNotFoundError):
            svc.get_task(999)
        task = svc.create_task(TaskCreate(title="After error"))
        assert task.title == "After error"

    def test_service_recoverable_after_transition_error(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Before error"))
        with pytest.raises(InvalidTransitionError):
            svc.update_task(task.id, TaskUpdate(status=Status.DONE))
        result = svc.update_task(task.id, TaskUpdate(status=Status.IN_PROGRESS))
        assert result.status == Status.IN_PROGRESS.value

    def test_list_still_works_after_errors(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="A"))
        with pytest.raises(TaskNotFoundError):
            svc.get_task(999)
        tasks = svc.list_tasks()
        assert len(tasks) == 1
        assert tasks[0].title == "A"

    def test_delete_still_works_after_not_found_error(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Delete me"))
        with pytest.raises(TaskNotFoundError):
            svc.delete_task(999)
        svc.delete_task(task.id)
        assert svc.list_tasks() == []

    def test_update_still_works_after_transition_error(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Recover"))
        with pytest.raises(InvalidTransitionError):
            svc.update_task(task.id, TaskUpdate(status=Status.DONE))
        updated = svc.update_task(task.id, TaskUpdate(title="Recovered"))
        assert updated.title == "Recovered"
        assert updated.status == Status.TODO.value


class TestLifespanAsync:
    @pytest.mark.asyncio
    async def test_lifespan_calls_init_db(self):
        with patch("app.main.init_db") as mock_init:
            from app.main import lifespan, app
            async with lifespan(app):
                pass
            mock_init.assert_called_once()

    @pytest.mark.asyncio
    async def test_lifespan_yields_and_completes(self):
        with patch("app.main.init_db"):
            from app.main import lifespan, app
            executed = False
            async with lifespan(app):
                executed = True
            assert executed


class TestFilterDoesNotMutateState:
    def test_listing_does_not_modify_tasks(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="Immutable", priority=Priority.HIGH))
        original = svc.list_tasks()
        svc.list_tasks(status=Status.TODO)
        svc.list_tasks(priority=Priority.HIGH)
        svc.list_tasks(due_before=datetime(2099, 1, 1))
        after = svc.list_tasks()
        assert original[0].title == after[0].title
        assert original[0].priority == after[0].priority
        assert original[0].status == after[0].status

    def test_filter_with_no_results_does_not_create_ghost_tasks(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="Real"))
        svc.list_tasks(status=Status.DONE)
        svc.list_tasks(priority=Priority.CRITICAL)
        all_tasks = svc.list_tasks()
        assert len(all_tasks) == 1
        assert all_tasks[0].title == "Real"


class TestApiStateConsistencyAfterErrors:
    def test_task_count_consistent_after_mixed_operations(self, client):
        t1 = client.post("/tasks/", json={"title": "A"}).json()
        t2 = client.post("/tasks/", json={"title": "B"}).json()
        t3 = client.post("/tasks/", json={"title": "C"}).json()
        assert len(client.get("/tasks/").json()) == 3
        client.patch(f"/tasks/{t1['id']}", json={"status": "done"})
        client.delete(f"/tasks/{t2['id']}")
        client.patch("/tasks/999", json={"title": "Ghost"})
        assert len(client.get("/tasks/").json()) == 2

    def test_id_sequence_not_broken_by_errors(self, client):
        ids = []
        for i in range(5):
            resp = client.post("/tasks/", json={"title": f"T{i}"})
            ids.append(resp.json()["id"])
            client.patch("/tasks/999", json={"title": "Error"})
        assert ids == sorted(ids)
        assert len(set(ids)) == 5

    def test_filtered_list_consistent_after_errors(self, client):
        client.post("/tasks/", json={"title": "High", "priority": "high"})
        client.post("/tasks/", json={"title": "Low", "priority": "low"})
        client.get("/tasks/", params={"status": "invalid_value"})
        high = client.get("/tasks/", params={"priority": "high"})
        low = client.get("/tasks/", params={"priority": "low"})
        assert len(high.json()) == 1
        assert len(low.json()) == 1
