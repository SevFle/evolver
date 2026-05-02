import os


GITIGNORE_PATH = os.path.join(os.path.dirname(__file__), "..", ".gitignore")


def _read_gitignore():
    with open(GITIGNORE_PATH) as f:
        return f.read().splitlines()


def test_gitignore_has_required_entries():
    lines = _read_gitignore()
    required = [
        "taskpilot.db",
        "__pycache__/",
        ".pytest_cache/",
        ".coverage",
        "*.egg-info/",
        ".venv/",
    ]
    for entry in required:
        assert entry in lines, f"Missing required .gitignore entry: {entry}"


def test_gitignore_does_not_use_wildcard_db():
    lines = _read_gitignore()
    assert "*.db" not in lines, "Wildcard *.db should be replaced with taskpilot.db"
