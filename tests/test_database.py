import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db, init_db
from app.models import Task


class TestDatabaseInit:
    def test_init_db_creates_tables(self):
        eng = create_engine("sqlite:///:memory:")
        init_db(engine_=eng)
        inspector = inspect(eng)
        table_names = inspector.get_table_names()
        assert "tasks" in table_names

    def test_init_db_idempotent(self):
        eng = create_engine("sqlite:///:memory:")
        init_db(engine_=eng)
        init_db(engine_=eng)
        inspector = inspect(eng)
        assert "tasks" in inspector.get_table_names()

    def test_init_db_uses_provided_engine(self):
        eng = create_engine("sqlite:///:memory:")
        init_db(engine_=eng)
        with eng.connect() as conn:
            result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='tasks'"))
            assert result.fetchone() is not None


class TestGetDb:
    def test_get_db_yields_session(self):
        eng = create_engine("sqlite:///:memory:")
        init_db(engine_=eng)

        import app.database as db_module
        original_session_local = db_module.SessionLocal
        db_module.SessionLocal = sessionmaker(bind=eng)

        try:
            gen = get_db()
            session = next(gen)
            from sqlalchemy.orm import Session
            assert isinstance(session, Session)
        finally:
            db_module.SessionLocal = original_session_local
            try:
                next(gen)
            except StopIteration:
                pass

    def test_get_db_closes_session(self):
        eng = create_engine("sqlite:///:memory:")
        init_db(engine_=eng)

        import app.database as db_module
        original_session_local = db_module.SessionLocal
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
            db_module.SessionLocal = original_session_local


class TestTaskTableSchema:
    def test_task_table_has_expected_columns(self, engine):
        inspector = inspect(engine)
        columns = {col["name"] for col in inspector.get_columns("tasks")}
        expected = {"id", "title", "description", "priority", "status", "due_date", "created_at", "updated_at"}
        assert columns == expected

    def test_id_is_primary_key(self, engine):
        inspector = inspect(engine)
        pk = inspector.get_pk_constraint("tasks")
        assert "id" in pk["constrained_columns"]

    def test_title_not_nullable(self, engine):
        inspector = inspect(engine)
        cols = {col["name"]: col for col in inspector.get_columns("tasks")}
        assert cols["title"]["nullable"] is False

    def test_description_not_nullable(self, engine):
        inspector = inspect(engine)
        cols = {col["name"]: col for col in inspector.get_columns("tasks")}
        assert cols["description"]["nullable"] is False

    def test_due_date_nullable(self, engine):
        inspector = inspect(engine)
        cols = {col["name"]: col for col in inspector.get_columns("tasks")}
        assert cols["due_date"]["nullable"] is True

    def test_id_is_integer(self, engine):
        inspector = inspect(engine)
        cols = {col["name"]: col for col in inspector.get_columns("tasks")}
        assert cols["id"]["type"].python_type is int


class TestBase:
    def test_base_is_declarative(self):
        from sqlalchemy.orm import DeclarativeBase
        assert issubclass(Base, DeclarativeBase)

    def test_base_has_metadata(self):
        assert Base.metadata is not None
        assert "tasks" in Base.metadata.tables
