"""Dependency-free regression tests for Streamly's Python feature services."""
import os
import tempfile
import unittest

from streamly_server.features.library.service import build_directory_data, _scan_folder
from unittest.mock import patch
from streamly_server.shared.cache.manager import migrate_cache_folders


class CacheMigrationTests(unittest.TestCase):
    def test_moves_legacy_cache_under_one_root(self):
        with tempfile.TemporaryDirectory() as root:
            old = os.path.join(root, "audio_track_cache")
            os.makedirs(old)
            with open(os.path.join(old, "track.m4a"), "wb") as stream:
                stream.write(b"audio")
            cache_root = migrate_cache_folders(root, {"audio_track_cache": "audio"}, log=lambda *_: None)
            self.assertTrue(os.path.isfile(os.path.join(cache_root, "audio", "track.m4a")))
            self.assertFalse(os.path.exists(old))

    def test_preserves_colliding_legacy_files(self):
        with tempfile.TemporaryDirectory() as root:
            for folder, payload in (("films_thumbnails", b"newer"), ("poster_cache", b"legacy")):
                directory = os.path.join(root, folder)
                os.makedirs(directory)
                with open(os.path.join(directory, "poster.jpg"), "wb") as stream:
                    stream.write(payload)
            cache_root = migrate_cache_folders(
                root,
                {"films_thumbnails": "posters", "poster_cache": "posters"},
                log=lambda *_: None,
            )
            target = os.path.join(cache_root, "posters")
            with open(os.path.join(target, "poster.jpg"), "rb") as stream:
                self.assertEqual(stream.read(), b"newer")
            legacy = [name for name in os.listdir(target) if name.startswith("poster.jpg.legacy-")]
            self.assertEqual(len(legacy), 1)
            with open(os.path.join(target, legacy[0]), "rb") as stream:
                self.assertEqual(stream.read(), b"legacy")


class LibraryServiceTests(unittest.TestCase):
    def test_builds_folder_payload_and_hides_cache(self):
        with tempfile.TemporaryDirectory() as root:
            os.mkdir(os.path.join(root, "Films"))
            os.mkdir(os.path.join(root, "cache"))
            with open(os.path.join(root, "readme.txt"), "w", encoding="utf-8") as stream:
                stream.write("hello")
            class PosterStub:
                @staticmethod
                def describe_video(*_args):
                    return {}
                @staticmethod
                def describe_image(*_args):
                    return {}
            payload = build_directory_data(
                path=root,
                request_path="/",
                hidden={"cache"},
                base_dir=os.path.join(root, "server"),
                media_root=root,
                guess_type=lambda _path: "text/plain",
                app_name="Streamly",
                posters=PosterStub,
            )
            self.assertEqual(payload["path"], "/")
            self.assertEqual({item["name"] for item in payload["items"]}, {"Films", "readme.txt"})

    def test_classifies_nested_photo_and_video_folders_without_using_names(self):
        with tempfile.TemporaryDirectory() as root:
            photos = os.path.join(root, "not-called-photos")
            videos = os.path.join(root, "also-not-called-videos")
            os.makedirs(os.path.join(photos, "nested"))
            os.makedirs(videos)
            with open(os.path.join(photos, "nested", "one.jpg"), "wb") as stream:
                stream.write(b"photo")
            with open(os.path.join(videos, "one.mp4"), "wb") as stream:
                stream.write(b"video")

            class PosterStub:
                @staticmethod
                def describe_video(*_args):
                    return {}
                @staticmethod
                def describe_image(*_args):
                    return {"thumb": ""}

            def guess_type(path):
                return "image/jpeg" if path.endswith(".jpg") else "video/mp4" if path.endswith(".mp4") else "application/octet-stream"

            payload = build_directory_data(
                path=root, request_path="/", hidden=set(), base_dir=os.path.join(root, "server"),
                media_root=root, guess_type=guess_type, app_name="Streamly", posters=PosterStub,
            )
            self.assertEqual(payload["mediaMode"], "mixed")
            by_name = {item["name"]: item for item in payload["items"]}
            self.assertEqual(by_name["not-called-photos"]["mediaMode"], "photo")
            self.assertEqual(by_name["also-not-called-videos"]["mediaMode"], "video")

    def test_empty_and_unsupported_only_folders_are_collections(self):
        with tempfile.TemporaryDirectory() as root:
            os.mkdir(os.path.join(root, "empty"))
            with open(os.path.join(root, "empty", "notes.txt"), "w", encoding="utf-8") as stream:
                stream.write("notes")
            class PosterStub:
                @staticmethod
                def describe_video(*_args): return {}
                @staticmethod
                def describe_image(*_args): return {}
            payload = build_directory_data(
                path=root, request_path="/", hidden=set(), base_dir=os.path.join(root, "server"),
                media_root=root, guess_type=lambda _path: "text/plain", app_name="Streamly", posters=PosterStub,
            )
            self.assertEqual(payload["mediaMode"], "collections")
            self.assertEqual(payload["items"][0]["mediaMode"], "collections")

    def test_recursive_scan_is_bounded_by_total_entries(self):
        with tempfile.TemporaryDirectory() as root:
            for index in range(8):
                os.mkdir(os.path.join(root, f"folder-{index}"))
            with patch("streamly_server.features.library.service._MAX_SCAN_ENTRIES", 4):
                result = _scan_folder(root, lambda _path: "application/octet-stream", set())
            self.assertTrue(result["scan_truncated"])

    def test_recursive_scan_does_not_follow_directory_symlinks(self):
        with tempfile.TemporaryDirectory() as root, tempfile.TemporaryDirectory() as outside:
            with open(os.path.join(outside, "outside.jpg"), "wb") as stream:
                stream.write(b"photo")
            try:
                os.symlink(outside, os.path.join(root, "linked"), target_is_directory=True)
            except (OSError, NotImplementedError):
                self.skipTest("Directory symlinks are unavailable in this environment")
            result = _scan_folder(
                root, lambda path: "image/jpeg" if path.endswith(".jpg") else "application/octet-stream", set()
            )
            self.assertEqual(result["photos"], 0)


if __name__ == "__main__":
    unittest.main()
