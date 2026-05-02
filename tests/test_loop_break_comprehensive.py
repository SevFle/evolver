import pytest
from datetime import datetime, timedelta, timezone
from sqlalchemy import create_engine, select, text, event
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db, init_db
from app.models import Priority, Status, Task, VALID_TRANSITIONS
from app.schemas import TaskCreate, TaskResponse, TaskUpdate
from app.services import InvalidTransitionError, TaskNotFoundError, TaskService


class TestConftestTransactionIsActiveGuard:
    def test_db_session_allows_commit_within_fixture(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Commit inside"))
        db_session.expire_all()
        assert db_session.get(Task, task.id) is not None

    def test_db_session_transaction_is_active_after_single_commit(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="One"))
        assert db_session.is_active

    def test_db_session_transaction_active_after_many_commits(self, db_session):
        svc = TaskService(db_session)
        for i in range(10):
            svc.create_task(TaskCreate(title=f"T{i}"))
        assert db_session.is_active

    def test_db_session_transaction_active_after_update_commit(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="V1"))
        svc.update_task(task.id, TaskUpdate(title="V2"))
        assert db_session.is_active

    def test_db_session_transaction_active_after_delete_commit(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Del"))
        svc.delete_task(task.id)
        assert db_session.is_active

    def test_db_session_rollback_guard_prevents_double_rollback(self, engine):
        connection = engine.connect()
        transaction = connection.begin()
        Session = sessionmaker(bind=connection)
        session = Session()
        session.close()
        assert transaction.is_active
        transaction.rollback()
        assert not transaction.is_active
        connection.close()

    def test_engine_fixture_creates_fresh_schema_each_test_a(self, engine):
        from sqlalchemy import inspect
        inspector = inspect(engine)
        assert "tasks" in inspector.get_table_names()
        Session = sessionmaker(bind=engine)
        s = Session()
        task = Task(title="Engine test", description="", priority="medium", status="todo")
        s.add(task)
        s.commit()
        assert len(list(s.scalars(select(Task)).all())) == 1
        s.close()

    def test_engine_fixture_creates_fresh_schema_each_test_b(self, engine):
        Session = sessionmaker(bind=engine)
        s = Session()
        assert len(list(s.scalars(select(Task)).all())) == 0
        s.close()

    def test_client_fixture_provides_clean_state_a(self, client):
        client.post("/tasks/", json={"title": "A"})
        assert len(client.get("/tasks/").json()) == 1

    def test_client_fixture_provides_clean_state_b(self, client):
        assert client.get("/tasks/").json() == []

    def test_client_fixture_provides_clean_state_c(self, client):
        resp = client.post("/tasks/", json={"title": "Fresh"})
        assert resp.status_code == 201
        assert resp.json()["id"] == 1


class TestStateMachineLoopBreaking:
    def test_cycle_terminates_in_finite_steps(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Cycle"))
        visited = set()
        status = Status.TODO
        max_steps = 100
        for step in range(max_steps):
            key = (task.id, status.value, step)
            assert key not in visited, f"Infinite loop detected at step {step}"
            visited.add(key)
            if status == Status.TODO:
                svc.update_task(task.id, TaskUpdate(status=Status.IN_PROGRESS))
                status = Status.IN_PROGRESS
            elif status == Status.IN_PROGRESS:
                svc.update_task(task.id, TaskUpdate(status=Status.DONE))
                status = Status.DONE
            elif status == Status.DONE:
                svc.update_task(task.id, TaskUpdate(status=Status.IN_PROGRESS))
                status = Status.IN_PROGRESS
                svc.update_task(task.id, TaskUpdate(status=Status.TODO))
                status = Status.TODO
            if step > 50:
                break

    def test_transition_graph_has_no_self_loops_except_identity(self):
        for source, targets in VALID_TRANSITIONS.items():
            assert source not in targets, f"Self-loop found: {source} -> {source}"

    def test_transition_graph_is_finite(self):
        assert len(VALID_TRANSITIONS) == len(Status)
        total_edges = sum(len(t) for t in VALID_TRANSITIONS.values())
        assert total_edges <= len(Status) * len(Status)

    def test_rapid_status_cycling_does_not_diverge(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Rapid cycle"))
        cycle = [
            Status.IN_PROGRESS,
            Status.DONE,
            Status.IN_PROGRESS,
            Status.TODO,
        ]
        for _ in range(20):
            for target in cycle:
                result = svc.update_task(task.id, TaskUpdate(status=target))
                assert result.status == target.value

    def test_bfs_reachability_terminates(self):
        visited = set()
        queue = [Status.TODO]
        steps = 0
        while queue and steps < 100:
            current = queue.pop(0)
            steps += 1
            if current in visited:
                continue
            visited.add(current)
            for target in VALID_TRANSITIONS.get(current, set()):
                if target not in visited:
                    queue.append(target)
        assert len(visited) == len(Status)

    def test_transition_closure_is_bounded(self):
        closure = set()
        for source in Status:
            frontier = {source}
            for _ in range(len(Status) + 1):
                next_frontier = set()
                for s in frontier:
                    for t in VALID_TRANSITIONS.get(s, set()):
                        if (s, t) not in closure:
                            closure.add((s, t))
                            next_frontier.add(t)
                    closure.add((s, s))
                frontier = next_frontier
                if not frontier:
                    break
        assert len(closure) <= len(Status) * (len(Status) + 1)


class TestServiceErrorRecoveryLoops:
    def test_repeated_not_found_errors_do_not_cascade(self, db_session):
        svc = TaskService(db_session)
        for i in range(20):
            with pytest.raises(TaskNotFoundError):
                svc.get_task(i + 1000)
        task = svc.create_task(TaskCreate(title="After errors"))
        assert task.title == "After errors"
        assert svc.get_task(task.id).title == "After errors"

    def test_repeated_transition_errors_do_not_lock_task(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Locked?"))
        for _ in range(15):
            with pytest.raises(InvalidTransitionError):
                svc.update_task(task.id, TaskUpdate(status=Status.DONE))
        result = svc.update_task(task.id, TaskUpdate(status=Status.IN_PROGRESS))
        assert result.status == Status.IN_PROGRESS.value

    def test_interleaved_errors_and_successes(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Interleaved"))
        operations = [
            (Status.IN_PROGRESS, True),
            (Status.DONE, True),
            (Status.TODO, False),
            (Status.DONE, True),
            (Status.IN_PROGRESS, True),
            (Status.TODO, True),
        ]
        for target_status, should_succeed in operations:
            if should_succeed:
                result = svc.update_task(task.id, TaskUpdate(status=target_status))
                assert result.status == target_status.value
            else:
                with pytest.raises(InvalidTransitionError):
                    svc.update_task(task.id, TaskUpdate(status=target_status))

    def test_delete_nonexistent_repeatedly_does_not_corrupt(self, db_session):
        svc = TaskService(db_session)
        t1 = svc.create_task(TaskCreate(title="Keep"))
        for _ in range(10):
            with pytest.raises(TaskNotFoundError):
                svc.delete_task(999)
        assert svc.get_task(t1.id).title == "Keep"
        assert len(svc.list_tasks()) == 1


class TestDatabaseSessionLifecycle:
    def test_multiple_services_on_same_session(self, db_session):
        services = [TaskService(db_session) for _ in range(5)]
        tasks = []
        for i, svc in enumerate(services):
            task = svc.create_task(TaskCreate(title=f"Svc{i}"))
            tasks.append(task)
        all_tasks = services[0].list_tasks()
        assert len(all_tasks) == 5

    def test_session_survives_many_operations(self, db_session):
        svc = TaskService(db_session)
        ids = []
        for i in range(50):
            task = svc.create_task(TaskCreate(title=f"T{i}"))
            ids.append(task.id)
        for i, tid in enumerate(ids):
            fetched = svc.get_task(tid)
            assert fetched.title == f"T{i}"
        svc.delete_task(ids[0])
        assert len(svc.list_tasks()) == 49

    def test_orm_objects_remain_valid_after_commit(self, db_session):
        svc = TaskService(db_session)
        t1 = svc.create_task(TaskCreate(title="V1"))
        original_id = t1.id
        t2 = svc.create_task(TaskCreate(title="V2"))
        assert t1.id == original_id
        assert t2.id != t1.id
        assert t1.title == "V1"

    def test_update_does_not_invalidate_other_orm_objects(self, db_session):
        svc = TaskService(db_session)
        t1 = svc.create_task(TaskCreate(title="A"))
        t2 = svc.create_task(TaskCreate(title="B"))
        svc.update_task(t1.id, TaskUpdate(title="A-updated"))
        assert t2.title == "B"

    def test_raw_sql_and_orm_coexist(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="ORM"))
        db_session.execute(
            text("UPDATE tasks SET title = 'SQL' WHERE title = 'ORM'")
        )
        db_session.commit()
        tasks = svc.list_tasks()
        assert len(tasks) == 1
        assert tasks[0].title == "SQL"


class TestParseDatetimeLoopBreaking:
    def test_parse_dt_date_only(self):
        from app.router import _parse_dt
        result = _parse_dt("2026-01-15")
        assert result == datetime(2026, 1, 15)

    def test_parse_dt_with_timezone(self):
        from app.router import _parse_dt
        result = _parse_dt("2026-01-15T12:00:00+00:00")
        assert result.year == 2026
        assert result.month == 1
        assert result.day == 15

    def test_parse_dt_with_microseconds(self):
        from app.router import _parse_dt
        result = _parse_dt("2026-01-15T12:30:00.123456")
        assert result.microsecond == 123456

    def test_parse_dt_none_returns_none(self):
        from app.router import _parse_dt
        assert _parse_dt(None) is None

    @pytest.mark.parametrize("invalid", [
        "2024-02-30",
        "2024-13-01",
        "not-a-date",
        "",
        "   ",
        "2024/01/01",
        "Jan 1, 2024",
        "2024-01-01T25:00:00",
    ])
    def test_parse_dt_invalid_raises_422(self, invalid):
        from fastapi import HTTPException
        from app.router import _parse_dt
        with pytest.raises(HTTPException) as exc_info:
            _parse_dt(invalid)
        assert exc_info.value.status_code == 422

    def test_parse_dt_various_valid_formats(self):
        from app.router import _parse_dt
        cases = [
            ("2026-01-01", datetime(2026, 1, 1)),
            ("2026-12-31T23:59:59", datetime(2026, 12, 31, 23, 59, 59)),
            ("2026-06-15T12:00:00.000000", datetime(2026, 6, 15, 12, 0, 0)),
        ]
        for input_str, expected in cases:
            result = _parse_dt(input_str)
            assert result.year == expected.year
            assert result.month == expected.month
            assert result.day == expected.day


class TestApiStressAndBounds:
    def test_create_many_tasks_all_accessible(self, client):
        ids = []
        for i in range(30):
            resp = client.post("/tasks/", json={"title": f"Task-{i}"})
            assert resp.status_code == 201
            ids.append(resp.json()["id"])
        all_tasks = client.get("/tasks/").json()
        assert len(all_tasks) == 30
        fetched_ids = {t["id"] for t in all_tasks}
        assert fetched_ids == set(ids)

    def test_update_single_task_rapidly(self, client):
        t = client.post("/tasks/", json={"title": "V0"}).json()
        tid = t["id"]
        for i in range(1, 21):
            resp = client.patch(f"/tasks/{tid}", json={"title": f"V{i}"})
            assert resp.status_code == 200
            assert resp.json()["title"] == f"V{i}"
        final = client.get(f"/tasks/{tid}").json()
        assert final["title"] == "V20"

    def test_rapid_create_delete_cycle(self, client):
        for _ in range(10):
            resp = client.post("/tasks/", json={"title": "Ephemeral"})
            tid = resp.json()["id"]
            del_resp = client.delete(f"/tasks/{tid}")
            assert del_resp.status_code == 204
        assert client.get("/tasks/").json() == []

    def test_all_priorities_roundtrip(self, client):
        for p in Priority:
            resp = client.post("/tasks/", json={
                "title": f"P-{p.value}",
                "priority": p.value,
            })
            assert resp.status_code == 201
            assert resp.json()["priority"] == p.value

    def test_task_id_never_reused_after_delete(self, client):
        ids = []
        for i in range(5):
            resp = client.post("/tasks/", json={"title": f"T{i}"})
            ids.append(resp.json()["id"])
        client.delete(f"/tasks/{ids[2]}")
        new_resp = client.post("/tasks/", json={"title": "New"})
        new_id = new_resp.json()["id"]
        assert new_id not in ids[:2]
        assert new_id not in ids[3:]
        assert new_id > ids[-1]

    def test_status_transition_full_cycle_via_api(self, client):
        t = client.post("/tasks/", json={"title": "Cycle"}).json()
        tid = t["id"]
        transitions = [
            ("in_progress", 200),
            ("done", 200),
            ("in_progress", 200),
            ("todo", 200),
        ]
        for status, expected_code in transitions:
            resp = client.patch(f"/tasks/{tid}", json={"status": status})
            assert resp.status_code == expected_code
            assert resp.json()["status"] == status

    def test_invalid_transition_returns_409_with_detail(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"status": "done"})
        assert resp.status_code == 409
        assert "detail" in resp.json()
        assert "Cannot transition" in resp.json()["detail"]


class TestSchemaValidationEdgeCases:
    def test_title_single_char_accepted(self):
        t = TaskCreate(title="A")
        assert t.title == "A"

    def test_title_exactly_200_chars(self):
        t = TaskCreate(title="X" * 200)
        assert len(t.title) == 200

    def test_title_201_chars_rejected(self):
        with pytest.raises(ValueError):
            TaskCreate(title="X" * 201)

    def test_title_zero_chars_rejected(self):
        with pytest.raises(ValueError):
            TaskCreate(title="")

    def test_title_whitespace_only_rejected(self):
        with pytest.raises(ValueError):
            TaskCreate(title="   \t\n   ")

    def test_title_with_unicode_accepted(self):
        t = TaskCreate(title="Task with unicode chars")
        assert t.title == "Task with unicode chars"

    def test_description_empty_string_accepted(self):
        t = TaskCreate(title="T", description="")
        assert t.description == ""

    def test_description_exactly_2000_chars(self):
        t = TaskCreate(title="T", description="D" * 2000)
        assert len(t.description) == 2000

    def test_description_2001_chars_rejected(self):
        with pytest.raises(ValueError):
            TaskCreate(title="T", description="D" * 2001)

    def test_update_title_none_vs_unset(self):
        explicit = TaskUpdate(title=None)
        assert "title" in explicit.model_dump(exclude_unset=True)
        assert explicit.model_dump(exclude_unset=True)["title"] is None

        default = TaskUpdate()
        assert "title" not in default.model_dump(exclude_unset=True)

    def test_update_all_fields_set(self):
        u = TaskUpdate(
            title="New",
            description="New desc",
            priority=Priority.HIGH,
            status=Status.IN_PROGRESS,
            due_date=datetime(2027, 1, 1),
        )
        dumped = u.model_dump(exclude_unset=True)
        assert len(dumped) == 5

    def test_update_no_fields_set(self):
        u = TaskUpdate()
        assert u.model_dump(exclude_unset=True) == {}

    def test_task_response_has_8_fields(self):
        assert len(TaskResponse.model_fields) == 8

    def test_task_response_from_attributes(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(
            title="RT",
            description="desc",
            priority=Priority.CRITICAL,
            due_date=datetime(2027, 6, 15),
        ))
        resp = TaskResponse.model_validate(task)
        assert resp.id == task.id
        assert resp.title == "RT"
        assert resp.description == "desc"
        assert resp.priority == "critical"
        assert resp.status == "todo"
        assert resp.due_date == datetime(2027, 6, 15)


class TestFilterEdgeCases:
    def test_due_before_with_tasks_having_no_due_date(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="No due"))
        svc.create_task(TaskCreate(title="Has due", due_date=datetime(2025, 1, 1)))
        result = svc.list_tasks(due_before=datetime(2026, 1, 1))
        assert len(result) == 1
        assert result[0].title == "Has due"

    def test_due_before_inclusive_boundary(self, db_session):
        svc = TaskService(db_session)
        boundary = datetime(2026, 6, 15, 12, 0, 0)
        svc.create_task(TaskCreate(title="Exact", due_date=boundary))
        svc.create_task(TaskCreate(title="1s after", due_date=boundary + timedelta(seconds=1)))
        svc.create_task(TaskCreate(title="1s before", due_date=boundary - timedelta(seconds=1)))
        result = svc.list_tasks(due_before=boundary)
        titles = {t.title for t in result}
        assert "Exact" in titles
        assert "1s before" in titles
        assert "1s after" not in titles

    def test_all_filters_combined_empty_result(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="A", priority=Priority.HIGH, due_date=datetime(2099, 1, 1)))
        result = svc.list_tasks(
            status=Status.TODO,
            priority=Priority.LOW,
            due_before=datetime(2020, 1, 1),
        )
        assert result == []

    def test_all_filters_combined_with_match(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(
            title="Match",
            priority=Priority.HIGH,
            due_date=datetime(2025, 6, 1),
        ))
        svc.create_task(TaskCreate(
            title="Wrong priority",
            priority=Priority.LOW,
            due_date=datetime(2025, 6, 1),
        ))
        result = svc.list_tasks(
            status=Status.TODO,
            priority=Priority.HIGH,
            due_before=datetime(2026, 1, 1),
        )
        assert len(result) == 1
        assert result[0].title == "Match"

    def test_list_ordered_newest_first(self, db_session):
        svc = TaskService(db_session)
        t1 = svc.create_task(TaskCreate(title="First"))
        t2 = svc.create_task(TaskCreate(title="Second"))
        t3 = svc.create_task(TaskCreate(title="Third"))
        db_session.execute(
            text("UPDATE tasks SET created_at = '2026-01-01 00:00:01' WHERE id = :id"),
            {"id": t1.id},
        )
        db_session.execute(
            text("UPDATE tasks SET created_at = '2026-01-01 00:00:02' WHERE id = :id"),
            {"id": t2.id},
        )
        db_session.execute(
            text("UPDATE tasks SET created_at = '2026-01-01 00:00:03' WHERE id = :id"),
            {"id": t3.id},
        )
        db_session.commit()
        tasks = svc.list_tasks()
        titles = [t.title for t in tasks]
        assert titles == ["Third", "Second", "First"]

    def test_filter_does_not_mutate_data(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="A", priority=Priority.HIGH))
        svc.create_task(TaskCreate(title="B", priority=Priority.LOW))
        before_titles = sorted(t.title for t in svc.list_tasks())
        svc.list_tasks(priority=Priority.HIGH)
        svc.list_tasks(status=Status.TODO)
        after_titles = sorted(t.title for t in svc.list_tasks())
        assert before_titles == after_titles


class TestModelStateConsistency:
    def test_task_default_values(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Defaults"))
        assert task.status == "todo"
        assert task.priority == "medium"
        assert task.description == ""
        assert task.due_date is None
        assert task.created_at is not None
        assert task.updated_at is not None

    def test_created_at_type_is_datetime(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        assert isinstance(task.created_at, datetime)
        assert isinstance(task.updated_at, datetime)

    def test_priority_enum_str(self):
        assert issubclass(Priority, str)
        assert Priority.HIGH == "high"

    def test_status_enum_str(self):
        assert issubclass(Status, str)
        assert Status.TODO == "todo"

    def test_valid_transitions_keys_match_status(self):
        assert set(VALID_TRANSITIONS.keys()) == set(Status)

    def test_valid_transitions_values_are_status_sets(self):
        for targets in VALID_TRANSITIONS.values():
            assert isinstance(targets, set)
            for t in targets:
                assert isinstance(t, Status)


class TestApiErrorRecovery:
    def test_api_still_works_after_many_422s(self, client):
        for _ in range(10):
            client.post("/tasks/", json={"title": ""})
            client.post("/tasks/", json={"title": "x" * 201})
            client.post("/tasks/", json={"title": "ok", "priority": "bad"})
        resp = client.post("/tasks/", json={"title": "Clean"})
        assert resp.status_code == 201
        assert resp.json()["title"] == "Clean"

    def test_api_still_works_after_many_404s(self, client):
        for _ in range(10):
            client.get("/tasks/999")
            client.delete("/tasks/999")
            client.patch("/tasks/999", json={"title": "X"})
        resp = client.post("/tasks/", json={"title": "After 404s"})
        assert resp.status_code == 201

    def test_api_still_works_after_many_409s(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        for _ in range(10):
            client.patch(f"/tasks/{t['id']}", json={"status": "done"})
        resp = client.patch(f"/tasks/{t['id']}", json={"status": "in_progress"})
        assert resp.status_code == 200
        assert resp.json()["status"] == "in_progress"

    def test_422_does_not_create_partial_task(self, client):
        client.post("/tasks/", json={"title": ""})
        client.post("/tasks/", json={})
        client.post("/tasks/", json={"title": "ok", "priority": "invalid"})
        assert client.get("/tasks/").json() == []

    def test_409_does_not_modify_task(self, client):
        t = client.post("/tasks/", json={
            "title": "Original",
            "description": "Desc",
            "priority": "high",
        }).json()
        client.patch(f"/tasks/{t['id']}", json={
            "title": "Changed",
            "status": "done",
        })
        after = client.get(f"/tasks/{t['id']}").json()
        assert after["title"] == "Original"
        assert after["status"] == "todo"

    def test_mixed_error_types_then_success(self, client):
        client.post("/tasks/", json={"title": ""})
        client.get("/tasks/999")
        t = client.post("/tasks/", json={"title": "Valid"}).json()
        client.patch(f"/tasks/{t['id']}", json={"status": "done"})
        client.delete("/tasks/999")
        resp = client.post("/tasks/", json={"title": "Final"})
        assert resp.status_code == 201


class TestDatabaseRobustness:
    def test_init_db_idempotent(self):
        eng = create_engine("sqlite:///:memory:")
        for _ in range(5):
            init_db(engine_=eng)
        from sqlalchemy import inspect
        assert "tasks" in inspect(eng).get_table_names()

    def test_init_db_preserves_existing_data(self):
        eng = create_engine("sqlite:///:memory:")
        init_db(engine_=eng)
        Session = sessionmaker(bind=eng)
        s = Session()
        task = Task(title="Keep", description="", priority="medium", status="todo")
        s.add(task)
        s.commit()
        task_id = task.id
        init_db(engine_=eng)
        assert s.get(Task, task_id).title == "Keep"
        s.close()

    def test_foreign_key_pragma_enabled(self, engine):
        Session = sessionmaker(bind=engine)
        s = Session()
        result = s.execute(text("PRAGMA foreign_keys")).scalar()
        assert result == 1
        s.close()

    def test_get_db_yields_functional_session(self):
        eng = create_engine("sqlite:///:memory:")
        init_db(engine_=eng)
        import app.database as db_module
        original = db_module.SessionLocal
        db_module.SessionLocal = sessionmaker(bind=eng)
        try:
            gen = get_db()
            session = next(gen)
            assert session is not None
            assert session.is_active
            try:
                next(gen)
            except StopIteration:
                pass
        finally:
            db_module.SessionLocal = original


class TestFullWorkflowIntegration:
    def test_crud_lifecycle_with_transitions(self, client):
        create = client.post("/tasks/", json={
            "title": "Bug fix",
            "description": "Fix the bug",
            "priority": "high",
            "due_date": "2026-12-31T00:00:00",
        })
        assert create.status_code == 201
        tid = create.json()["id"]

        client.patch(f"/tasks/{tid}", json={"status": "in_progress"})
        client.patch(f"/tasks/{tid}", json={
            "description": "Working on it",
            "priority": "critical",
        })

        resp = client.get(f"/tasks/{tid}")
        data = resp.json()
        assert data["status"] == "in_progress"
        assert data["description"] == "Working on it"
        assert data["priority"] == "critical"

        client.patch(f"/tasks/{tid}", json={"status": "done"})
        assert client.get(f"/tasks/{tid}").json()["status"] == "done"

        client.delete(f"/tasks/{tid}")
        assert client.get(f"/tasks/{tid}").status_code == 404

    def test_filter_interactions_with_transitions(self, client):
        t1 = client.post("/tasks/", json={"title": "A", "priority": "high"}).json()
        t2 = client.post("/tasks/", json={"title": "B", "priority": "low"}).json()

        client.patch(f"/tasks/{t1['id']}", json={"status": "in_progress"})
        client.patch(f"/tasks/{t2['id']}", json={"status": "in_progress"})
        client.patch(f"/tasks/{t2['id']}", json={"status": "done"})

        todo = client.get("/tasks/", params={"status": "todo"}).json()
        ip = client.get("/tasks/", params={"status": "in_progress"}).json()
        done = client.get("/tasks/", params={"status": "done"}).json()

        assert len(todo) == 0
        assert len(ip) == 1
        assert ip[0]["title"] == "A"
        assert len(done) == 1
        assert done[0]["title"] == "B"

    def test_update_idempotency_for_same_values(self, client):
        t = client.post("/tasks/", json={"title": "Same"}).json()
        for _ in range(5):
            resp = client.patch(f"/tasks/{t['id']}", json={"title": "Same"})
            assert resp.status_code == 200
            assert resp.json()["title"] == "Same"

    def test_reopen_and_close_workflow(self, client):
        t = client.post("/tasks/", json={"title": "Bug"}).json()
        tid = t["id"]

        client.patch(f"/tasks/{tid}", json={"status": "in_progress"})
        client.patch(f"/tasks/{tid}", json={"status": "done"})
        assert client.get(f"/tasks/{tid}").json()["status"] == "done"

        client.patch(f"/tasks/{tid}", json={"status": "in_progress"})
        client.patch(f"/tasks/{tid}", json={"status": "todo"})
        assert client.get(f"/tasks/{tid}").json()["status"] == "todo"

        client.patch(f"/tasks/{tid}", json={"status": "in_progress"})
        client.patch(f"/tasks/{tid}", json={"status": "done"})
        assert client.get(f"/tasks/{tid}").json()["status"] == "done"


class TestAppConfiguration:
    def test_openapi_schema_available(self, client):
        resp = client.get("/openapi.json")
        assert resp.status_code == 200
        schema = resp.json()
        assert "paths" in schema
        assert "/tasks/" in schema["paths"]

    def test_docs_available(self, client):
        assert client.get("/docs").status_code == 200

    def test_redoc_available(self, client):
        assert client.get("/redoc").status_code == 200

    def test_app_title_and_version(self, client):
        schema = client.get("/openapi.json").json()
        assert schema["info"]["title"] == "TaskPilot"
        assert schema["info"]["version"] == "0.1.0"
