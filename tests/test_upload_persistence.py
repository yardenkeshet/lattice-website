import io
import json
import os
import shutil

import main as main_module


TEST_SID = 'test-upload-sid'


def teardown_function(_):
    folder = os.path.join(main_module.DATA_DIR, TEST_SID)
    shutil.rmtree(folder, ignore_errors=True)


def test_save_original_upload_writes_exact_bytes():
    raw = b'a fake igs file, not real geometry'
    saved_path = main_module._save_original_upload(TEST_SID, 'part.igs', raw)

    assert os.path.exists(saved_path)
    with open(saved_path, 'rb') as f:
        assert f.read() == raw
    # saved_path is realpath()'d (Fix 1 — path-traversal hardening), so it is
    # an absolute path; assert it resolves inside the expected session dir
    # rather than doing a raw string prefix check against the relative
    # DATA_DIR-based path the pre-fix code returned.
    session_dir = os.path.realpath(os.path.join(main_module.DATA_DIR, TEST_SID))
    assert os.path.commonpath([session_dir, os.path.realpath(saved_path)]) == session_dir
    assert os.path.basename(saved_path).endswith('_part.igs')


def test_save_original_upload_does_not_collide_on_repeat_upload():
    raw1 = b'first upload'
    raw2 = b'second upload, same filename'

    path1 = main_module._save_original_upload(TEST_SID, 'part.igs', raw1)
    path2 = main_module._save_original_upload(TEST_SID, 'part.igs', raw2)

    assert path1 != path2
    with open(path1, 'rb') as f:
        assert f.read() == raw1
    with open(path2, 'rb') as f:
        assert f.read() == raw2


def test_save_original_upload_rejects_path_traversal_in_filename():
    raw = b'attacker bytes'
    saved_path = main_module._save_original_upload(TEST_SID, 'x/../../../evil.txt', raw)

    session_dir = os.path.realpath(os.path.join(main_module.DATA_DIR, TEST_SID))
    assert os.path.commonpath([session_dir, os.path.realpath(saved_path)]) == session_dir
    assert os.path.exists(saved_path)
    with open(saved_path, 'rb') as f:
        assert f.read() == raw


def test_log_calculation_rejects_forged_saved_input_paths(tmp_path):
    client = main_module.app.test_client()
    image = (io.BytesIO(b'fake png bytes'), 'snap.png')
    metadata = json.dumps({
        'filename': 'part.igs',
        'args': {},
        'saved_input_paths': ['/etc/passwd', 'C:\\Windows\\System32\\evil.dll', 'not_under_data_dir.txt'],
    })
    resp = client.post('/log-calculation', data={'image': image, 'metadata': metadata}, content_type='multipart/form-data')
    assert resp.status_code == 200
    # None of the forged paths should have been accepted (none start with DATA_DIR)
    assert main_module._validate_saved_input_paths(['/etc/passwd', 'evil']) == []
    assert main_module._validate_saved_input_paths([f'{main_module.DATA_DIR}/sid1/a.igs']) == [f'{main_module.DATA_DIR}/sid1/a.igs']
