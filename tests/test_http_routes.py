"""Coverage for the backend HTTP routes that had zero tests before this
plan: /, /viewlog, /viewfulllog, /calc-log-image/<name>, /download-results.
Every other route and SocketIO handler already has coverage elsewhere in
this directory. /log-history and its read_log_history/_rotated_log_paths
helpers (the log viewer's history filter) are covered at the bottom."""
import json
import os
from datetime import datetime, timedelta

import main as main_module


def _log_line(ts, msg='hello', level='INFO'):
    return json.dumps({'ts': ts, 'level': level, 'msg': msg})


def test_index_is_a_health_check():
    client = main_module.app.test_client()
    resp = client.get('/')
    assert resp.status_code == 200
    assert resp.get_json() == {'service': 'lattice-backend', 'status': 'ok'}


def test_viewlog_renders_shared_script_with_surface_level_defaults():
    client = main_module.app.test_client()
    resp = client.get('/viewlog')
    assert resp.status_code == 200
    assert resp.content_type.startswith('text/html')
    body = resp.get_data(as_text=True)
    assert 'initLogViewer(' in body
    assert "defaultLevels: ['INFO', 'WARNING', 'ERROR']" in body


def test_viewfulllog_renders_shared_script_with_full_detail_defaults():
    client = main_module.app.test_client()
    resp = client.get('/viewfulllog')
    assert resp.status_code == 200
    body = resp.get_data(as_text=True)
    assert 'initLogViewer(' in body
    assert "defaultLevels: ['INFO', 'DEBUG', 'WARNING', 'ERROR']" in body


def test_calc_log_image_404s_for_missing_file():
    client = main_module.app.test_client()
    resp = client.get('/calc-log-image/does-not-exist.png')
    assert resp.status_code == 404


def test_calc_log_image_400s_for_non_png_name():
    # safe_name != name OR the extension check rejects this — a non-.png
    # name is the simplest, platform-independent way to exercise that
    # guard without relying on how a given OS's os.path.basename treats
    # path separators embedded in a URL segment.
    client = main_module.app.test_client()
    resp = client.get('/calc-log-image/notes.txt')
    assert resp.status_code == 400


def test_calc_log_image_400s_for_traversal_name():
    # The extension check alone wouldn't catch this: this exercises the
    # safe_name != name traversal guard itself. A backslash-encoded ".."
    # segment reaches the view (a forward-slash form gets rejected by
    # werkzeug's URL routing before the view ever runs) and os.path.basename
    # strips it down on Windows, making safe_name != name.
    client = main_module.app.test_client()
    resp = client.get('/calc-log-image/..%5Cfoo.png')
    assert resp.status_code == 400
    assert resp.get_json() == {'error': 'Invalid image name'}


def test_calc_log_image_serves_an_existing_png(monkeypatch, tmp_path):
    monkeypatch.setattr(main_module, 'CALC_LOG_IMAGES_DIR', str(tmp_path))
    name = 'sanity-test-image.png'
    path = os.path.join(str(tmp_path), name)
    png_bytes = b'\x89PNG\r\n\x1a\nnot a real png, just test bytes'
    with open(path, 'wb') as f:
        f.write(png_bytes)

    client = main_module.app.test_client()
    resp = client.get(f'/calc-log-image/{name}')
    assert resp.status_code == 200
    assert resp.content_type == 'image/png'
    assert resp.get_data() == png_bytes


def test_download_results_get_is_405():
    client = main_module.app.test_client()
    resp = client.get('/download-results')
    assert resp.status_code == 405


def test_download_results_invalid_token_is_404():
    client = main_module.app.test_client()
    resp = client.post('/download-results', data={'token': 'not-a-real-token', 'file_type': 'obj'})
    assert resp.status_code == 404


def test_download_results_happy_path(monkeypatch, tmp_path):
    token = 'sanity-test-token'
    out_folder = tmp_path / token
    out_folder.mkdir()
    obj_path = out_folder / 'result.obj'
    obj_path.write_bytes(b'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n')

    # os.path.join(os.getcwd(), LAST_RESULTS_DIR, token) resets to the
    # absolute tmp_path once LAST_RESULTS_DIR itself is absolute — this is
    # documented os.path.join behavior (a later absolute component discards
    # everything before it), so this monkeypatch correctly redirects the
    # route to tmp_path without needing to also patch os.getcwd().
    monkeypatch.setattr(main_module, 'LAST_RESULTS_DIR', str(tmp_path))
    monkeypatch.setitem(main_module.DOWNLOAD_CACHE, token, {
        'sid': 'sanity-sid', 'out_obj': 'result.obj', 'out_igs': 'result.igs',
    })

    client = main_module.app.test_client()
    resp = client.post('/download-results', data={'token': token, 'file_type': 'obj'})
    assert resp.status_code == 200
    assert resp.mimetype == 'model/obj'
    assert resp.get_data(as_text=True) == 'v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n'
    assert 'result.obj' in resp.headers['Content-Disposition']


def test_download_results_unknown_file_type_is_400(monkeypatch, tmp_path):
    token = 'sanity-test-token-2'
    monkeypatch.setattr(main_module, 'LAST_RESULTS_DIR', str(tmp_path))
    monkeypatch.setitem(main_module.DOWNLOAD_CACHE, token, {
        'sid': 'sanity-sid', 'out_obj': 'result.obj', 'out_igs': 'result.igs',
    })

    client = main_module.app.test_client()
    resp = client.post('/download-results', data={'token': token, 'file_type': 'step'})
    assert resp.status_code == 400


def test_download_results_rejects_stl(monkeypatch, tmp_path):
    """The DLL no longer produces STL — 'stl' is not a valid download type."""
    token = 'sanity-test-token-3'
    monkeypatch.setattr(main_module, 'LAST_RESULTS_DIR', str(tmp_path))
    monkeypatch.setitem(main_module.DOWNLOAD_CACHE, token, {
        'sid': 'sanity-sid', 'out_obj': 'result.obj', 'out_igs': 'result.igs',
    })

    client = main_module.app.test_client()
    resp = client.post('/download-results', data={'token': token, 'file_type': 'stl'})
    assert resp.status_code == 400


# ─── /log-history and its helpers ───

def _ts(dt):
    return dt.strftime('%Y-%m-%d %H:%M:%S,%f')[:-3]


def test_rotated_log_paths_orders_oldest_backup_first(tmp_path):
    base = tmp_path / 'app.log'
    base.write_text('current\n')
    (tmp_path / 'app.log.1').write_text('newest backup\n')
    (tmp_path / 'app.log.2').write_text('older backup\n')
    (tmp_path / 'app.log.3').write_text('oldest backup\n')

    paths = main_module._rotated_log_paths(str(base))

    assert paths == [
        str(tmp_path / 'app.log.3'),
        str(tmp_path / 'app.log.2'),
        str(tmp_path / 'app.log.1'),
        str(base),
    ]


def test_rotated_log_paths_with_no_backups_is_just_the_base_file(tmp_path):
    base = tmp_path / 'calc.jsonl'
    base.write_text('one line\n')
    assert main_module._rotated_log_paths(str(base)) == [str(base)]


def test_rotated_log_paths_missing_file_is_empty(tmp_path):
    assert main_module._rotated_log_paths(str(tmp_path / 'does-not-exist.log')) == []


def test_read_log_history_reads_backups_oldest_to_newest(tmp_path):
    base = tmp_path / 'app.log'
    now = datetime.now()
    base.write_text(_log_line(_ts(now), 'from current') + '\n')
    (tmp_path / 'app.log.1').write_text(_log_line(_ts(now - timedelta(minutes=1)), 'from .1') + '\n')

    lines = main_module.read_log_history(str(base))

    assert [json.loads(l)['msg'] for l in lines] == ['from .1', 'from current']


def test_read_log_history_since_seconds_excludes_older_lines(tmp_path):
    base = tmp_path / 'app.log'
    now = datetime.now()
    old = _log_line(_ts(now - timedelta(hours=2)), 'old')
    recent = _log_line(_ts(now - timedelta(seconds=5)), 'recent')
    base.write_text(old + '\n' + recent + '\n')

    lines = main_module.read_log_history(str(base), since_seconds=3600)

    assert [json.loads(l)['msg'] for l in lines] == ['recent']


def test_read_log_history_since_none_returns_everything(tmp_path):
    base = tmp_path / 'app.log'
    now = datetime.now()
    base.write_text(
        _log_line(_ts(now - timedelta(days=30)), 'ancient') + '\n'
        + _log_line(_ts(now), 'fresh') + '\n'
    )

    lines = main_module.read_log_history(str(base), since_seconds=None)

    assert [json.loads(l)['msg'] for l in lines] == ['ancient', 'fresh']


def test_read_log_history_caps_to_the_most_recent_lines(tmp_path):
    base = tmp_path / 'app.log'
    now = datetime.now()
    content = ''.join(
        _log_line(_ts(now - timedelta(seconds=10 - i)), f'line{i}') + '\n' for i in range(10)
    )
    base.write_text(content)

    lines = main_module.read_log_history(str(base), limit=3)

    assert [json.loads(l)['msg'] for l in lines] == ['line7', 'line8', 'line9']


def test_read_log_history_missing_file_is_empty(tmp_path):
    assert main_module.read_log_history(str(tmp_path / 'nope.log')) == []


def test_log_history_unknown_file_is_400():
    client = main_module.app.test_client()
    resp = client.get('/log-history?file=bogus')
    assert resp.status_code == 400


def test_log_history_invalid_since_is_400():
    client = main_module.app.test_client()
    resp = client.get('/log-history?file=main&since=not-a-number')
    assert resp.status_code == 400


def test_log_history_non_positive_since_is_400():
    client = main_module.app.test_client()
    resp = client.get('/log-history?file=main&since=0')
    assert resp.status_code == 400


def test_log_history_returns_lines_for_main(monkeypatch, tmp_path):
    base = tmp_path / 'app.log'
    base.write_text(_log_line(_ts(datetime.now()), 'from main') + '\n')
    monkeypatch.setitem(main_module.LOG_HISTORY_FILES, 'main', str(base))

    client = main_module.app.test_client()
    resp = client.get('/log-history?file=main')
    assert resp.status_code == 200
    lines = resp.get_json()['lines']
    assert [json.loads(l)['msg'] for l in lines] == ['from main']


def test_log_history_returns_lines_for_calc(monkeypatch, tmp_path):
    base = tmp_path / 'calc.jsonl'
    base.write_text(_log_line(_ts(datetime.now()), 'from calc') + '\n')
    monkeypatch.setitem(main_module.LOG_HISTORY_FILES, 'calc', str(base))

    client = main_module.app.test_client()
    resp = client.get('/log-history?file=calc')
    assert resp.status_code == 200
    lines = resp.get_json()['lines']
    assert [json.loads(l)['msg'] for l in lines] == ['from calc']


def test_log_history_since_all_is_the_same_as_omitting_since(monkeypatch, tmp_path):
    base = tmp_path / 'app.log'
    base.write_text(_log_line(_ts(datetime.now() - timedelta(days=10)), 'ancient') + '\n')
    monkeypatch.setitem(main_module.LOG_HISTORY_FILES, 'main', str(base))

    client = main_module.app.test_client()
    resp = client.get('/log-history?file=main&since=all')
    assert resp.status_code == 200
    lines = resp.get_json()['lines']
    assert [json.loads(l)['msg'] for l in lines] == ['ancient']
