"""Download the DB-IP Lite country database (CC BY 4.0) into the image, for the admin
dashboard's geography. Best effort: this month's file, then last month's; on failure the
dashboard just shows countries as unknown. Run at image build (see Dockerfile)."""

import datetime
import gzip
import sys
import urllib.request

target = sys.argv[1] if len(sys.argv) > 1 else "/app/geoip/dbip-country-lite.mmdb"
today = datetime.date.today()
months = [today.strftime("%Y-%m"), (today.replace(day=1) - datetime.timedelta(days=1)).strftime("%Y-%m")]
for month in months:
    url = f"https://download.db-ip.com/free/dbip-country-lite-{month}.mmdb.gz"
    try:
        # DB-IP refuses Python's default User-Agent (403), so name ourselves.
        request = urllib.request.Request(url, headers={"User-Agent": "FrameSeek/1.0 (+https://app.frameseek.in)"})
        data = urllib.request.urlopen(request, timeout=60).read()
        with open(target, "wb") as fh:
            fh.write(gzip.decompress(data))
        print(f"GeoIP database {month} saved to {target}")
        break
    except Exception as exc:  # network or format problem: try the previous month
        print(f"GeoIP {month} unavailable: {exc}")
