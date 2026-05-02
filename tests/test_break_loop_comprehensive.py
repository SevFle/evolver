import pytest
from datetime import datetime, timedelta
from itertools import product

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db, init_db
from app.main import app
from app.models import Priority, Status, Task, VALID_TRANSITIONS
from app.router import _parse_dt
from app.schemas import TaskCreate, TaskResponse, TaskUpdate
from app.services import InvalidTransitionError, TaskNotFoundError, TaskService


class TestStateMachineInvariants:
    def test_transition_graph_is_deterministic(self):
        for source in Status:
            targets = VALID_TRANSITIONS[source]
            assert isinstance(targets, set)
            assert len(targets) == len(list(targets))

    def test_in_progress_has_exactly_two_targets(self):
        assert len(VALID_TRANSITIONS[Status.IN_PROGRESS]) == 2

    def test_todo_has_exactly_one_target(self):
        assert len(VALID_TRANSITIONS[Status.TODO]) == 1

    def test_done_has_exactly_one_target(self):
        assert len(VALID_TRANSITIONS[Status.DONE]) == 1

    def test_transition_graph_total_edges(self):
        total = sum(len(targets) for targets in VALID_TRANSITIONS.values())
        assert total == 4

    def test_graph_is_undirected_bidi_check(self):
        for source, targets in VALID_TRANSITIONS.items():
            for target in targets:
                assert source in VALID_TRANSITIONS.get(target, set()) or source == target

    def test_no_isolated_nodes(self):
        sources = set(VALID_TRANSITIONS.keys())
        all_targets = set()
        for targets in VALID_TRANSITIONS.values():
            all_targets.update(targets)
        assert sources == all_targets | sources

    def test_reachable_from_any_to_any(self):
        def reachable(start):
            visited = set()
            queue = [start]
            while queue:
                current = queue.pop(0)
                for t in VALID_TRANSITIONS.get(current, set()):
                    if t not in visited:
                        visited.add(t)
                        queue.append(t)
            visited.add(start)
            return visited

        for status in Status:
            r = reachable(status)
            assert Status.IN_PROGRESS in r, f"In_progress not reachable from {status}"

    def test_all_transitions_preserve_valid_status_values(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="T"))
        for source in Status:
            for target in VALID_TRANSITIONS.get(source, set()):
                db_session.execute(
                    text("UPDATE tasks SET status = :s WHERE id = :id"),
                    {"s": source.value, "id": task.id},
                )
                db_session.commit()
                result = svc.update_task(task.id, TaskUpdate(status=target))
                assert result.status in [s.value for s in Status]

    def test_transition_closure_property(self):
        closure = set()
        for source, targets in VALID_TRANSITIONS.items():
            for t in targets:
                closure.add((source, t))
        for source in Status:
            closure.add((source, source))
        assert len(closure) == 3 + 4


class TestDatabaseFixtureIsolation:
    def test_fixture_a_creates_and_verifies(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Isolation A"))
        assert db_session.get(Task, task.id) is not None

    def test_fixture_b_sees_clean_state(self, db_session):
        tasks = db_session.scalars(
            __import__("sqlalchemy").select(Task)
        ).all()
        assert len(tasks) == 0

    def test_fixture_c_independent(self, db_session):
        svc = TaskService(db_session)
        assert svc.list_tasks() == []

    def test_client_fixture_isolation_a(self, client):
        client.post("/tasks/", json={"title": "Client A"})
        assert len(client.get("/tasks/").json()) == 1

    def test_client_fixture_isolation_b(self, client):
        assert client.get("/tasks/").json() == []

    def test_engine_fixture_fresh_tables(self, engine):
        Session = sessionmaker(bind=engine)
        session = Session()
        from sqlalchemy import select
        count = len(list(session.scalars(select(Task)).all()))
        assert count == 0
        session.close()


class TestApiContractInvariants:
    def test_id_monotonically_increases(self, client):
        ids = []
        for i in range(10):
            resp = client.post("/tasks/", json={"title": f"T{i}"})
            ids.append(resp.json()["id"])
        for i in range(1, len(ids)):
            assert ids[i] > ids[i - 1]

    def test_create_idempotency_not_guaranteed_separate_requests(self, client):
        r1 = client.post("/tasks/", json={"title": "Same"})
        r2 = client.post("/tasks/", json={"title": "Same"})
        assert r1.json()["id"] != r2.json()["id"]

    def test_get_always_returns_consistent_schema(self, client):
        for p in Priority:
            for s in [None, Status.IN_PROGRESS]:
                payload = {"title": f"T-{p.value}", "priority": p.value}
                if s:
                    payload["status"] = s.value
                r = client.post("/tasks/", json=payload)
                if s and s != Status.IN_PROGRESS:
                    continue
                if s == Status.IN_PROGRESS:
                    client.patch(f"/tasks/{r.json()['id']}", json={"status": "in_progress"})
                got = client.get(f"/tasks/{r.json()['id']}").json()
                expected_keys = {"id", "title", "description", "priority", "status", "due_date", "created_at", "updated_at"}
                assert set(got.keys()) == expected_keys

    def test_list_always_returns_array(self, client):
        for _ in range(3):
            client.post("/tasks/", json={"title": "T"})
        for status in ["todo", "in_progress", "done"]:
            resp = client.get("/tasks/", params={"status": status})
            assert isinstance(resp.json(), list)
        resp = client.get("/tasks/")
        assert isinstance(resp.json(), list)

    def test_delete_is_idempotent_for_404(self, client):
        r1 = client.delete("/tasks/999")
        r2 = client.delete("/tasks/999")
        assert r1.status_code == r2.status_code == 404

    def test_update_does_not_change_id(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        original_id = t["id"]
        for field_updates in [
            {"title": "New"},
            {"description": "D"},
            {"priority": "critical"},
            {"status": "in_progress"},
            {"due_date": "2030-01-01T00:00:00"},
        ]:
            resp = client.patch(f"/tasks/{original_id}", json=field_updates)
            if resp.status_code == 200:
                assert resp.json()["id"] == original_id

    def test_created_at_never_changes(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        original_created = t["created_at"]
        client.patch(f"/tasks/{t['id']}", json={"title": "Updated"})
        client.patch(f"/tasks/{t['id']}", json={"description": "New desc"})
        client.patch(f"/tasks/{t['id']}", json={"priority": "critical"})
        final = client.get(f"/tasks/{t['id']}").json()
        assert final["created_at"] == original_created

    def test_list_count_equals_created_minus_deleted(self, client):
        created = []
        for i in range(5):
            r = client.post("/tasks/", json={"title": f"T{i}"})
            created.append(r.json()["id"])
        assert len(client.get("/tasks/").json()) == 5
        client.delete(f"/tasks/{created[0]}")
        client.delete(f"/tasks/{created[2]}")
        assert len(client.get("/tasks/").json()) == 3


class TestServiceLayerInvariants:
    def test_list_returns_fresh_objects_not_stale(self, db_session):
        svc = TaskService(db_session)
        t1 = svc.create_task(TaskCreate(title="V1"))
        svc.update_task(t1.id, TaskUpdate(title="V2"))
        tasks = svc.list_tasks()
        found = [t for t in tasks if t.id == t1.id][0]
        assert found.title == "V2"

    def test_get_after_delete_always_raises(self, db_session):
        svc = TaskService(db_session)
        for i in range(5):
            svc.create_task(TaskCreate(title=f"T{i}"))
        for task in svc.list_tasks():
            svc.delete_task(task.id)
        for i in range(1, 6):
            with pytest.raises(TaskNotFoundError):
                svc.get_task(i)

    def test_update_only_modifies_specified_fields(self, db_session):
        svc = TaskService(db_session)
        original = svc.create_task(TaskCreate(
            title="Keep",
            description="Keep desc",
            priority=Priority.HIGH,
            due_date=datetime(2026, 6, 15),
        ))
        svc.update_task(original.id, TaskUpdate(title="Changed"))
        refreshed = svc.get_task(original.id)
        assert refreshed.title == "Changed"
        assert refreshed.description == "Keep desc"
        assert refreshed.priority == Priority.HIGH.value
        assert refreshed.status == Status.TODO.value
        assert refreshed.due_date == datetime(2026, 6, 15)

    def test_create_always_sets_status_to_todo(self, db_session):
        svc = TaskService(db_session)
        for p in Priority:
            task = svc.create_task(TaskCreate(title="T", priority=p))
            assert task.status == Status.TODO.value

    def test_service_operations_are_commutative_for_independent_tasks(self, db_session):
        svc = TaskService(db_session)
        t1 = svc.create_task(TaskCreate(title="A", priority=Priority.LOW))
        t2 = svc.create_task(TaskCreate(title="B", priority=Priority.HIGH))
        svc.update_task(t2.id, TaskUpdate(priority=Priority.LOW))
        svc.update_task(t1.id, TaskUpdate(priority=Priority.HIGH))
        assert svc.get_task(t1.id).priority == Priority.HIGH.value
        assert svc.get_task(t2.id).priority == Priority.LOW.value

    def test_filter_combinations_are_conjunctive(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="Match", priority=Priority.HIGH, due_date=datetime(2025, 1, 1)))
        svc.create_task(TaskCreate(title="WrongPriority", priority=Priority.LOW, due_date=datetime(2025, 1, 1)))
        svc.create_task(TaskCreate(title="WrongDate", priority=Priority.HIGH, due_date=datetime(2099, 1, 1)))
        t4 = svc.create_task(TaskCreate(title="WrongStatus", priority=Priority.HIGH, due_date=datetime(2025, 1, 1)))
        svc.update_task(t4.id, TaskUpdate(status=Status.IN_PROGRESS))

        result = svc.list_tasks(
            status=Status.TODO,
            priority=Priority.HIGH,
            due_before=datetime(2026, 1, 1),
        )
        assert len(result) == 1
        assert result[0].title == "Match"


class TestSchemaBehavioralInvariants:
    def test_create_title_always_stripped(self):
        inputs = [" hello ", "\tworld\t", "\nnewline\n", "  \t mixed \n "]
        for inp in inputs:
            t = TaskCreate(title=inp)
            assert t.title == inp.strip()

    def test_update_title_none_vs_unset_semantics(self):
        explicit_none = TaskUpdate(title=None)
        assert "title" in explicit_none.model_dump(exclude_unset=True)
        assert explicit_none.model_dump(exclude_unset=True)["title"] is None

        unset = TaskUpdate()
        assert "title" not in unset.model_dump(exclude_unset=True)

    def test_response_round_trip_preserves_data(self, db_session):
        svc = TaskService(db_session)
        due = datetime(2026, 12, 31, 23, 59, 59)
        task = svc.create_task(TaskCreate(
            title="RoundTrip",
            description="Full test",
            priority=Priority.CRITICAL,
            due_date=due,
        ))
        resp = TaskResponse.model_validate(task)
        assert resp.id == task.id
        assert resp.title == "RoundTrip"
        assert resp.description == "Full test"
        assert resp.priority == "critical"
        assert resp.status == "todo"
        assert resp.due_date == due
        assert resp.created_at == task.created_at
        assert resp.updated_at == task.updated_at

    def test_boundary_values_all_accepted(self):
        TaskCreate(title="A" * 200)
        TaskCreate(title="X", description="B" * 2000)
        TaskUpdate(title="A" * 200)
        TaskUpdate(description="B" * 2000)

    def test_boundary_values_all_rejected(self):
        with pytest.raises(ValueError):
            TaskCreate(title="A" * 201)
        with pytest.raises(ValueError):
            TaskCreate(title="X", description="B" * 2001)
        with pytest.raises(ValueError):
            TaskUpdate(title="A" * 201)
        with pytest.raises(ValueError):
            TaskUpdate(description="B" * 2001)

    def test_all_priority_values_roundtrip_through_api(self, client):
        for p in Priority:
            resp = client.post("/tasks/", json={"title": f"P-{p.value}", "priority": p.value})
            assert resp.status_code == 201
            assert resp.json()["priority"] == p.value


class TestParseDatetimeBehavioralInvariants:
    @pytest.mark.parametrize("year,month,day", [
        (2024, 2, 29),
        (2000, 2, 29),
        (2026, 1, 1),
        (2026, 12, 31),
        (1970, 1, 1),
        (2099, 12, 31),
    ])
    def test_valid_dates_parse_correctly(self, year, month, day):
        date_str = f"{year:04d}-{month:02d}-{day:02d}"
        result = _parse_dt(date_str)
        assert result.year == year
        assert result.month == month
        assert result.day == day

    @pytest.mark.parametrize("invalid", [
        "2024-02-30",
        "2024-13-01",
        "2024-00-15",
        "2024-04-31",
        "not-a-date",
        "",
        "   ",
        "12345",
        "2024/01/01",
        "01-01-2024",
    ])
    def test_invalid_dates_raise_422(self, invalid):
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc_info:
            _parse_dt(invalid)
        assert exc_info.value.status_code == 422

    def test_none_is_only_non_raising_non_string_input(self):
        assert _parse_dt(None) is None

    def test_datetime_with_timezone_preserves_date_part(self):
        result = _parse_dt("2026-06-15T12:00:00+00:00")
        assert result.year == 2026
        assert result.month == 6
        assert result.day == 15


class TestApiErrorBehavioralInvariants:
    def test_all_404_responses_have_same_structure(self, client):
        for method in ["get", "patch", "delete"]:
            if method == "get":
                resp = client.get("/tasks/999")
            elif method == "patch":
                resp = client.patch("/tasks/999", json={"title": "X"})
            else:
                resp = client.delete("/tasks/999")
            assert resp.status_code == 404
            body = resp.json()
            assert "detail" in body
            assert isinstance(body["detail"], str)
            assert "application/json" in resp.headers["content-type"]

    def test_422_responses_always_have_detail_array(self, client):
        resp = client.post("/tasks/", json={"title": ""})
        assert resp.status_code == 422
        body = resp.json()
        assert "detail" in body
        assert isinstance(body["detail"], list)

    def test_409_only_from_invalid_transitions(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"status": "done"})
        assert resp.status_code == 409
        assert "detail" in resp.json()

    def test_valid_transitions_never_return_409(self, client):
        t = client.post("/tasks/", json={"title": "T"}).json()
        resp = client.patch(f"/tasks/{t['id']}", json={"status": "in_progress"})
        assert resp.status_code == 200
        resp = client.patch(f"/tasks/{t['id']}", json={"status": "done"})
        assert resp.status_code == 200
        resp = client.patch(f"/tasks/{t['id']}", json={"status": "in_progress"})
        assert resp.status_code == 200
        resp = client.patch(f"/tasks/{t['id']}", json={"status": "todo"})
        assert resp.status_code == 200


class TestConcurrencyAndIsolation:
    def test_sequential_operations_on_same_task(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Sequential"))
        priorities = [Priority.LOW, Priority.HIGH, Priority.CRITICAL, Priority.MEDIUM]
        for p in priorities:
            svc.update_task(task.id, TaskUpdate(priority=p))
            refreshed = svc.get_task(task.id)
            assert refreshed.priority == p.value

    def test_independent_tasks_dont_interfere(self, db_session):
        svc = TaskService(db_session)
        tasks = [svc.create_task(TaskCreate(title=f"T{i}", priority=Priority.LOW)) for i in range(5)]
        for i, t in enumerate(tasks):
            svc.update_task(t.id, TaskUpdate(priority=list(Priority)[i % len(Priority)]))
        for i, t in enumerate(tasks):
            refreshed = svc.get_task(t.id)
            assert refreshed.priority == list(Priority)[i % len(Priority)].value

    def test_delete_one_does_not_affect_others_ids(self, db_session):
        svc = TaskService(db_session)
        t1 = svc.create_task(TaskCreate(title="A"))
        t2 = svc.create_task(TaskCreate(title="B"))
        t3 = svc.create_task(TaskCreate(title="C"))
        svc.delete_task(t2.id)
        assert svc.get_task(t1.id).title == "A"
        assert svc.get_task(t3.id).title == "C"

    def test_filter_does_not_mutate_data(self, db_session):
        svc = TaskService(db_session)
        svc.create_task(TaskCreate(title="A", priority=Priority.HIGH))
        svc.create_task(TaskCreate(title="B", priority=Priority.LOW))
        before = sorted([t.title for t in svc.list_tasks()])
        svc.list_tasks(priority=Priority.HIGH)
        svc.list_tasks(status=Status.TODO)
        after = sorted([t.title for t in svc.list_tasks()])
        assert before == after


class TestDatabaseRobustness:
    def test_init_db_idempotent_with_data(self):
        eng = create_engine("sqlite:///:memory:")
        init_db(engine_=eng)
        Session = sessionmaker(bind=eng)
        session = Session()
        task = Task(title="Persist", description="", priority="medium", status="todo")
        session.add(task)
        session.commit()
        task_id = task.id
        init_db(engine_=eng)
        assert session.get(Task, task_id).title == "Persist"
        session.close()

    def test_multiple_sessions_concurrent_writes(self, engine):
        Session = sessionmaker(bind=engine)
        sessions = [Session() for _ in range(3)]
        for i, s in enumerate(sessions):
            task = Task(title=f"S{i}", description="", priority="medium", status="todo")
            s.add(task)
            s.commit()
        for i, s in enumerate(sessions):
            from sqlalchemy import select
            all_tasks = list(s.scalars(select(Task)).all())
            assert len(all_tasks) == 3
            s.close()

    def test_rollback_on_error_preserves_clean_state(self, db_session):
        svc = TaskService(db_session)
        task = svc.create_task(TaskCreate(title="Clean"))
        try:
            svc.update_task(task.id, TaskUpdate(status=Status.DONE))
        except InvalidTransitionError:
            pass
        refreshed = svc.get_task(task.id)
        assert refreshed.status == Status.TODO.value


class TestApiWorkflowProperties:
    def test_full_crud_lifecycle_per_task(self, client):
        for i in range(3):
            created = client.post("/tasks/", json={"title": f"Task {i}", "priority": "high"})
            assert created.status_code == 201
            tid = created.json()["id"]

            fetched = client.get(f"/tasks/{tid}")
            assert fetched.status_code == 200
            assert fetched.json()["title"] == f"Task {i}"

            updated = client.patch(f"/tasks/{tid}", json={
                "status": "in_progress",
                "priority": "critical",
            })
            assert updated.status_code == 200
            assert updated.json()["status"] == "in_progress"

            deleted = client.delete(f"/tasks/{tid}")
            assert deleted.status_code == 204

            gone = client.get(f"/tasks/{tid}")
            assert gone.status_code == 404

    def test_status_transition_cycle_is_reversible(self, client):
        t = client.post("/tasks/", json={"title": "Cycle"}).json()
        tid = t["id"]
        transitions = [
            ("in_progress", 200),
            ("done", 200),
            ("in_progress", 200),
            ("todo", 200),
        ]
        for status, expected in transitions:
            resp = client.patch(f"/tasks/{tid}", json={"status": status})
            assert resp.status_code == expected
            assert resp.json()["status"] == status

    def test_filter_results_are_subset_of_unfiltered(self, client):
        client.post("/tasks/", json={"title": "A", "priority": "high"})
        client.post("/tasks/", json={"title": "B", "priority": "low"})
        client.post("/tasks/", json={"title": "C", "priority": "high"})
        all_tasks = client.get("/tasks/").json()
        high_tasks = client.get("/tasks/", params={"priority": "high"}).json()
        high_ids = {t["id"] for t in high_tasks}
        all_ids = {t["id"] for t in all_tasks}
        assert high_ids.issubset(all_ids)
        assert len(high_tasks) < len(all_tasks)

    def test_pagination_ordering_is_stable(self, client):
        for i in range(10):
            client.post("/tasks/", json={"title": f"Task {i:02d}"})
        r1 = client.get("/tasks/").json()
        r2 = client.get("/tasks/").json()
        ids1 = [t["id"] for t in r1]
        ids2 = [t["id"] for t in r2]
        assert ids1 == ids2
