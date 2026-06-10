"""DaVinci Resolve menu entry for Imagine Workbench.

Copy this file and `imagine_resolve_bridge.py` into a Resolve Scripts folder,
then edit the job JSON at `~/Movies/Imagine Resolve Bridge/job.json`.
"""

from imagine_resolve_bridge import current_resolve_app, run_in_resolve


run_in_resolve(current_resolve_app())
