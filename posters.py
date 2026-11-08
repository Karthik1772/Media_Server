"""Deprecated compatibility import. Use ``streamly_server.posters`` instead."""
import sys
from streamly_server import posters as _posters
sys.modules[__name__] = _posters
