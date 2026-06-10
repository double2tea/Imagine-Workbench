"""DaVinci Resolve menu entry for Imagine Workbench.

Copy this file and `imagine_resolve_bridge.py` into a Resolve Scripts folder,
then create a job JSON at `~/Movies/Imagine Resolve Bridge/job.json`.
"""

from imagine_resolve_bridge import run_in_resolve


run_in_resolve()
