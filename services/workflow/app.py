import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "shared", "python"))

from preplane_health import create_app

app = create_app("workflow")

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "9003")))
