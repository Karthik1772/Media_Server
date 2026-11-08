"""Playback-facing service boundary for audio and subtitle operations.

The low-level media probing and extraction state is shared with the poster/cache
feature for now, so this module delegates to that single configured engine.
"""
from streamly_server.features.posters import service as media_cache


def tracks_info(key):
    return media_cache.tracks_info(key)


def subtitle_vtt(key, track_id):
    return media_cache.subtitle_vtt(key, track_id)


def audio_prepare(key, track_index):
    return media_cache.audio_prepare(key, track_index)
