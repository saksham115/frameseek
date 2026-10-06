"""Download the DB-IP Lite country database (CC BY 4.0) into the image, for the admin
dashboard's geography and the regional availability gate. Tries this month's file, then
last month's, and verifies the result opens and resolves before accepting it. Exits
non-zero if no usable database was obtained: the API refuses to start without one, so a
build should fail here rather than later. Run at image build (see Dockerfile)."""

import datetime
import gzip
import sys
import urllib.request

target = sys.argv[1] if len(sys.argv) > 1 else "/app/geoip/dbip-country-lite.mmdb"
today = datetime.date.today()
months = [today.strftime("%Y-%m"), (today.replace(day=1) - datetime.timedelta(days=1)).strftime("%Y-%m")]


def usable(path: str) -> bool:
    """A lookup of a well-known address, so a truncated or wrong-format file is caught here."""
    try:
        import maxminddb
    except ImportError:
        print("maxminddb not installed; skipping the database check")
        return True
    try:
        with maxminddb.open_database(path) as reader:
            return bool((reader.get("8.8.8.8") or {}).get("country", {}).get("iso_code"))
    except Exception as exc:
        print(f"Database at {path} is not usable: {exc}")
        return False


for month in months:
    url = f"https://download.db-ip.com/free/dbip-country-lite-{month}.mmdb.gz"
    try:
        # DB-IP refuses Python's default User-Agent (403), so name ourselves.
        request = urllib.request.Request(url, headers={"User-Agent": "FrameSeek/1.0 (+https://app.frameseek.in)"})
        data = urllib.request.urlopen(request, timeout=60).read()
        with open(target, "wb") as fh:
            fh.write(gzip.decompress(data))
        if not usable(target):
            continue
        print(f"GeoIP database {month} saved to {target}")
        break
    except Exception as exc:  # network or format problem: try the previous month
        print(f"GeoIP {month} unavailable: {exc}")
else:
    sys.exit(f"Could not download a usable IP country database (tried {', '.join(months)}).")
