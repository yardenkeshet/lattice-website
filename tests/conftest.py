import pytest
import main as main_module


@pytest.fixture
def fresh_test_client_for_http_error_test():
    """Provides a test client that can add routes for the HTTP error handler test.

    This fixture temporarily resets Flask's internal state to allow adding routes
    after other tests have already used the app.
    """
    # Save the original state
    original_got_first_request = main_module.app._got_first_request

    # Reset Flask's state so we can add routes
    main_module.app._got_first_request = False

    yield main_module.app.test_client()

    # Restore the original state
    main_module.app._got_first_request = original_got_first_request
