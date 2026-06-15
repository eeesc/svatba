#!/usr/bin/env python3
"""Quick smoke test: upload a tiny PNG to Google Drive via service account."""

import json
import pathlib
import sys
import urllib.error
import urllib.request

try:
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaInMemoryUpload
except ImportError:
    print("Install deps: pip install google-auth google-auth-httplib2 google-api-python-client")
    sys.exit(1)

ROOT = pathlib.Path(__file__).resolve().parents[1]
KEY_FILE = ROOT / "svatebni-fotky-9d0483472aad.json"
ENV_FILE = ROOT / ".env.local"
FOLDER_ID = "1n7GYR_Vjrfv2T2DYal5X1GUFh5c5uFSb"

# 1x1 transparent PNG
TINY_PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082"
)


def load_folder_id():
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            if line.startswith("GOOGLE_DRIVE_FOLDER_ID="):
                return line.split("=", 1)[1].strip()
    return FOLDER_ID


def main():
    if not KEY_FILE.exists():
        print(f"Missing key file: {KEY_FILE}")
        sys.exit(1)

    folder_id = load_folder_id()
    creds = service_account.Credentials.from_service_account_file(
        str(KEY_FILE),
        scopes=["https://www.googleapis.com/auth/drive.file"],
    )
    drive = build("drive", "v3", credentials=creds, cache_discovery=False)

    media = MediaInMemoryUpload(TINY_PNG, mimetype="image/png", resumable=False)
    body = {
        "name": "_svatba_upload_test.png",
        "parents": [folder_id],
    }

    print(f"Uploading test file to folder {folder_id}…")
    created = (
        drive.files()
        .create(body=body, media_body=media, supportsAllDrives=True, fields="id,name")
        .execute()
    )
    print(f"OK — uploaded: {created['name']} (id: {created['id']})")
    print("Check your Drive folder for _svatba_upload_test.png")


if __name__ == "__main__":
    try:
        main()
    except Exception as err:
        print(f"FAILED: {err}")
        sys.exit(1)
