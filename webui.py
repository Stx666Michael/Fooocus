"""Fooocus web entry point.

The browser-facing application is the React bundle in ``static``. The
diffusion worker remains in ``modules.async_worker`` and is exposed through
the small JSON API in ``modules.react_api``.
"""

from modules.react_api import run_server


run_server()
