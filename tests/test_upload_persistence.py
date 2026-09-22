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
    assert saved_path.startswith(os.path.join(main_module.DATA_DIR, TEST_SID))
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
