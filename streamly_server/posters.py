"""Public poster/media-cache API for Streamly.

Implementation is kept with the posters feature in
:mod:`streamly_server.features.posters.service`; this module provides the
stable package-level import used by the application and external scripts.
"""
from streamly_server.features.posters.service import *  # noqa: F401,F403
from streamly_server.features.posters.service import __dict__ as _feature_namespace

# Keep the module's mutable configuration namespace shared with the feature
# implementation (configure() updates ROOT, cache paths and callbacks).
import sys as _sys
from streamly_server.features.posters import service as _implementation
_sys.modules[__name__] = _implementation
