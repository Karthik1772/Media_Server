"""Streamly's single-command entry point. Run: python server.py"""
import sys
from streamly_server import application as _application

# Keep the historical ``import server`` surface compatible for local scripts.
if __name__ == "__main__":
    _application.main()
else:
    sys.modules[__name__] = _application
