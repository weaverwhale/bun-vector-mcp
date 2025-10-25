/**
 * Logger utility that only logs when not in MCP mode
 * MCP servers use stdio for JSON-RPC communication, so we can't pollute stdout
 */

export function log(...args: any[]) {
  // Check MCP_MODE dynamically each time, not just at import time
  if (process.env.MCP_MODE !== 'true') {
    console.log(...args);
  }
}

export function error(...args: any[]) {
  // Errors always go to stderr, which is safe in MCP mode
  console.error(...args);
}
