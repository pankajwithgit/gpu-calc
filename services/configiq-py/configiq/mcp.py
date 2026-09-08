# SPDX-License-Identifier: Apache-2.0

"""Expose a FastAPI app as MCP tools.

Imports fastapi-mcp at module load, so this module is only importable when the
`mcp` extra is installed. Wire it behind a try/except so MCP stays optional::

    try:
        from configiq import mcp as mcp_support
        mcp_support.mount(app, name="aicostings", description="...")
        _MCP = True
    except ImportError:
        _MCP = False
"""

import logging

from fastapi_mcp import FastApiMCP

logger = logging.getLogger(__name__)


def mount(app, *, name: str, description: str) -> FastApiMCP:
    """Mount an MCP server that exposes the app's endpoints as MCP tools.

    Returns the FastApiMCP instance. The SSE endpoint is served at /mcp.
    """
    server = FastApiMCP(app, name=name, description=description)
    # `mount()` is deprecated; call `mount_sse` directly. Its mount_path defaults
    # to /sse, so pass /mcp explicitly to preserve the existing SSE endpoint.
    server.mount_sse(mount_path="/mcp")
    logger.info("MCP server initialized - SSE endpoint at /mcp")
    return server
