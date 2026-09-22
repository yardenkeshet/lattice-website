import json
import logging

import main as main_module


def test_log_extra_includes_user_agent():
    main_module.connected_clients['test-sid-ua'] = {
        'sid': 'test-sid-ua', 'ip_address_reported': '127.0.0.1', 'user_agent': 'pytest-agent/1.0',
    }
    try:
        extra = main_module._log_extra('test-sid-ua')
        assert extra['user_agent'] == 'pytest-agent/1.0'
    finally:
        main_module.connected_clients.pop('test-sid-ua', None)


def test_client_user_agent_falls_back_to_unknown_for_missing_sid():
    assert main_module._client_user_agent('no-such-sid') == '?'


def test_json_formatter_surfaces_user_agent(caplog=None):
    record = logging.LogRecord(
        name='lattice', level=logging.INFO, pathname=__file__, lineno=1,
        msg='test message', args=(), exc_info=None,
    )
    record.sid = 'sid-1'
    record.ip = '127.0.0.1'
    record.user_agent = 'pytest-agent/1.0'
    formatted = main_module._JsonFormatter().format(record)
    obj = json.loads(formatted)
    assert obj['user_agent'] == 'pytest-agent/1.0'


def test_uncaught_http_exception_is_logged_and_returns_500(fresh_test_client_for_http_error_test, caplog):
    def _boom():
        raise RuntimeError("boom")
    main_module.app.add_url_rule('/__test_boom_http', view_func=_boom)
    client = fresh_test_client_for_http_error_test

    with caplog.at_level(logging.ERROR, logger='lattice'):
        resp = client.get('/__test_boom_http')

    assert resp.status_code == 500
    assert resp.get_json() == {'error': 'Internal server error'}
    assert any('[UNCAUGHT]' in r.message for r in caplog.records)


def test_normal_404_is_not_hijacked_by_the_errorhandler():
    client = main_module.app.test_client()
    resp = client.get('/__definitely_does_not_exist__')
    assert resp.status_code == 404


def test_uncaught_socketio_exception_is_logged(monkeypatch, caplog):
    @main_module.socketio.on('__test_boom_socketio')
    def _boom(data):
        raise RuntimeError("boom")

    client = main_module.socketio.test_client(main_module.app)
    client.get_received()

    with caplog.at_level(logging.ERROR, logger='lattice'):
        client.emit('__test_boom_socketio', {})

    assert any('[UNCAUGHT]' in r.message for r in caplog.records)
