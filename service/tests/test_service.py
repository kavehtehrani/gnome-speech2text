import pytest

from gnome_speech2text_service.service import _get_cpu_thread_count


@pytest.mark.parametrize(
    ("configured", "available", "expected"),
    [
        (None, 16, 4),
        (None, 2, 2),
        ("12", 16, 12),
        ("32", 16, 16),
        ("0", 16, 1),
        ("invalid", 16, 4),
    ],
)
def test_get_cpu_thread_count(monkeypatch, configured, available, expected):
    if configured is None:
        monkeypatch.delenv("SPEECH2TEXT_CPU_THREADS", raising=False)
    else:
        monkeypatch.setenv("SPEECH2TEXT_CPU_THREADS", configured)
    monkeypatch.setattr("os.cpu_count", lambda: available)

    assert _get_cpu_thread_count() == expected
