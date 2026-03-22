import io
import os
import urllib
from urllib.parse import urlparse

import requests as requests
from flask import Flask, jsonify, request, send_file
from flask_cors import CORS

from database import Database
from logger import get_logger
from plexwrapper import PlexWrapper

app = Flask(__name__)
CORS(app)

logger = get_logger(__name__)

# Extract Plex server hostname for proxy URL validation
_plex_url = os.environ.get("PLEX_BASE_URL", "")
PLEX_HOST = urlparse(_plex_url).hostname if _plex_url else None

# Cached singleton instances — avoid reconnecting to Plex on every request
_plex_wrapper = None
_database = None


def get_plex_wrapper():
    global _plex_wrapper
    if _plex_wrapper is None:
        _plex_wrapper = PlexWrapper()
    return _plex_wrapper


def get_database():
    global _database
    if _database is None:
        _database = Database()
    return _database


@app.errorhandler(Exception)
def internal_error(error):
    logger.error(error)
    return jsonify({"error": str(error)}), 500


@app.route("/server/info")
def get_server_info():
    info = get_plex_wrapper().get_server_info()
    return jsonify(info)


@app.route("/server/proxy")
def get_server_proxy():
    # Proxy a request to the Plex server - useful when the user
    # is viewing the cleanarr dash over HTTPS to avoid the browser
    # blocking untrusted server certs
    url = request.args.get('url')
    if not url:
        return jsonify({"error": "Missing url parameter"}), 400

    # Validate URL points to the configured Plex server to prevent SSRF
    parsed = urlparse(url)
    if not PLEX_HOST or parsed.hostname != PLEX_HOST:
        return jsonify({"error": "URL must point to the configured Plex server"}), 403

    r = requests.get(url)
    return send_file(io.BytesIO(r.content), mimetype='image/jpeg')

@app.route("/server/thumbnail")
def get_server_thumbnail():
    # Proxy a request to the server - useful when the user
    # is viewing the cleanarr dash over HTTPS to avoid the browser
    # blocking untrusted server certs
    content_key = urllib.parse.unquote(request.args.get('content_key'))
    url = get_plex_wrapper().get_thumbnail_url(content_key)
    r = requests.get(url)
    return send_file(io.BytesIO(r.content), mimetype='image/jpeg')

@app.route("/content/dupes")
def get_dupes():
    page = int(request.args.get("page", 1))
    dupes = get_plex_wrapper().get_dupe_content(page)
    return jsonify(dupes)


@app.route("/content/samples")
def get_samples():
    samples = get_plex_wrapper().get_content_sample_files()
    return jsonify(samples)


@app.route("/server/deleted-sizes")
def get_deleted_sizes():
    sizes = get_plex_wrapper().get_deleted_sizes()
    return jsonify(sizes)


@app.route("/delete/media", methods=["POST"])
def delete_media():
    content = request.get_json()
    library_name = content["library_name"]
    content_key = content["content_key"]
    media_id = content["media_id"]

    get_plex_wrapper().delete_media(library_name, content_key, media_id)

    return jsonify({"success": True})


@app.route("/content/ignore", methods=["POST"])
def add_ignored_item():
    content = request.get_json()
    content_key = content["content_key"]

    get_database().add_ignored_item(content_key)

    return jsonify({"success": True})


@app.route("/content/unignore", methods=["POST"])
def remove_ignored_item():
    content = request.get_json()
    content_key = content["content_key"]

    get_database().remove_ignored_item(content_key)

    return jsonify({"success": True})


# Static File Hosting Hack
# See https://github.com/tiangolo/uwsgi-nginx-flask-docker/blob/master/deprecated-single-page-apps-in-same-container.md
@app.route("/")
def main():
    index_path = os.path.join(app.static_folder, "index.html")
    return send_file(index_path)


# Everything not declared before (not a Flask route / API endpoint)...
@app.route("/<path:path>")
def route_frontend(path):
    # ...could be a static file needed by the front end that
    # doesn't use the `static` path (like in `<script src="bundle.js">`)
    file_path = os.path.join(app.static_folder, path)
    if os.path.isfile(file_path):
        return send_file(file_path)
    # ...or should be handled by the SPA's "router" in front end
    else:
        index_path = os.path.join(app.static_folder, "index.html")
        return send_file(index_path)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=os.getenv("PORT", "80"))
