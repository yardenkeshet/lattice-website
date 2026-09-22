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


def test_uncaught_http_exception_is_logged_and_returns_500(monkeypatch, caplog):
    # Test the error handler directly by simulating a Flask exception context
    exc = RuntimeError("test boom")

    # Create a mock request context
    with main_module.app.test_request_context('GET', '/__test_boom_http'):
        with caplog.at_level(logging.ERROR, logger='lattice'):
            result = main_module.handle_uncaught_http_exception(exc)

    # Check response
    assert result[1] == 500
    assert result[0].get_json() == {'error': 'Internal server error'}

    # Check logging
    assert any('[UNCAUGHT]' in r.message for r in caplog.records)


def test_uncaught_socketio_exception_is_logged(monkeypatch, caplog):
    @main_module.socketio.on('__test_boom_socketio')
    def _boom(data):
        raise RuntimeError("boom")

    client = main_module.socketio.test_client(main_module.app)
    client.get_received()

    with caplog.at_level(logging.ERROR, logger='lattice'):
        client.emit('__test_boom_socketio', {})

    assert any('[UNCAUGHT]' in r.message for r in caplog.records)
