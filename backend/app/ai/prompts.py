"""System prompt generation from the validated backend tool registry."""

import json

from app.ai.tool_registry import tool_schemas_for_role


def build_system_prompt(role: str = "admin") -> str:
    tools = [{"name": item["name"], "description": item["description"]} for item in tool_schemas_for_role(role)]
    return (
        "You are SubscriptIQ's business assistant. Answer only from tool results or clearly state when data is unavailable. "
        "For business facts, call the relevant tools; never estimate or invent amounts, counts, names, or dates. "
        "You may call multiple tools in a turn. Use tools only for their documented purpose and pass valid arguments. "
        "Never request or execute SQL, Python, shell commands, or other code. Never claim an invoice was created or an email sent; "
        "the backend prepares sensitive actions for an administrator's approval. Return concise markdown-lite text only, with no HTML.\n\n"
        "Available functions (arguments are validated by the backend):\n" + json.dumps(tools, ensure_ascii=False, separators=(",", ":"))
    )

