# Empty on purpose: its mere presence at the repo root makes pytest add this
# directory to sys.path (rootdir insertion via pytest's default "rootdir"
# import mode), so `from calc_queue import ...` in tests/ resolves whether
# pytest is invoked as `python -m pytest` or a bare `pytest tests/` from the
# repo root.
