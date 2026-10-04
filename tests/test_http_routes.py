"""Coverage for the backend HTTP routes that had zero tests before this
plan: /, /viewlog, /viewfulllog, /calc-log-image/<name>, /download-results.
Every other route and SocketIO handler already has coverage elsewhere in
this directory."""
import os

import main as main_module


def test_index_returns_200():
    client = main_module.app.test_client()
    resp = client.get('/')
    assert resp.status_code == 200
    assert resp.content_type.startswith('text/html')


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
    resp = client.post('/download-results', data={'token': 'not-a-real-token', 'file_type': 'stl'})
    assert resp.status_code == 404


def test_download_results_happy_path(monkeypatch, tmp_path):
    token = 'sanity-test-token'
    out_folder = tmp_path / token
    out_folder.mkdir()
    stl_path = out_folder / 'result.stl'
    stl_path.write_bytes(b'solid sanity\nendsolid sanity\n')

    # os.path.join(os.getcwd(), LAST_RESULTS_DIR, token) resets to the
    # absolute tmp_path once LAST_RESULTS_DIR itself is absolute — this is
    # documented os.path.join behavior (a later absolute component discards
    # everything before it), so this monkeypatch correctly redirects the
    # route to tmp_path without needing to also patch os.getcwd().
    monkeypatch.setattr(main_module, 'LAST_RESULTS_DIR', str(tmp_path))
    monkeypatch.setitem(main_module.DOWNLOAD_CACHE, token, {
        'sid': 'sanity-sid', 'out_stl': 'result.stl', 'out_igs': 'result.igs',
    })

    client = main_module.app.test_client()
    resp = client.post('/download-results', data={'token': token, 'file_type': 'stl'})
    assert resp.status_code == 200
    assert resp.mimetype == 'model/stl'
    assert resp.get_data(as_text=True) == 'solid sanity\nendsolid sanity\n'


def test_download_results_unknown_file_type_is_400(monkeypatch, tmp_path):
    token = 'sanity-test-token-2'
    monkeypatch.setattr(main_module, 'LAST_RESULTS_DIR', str(tmp_path))
    monkeypatch.setitem(main_module.DOWNLOAD_CACHE, token, {
        'sid': 'sanity-sid', 'out_stl': 'result.stl', 'out_igs': 'result.igs',
    })

    client = main_module.app.test_client()
    resp = client.post('/download-results', data={'token': token, 'file_type': 'obj'})
    assert resp.status_code == 400
