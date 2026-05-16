# Copyright 2026 Arun Ray
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Template expression evaluator for HybridWorkflow."""

import logging
import re
from typing import Any


def evaluate_template_expression(template: str, context: dict) -> Any:
    """
    Evaluates a template expression (e.g., "{{ steps.risk.output.risk_level }}").

    Supports:
    - Simple variable access: {{ inputs.X }}, {{ steps.Y.output.Z }}
    - No computation — purely path-based resolution
    - Zero external dependencies

    Args:
        template: Template string with {{ }} placeholders
        context: Context dict with 'inputs' and 'steps' keys

    Returns:
        Resolved value from context, or the template string if not found
    """
    if not isinstance(template, str):
        return template

    pattern = r"\{\{\s*(.+?)\s*\}\}"

    def replace_expr(match):
        expr = match.group(1).strip()
        try:
            value = _resolve_path(expr, context)
            return str(value) if value is not None else ""
        except Exception as e:
            logging.warning(f"Failed to resolve expression '{expr}': {e}")
            return match.group(0)

    result = re.sub(pattern, replace_expr, template)
    return result


def evaluate_template_condition(expression: str, context: dict) -> bool:
    """
    Evaluates a template condition (e.g., "{{ steps.risk.output.risk_level == 'high' }}").

    Returns True if the condition evaluates to truthy, False otherwise.
    """
    if not isinstance(expression, str):
        return bool(expression)

    # Extract the expression content from {{ }}
    match = re.search(r"\{\{\s*(.+?)\s*\}\}", expression)
    if not match:
        return bool(expression)

    expr = match.group(1).strip()

    try:
        # Handle simple equality comparisons: "path == value" or "path != value"
        # This is intentionally limited to prevent injection

        # Try equality
        if "==" in expr:
            parts = expr.split("==")
            if len(parts) == 2:
                left = _resolve_path(parts[0].strip(), context)
                right_str = parts[1].strip()
                right = _parse_value(right_str)
                return left == right

        # Try inequality
        if "!=" in expr:
            parts = expr.split("!=")
            if len(parts) == 2:
                left = _resolve_path(parts[0].strip(), context)
                right_str = parts[1].strip()
                right = _parse_value(right_str)
                return left != right

        # Try greater than
        if ">" in expr:
            parts = expr.split(">")
            if len(parts) == 2:
                left = _resolve_path(parts[0].strip(), context)
                right_str = parts[1].strip()
                right = _parse_value(right_str)
                return left > right  # type: ignore

        # Try less than
        if "<" in expr:
            parts = expr.split("<")
            if len(parts) == 2:
                left = _resolve_path(parts[0].strip(), context)
                right_str = parts[1].strip()
                right = _parse_value(right_str)
                return left < right  # type: ignore

        # Fallback: evaluate the path directly
        value = _resolve_path(expr, context)
        return bool(value)

    except Exception as e:
        logging.warning(f"Failed to evaluate condition '{expression}': {e}")
        return False


def _resolve_path(path: str, context: dict) -> Any:
    """
    Resolves a dot-path in context (e.g., "inputs.X", "steps.Y.output.Z").

    Args:
        path: Dot-separated path string
        context: Context dict

    Returns:
        Value at the path, or None if not found
    """
    parts = path.split(".")
    current = context

    for part in parts:
        if isinstance(current, dict):
            current = current.get(part)
        elif isinstance(current, list) and part.isdigit():
            current = current[int(part)]
        else:
            return None

        if current is None:
            return None

    return current


def _parse_value(value_str: str) -> Any:
    """
    Parses a string value to the appropriate Python type.

    Supports: strings (quoted), numbers, booleans, null.
    """
    value_str = value_str.strip()

    # String (quoted)
    if (value_str.startswith('"') and value_str.endswith('"')) or (
        value_str.startswith("'") and value_str.endswith("'")
    ):
        return value_str[1:-1]

    # Boolean
    if value_str.lower() == "true":
        return True
    if value_str.lower() == "false":
        return False

    # Null
    if value_str.lower() in ("null", "none"):
        return None

    # Number
    try:
        if "." in value_str:
            return float(value_str)
        return int(value_str)
    except ValueError:
        pass

    # Unquoted string (fallback)
    return value_str
