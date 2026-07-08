import os
import sys

import uvicorn

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "shared", "python"))
sys.path.insert(0, ROOT)

from plan import app  # noqa: E402

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "9003")))
