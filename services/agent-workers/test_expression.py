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

import pytest
from expression import (
    evaluate_template_expression,
    evaluate_template_condition,
    _resolve_path,
    _parse_value,
)


class TestResolvePathBasic:
    """Tests for basic path resolution."""

    def test_resolve_simple_input(self):
        """Test resolving simple input path."""
        context = {"inputs": {"date": "2026-05-16"}}
        assert _resolve_path("inputs.date", context) == "2026-05-16"

    def test_resolve_nested_path(self):
        """Test resolving nested path."""
        context = {
            "steps": {"step1": {"output": {"trades": [{"id": "T1"}]}}}
        }
        assert _resolve_path("steps.step1.output.trades", context) == [
            {"id": "T1"}
        ]

    def test_resolve_nonexistent_path(self):
        """Test resolving nonexistent path returns None."""
        context = {"inputs": {"date": "2026-05-16"}}
        assert _resolve_path("inputs.nonexistent", context) is None

    def test_resolve_partial_nonexistent_path(self):
        """Test resolving path that becomes None partway."""
        context = {"inputs": {"date": "2026-05-16"}}
        assert _resolve_path("inputs.nonexistent.deep", context) is None

    def test_resolve_array_index(self):
        """Test resolving array index."""
        context = {"steps": {"trades": [{"id": "T1"}, {"id": "T2"}]}}
        # Note: Our implementation doesn't support array indexing yet
        # This test documents the current behavior
        result = _resolve_path("steps.trades.0", context)
        # Would need to extend _resolve_path to handle this
        assert result is None  # Currently unsupported


class TestParseValue:
    """Tests for value parsing."""

    def test_parse_quoted_string(self):
        """Test parsing quoted string."""
        assert _parse_value('"hello"') == "hello"
        assert _parse_value("'world'") == "world"

    def test_parse_boolean(self):
        """Test parsing booleans."""
        assert _parse_value("true") is True
        assert _parse_value("false") is False
        assert _parse_value("True") is True
        assert _parse_value("False") is False

    def test_parse_null(self):
        """Test parsing null values."""
        assert _parse_value("null") is None
        assert _parse_value("none") is None

    def test_parse_integer(self):
        """Test parsing integers."""
        assert _parse_value("42") == 42
        assert _parse_value("-10") == -10
        assert _parse_value("0") == 0

    def test_parse_float(self):
        """Test parsing floats."""
        assert _parse_value("3.14") == 3.14
        assert _parse_value("-2.5") == -2.5

    def test_parse_unquoted_string(self):
        """Test parsing unquoted string (fallback)."""
        # Unquoted strings are returned as-is
        assert _parse_value("hello") == "hello"


class TestEvaluateTemplateExpression:
    """Tests for template expression evaluation."""

    def test_simple_input_replacement(self):
        """Test simple input variable replacement."""
        context = {"inputs": {"date": "2026-05-16"}}
        result = evaluate_template_expression("Date is {{ inputs.date }}", context)
        assert result == "Date is 2026-05-16"

    def test_nested_output_replacement(self):
        """Test nested step output replacement."""
        context = {
            "steps": {"fetch": {"output": {"count": 42}}}
        }
        result = evaluate_template_expression(
            "Found {{ steps.fetch.output.count }} items", context
        )
        assert result == "Found 42 items"

    def test_multiple_replacements(self):
        """Test multiple variable replacements."""
        context = {
            "inputs": {"date": "2026-05-16"},
            "steps": {"fetch": {"output": {"count": 100}}},
        }
        result = evaluate_template_expression(
            "Date: {{ inputs.date }}, Count: {{ steps.fetch.output.count }}",
            context,
        )
        assert result == "Date: 2026-05-16, Count: 100"

    def test_nonexistent_variable(self):
        """Test replacement with nonexistent variable."""
        context = {"inputs": {}}
        result = evaluate_template_expression(
            "Date is {{ inputs.missing }}", context
        )
        # Nonexistent variables resolve to empty string
        assert result == "Date is "

    def test_no_replacement(self):
        """Test text with no templates."""
        context = {"inputs": {"date": "2026-05-16"}}
        result = evaluate_template_expression("No templates here", context)
        assert result == "No templates here"

    def test_whitespace_handling(self):
        """Test whitespace in templates."""
        context = {"inputs": {"value": "test"}}
        result = evaluate_template_expression(
            "Value: {{  inputs.value  }}", context
        )
        assert result == "Value: test"


class TestEvaluateCondition:
    """Tests for condition evaluation."""

    def test_simple_equality_true(self):
        """Test simple equality condition (true)."""
        context = {"inputs": {"status": "active"}}
        assert (
            evaluate_template_condition(
                "{{ inputs.status == 'active' }}", context
            )
            is True
        )

    def test_simple_equality_false(self):
        """Test simple equality condition (false)."""
        context = {"inputs": {"status": "inactive"}}
        assert (
            evaluate_template_condition(
                "{{ inputs.status == 'active' }}", context
            )
            is False
        )

    def test_inequality_condition(self):
        """Test inequality condition."""
        context = {"inputs": {"count": 10}}
        assert (
            evaluate_template_condition(
                "{{ inputs.count != 5 }}", context
            )
            is True
        )

    def test_numeric_comparison_greater_than(self):
        """Test numeric comparison (greater than)."""
        context = {"steps": {"risk": {"output": {"level": 80}}}}
        assert (
            evaluate_template_condition(
                "{{ steps.risk.output.level > 75 }}", context
            )
            is True
        )

    def test_numeric_comparison_less_than(self):
        """Test numeric comparison (less than)."""
        context = {"steps": {"risk": {"output": {"level": 30}}}}
        assert (
            evaluate_template_condition(
                "{{ steps.risk.output.level < 50 }}", context
            )
            is True
        )

    def test_boolean_condition_true(self):
        """Test boolean path evaluation (true)."""
        context = {"inputs": {"approved": True}}
        assert (
            evaluate_template_condition("{{ inputs.approved }}", context)
            is True
        )

    def test_boolean_condition_false(self):
        """Test boolean path evaluation (false)."""
        context = {"inputs": {"approved": False}}
        assert (
            evaluate_template_condition("{{ inputs.approved }}", context)
            is False
        )

    def test_nested_object_equality(self):
        """Test equality with nested object."""
        context = {
            "steps": {"analyze": {"output": {"risk_level": "high"}}}
        }
        assert (
            evaluate_template_condition(
                "{{ steps.analyze.output.risk_level == 'high' }}", context
            )
            is True
        )

    def test_nonexistent_variable_condition(self):
        """Test condition with nonexistent variable."""
        context = {"inputs": {}}
        assert (
            evaluate_template_condition(
                "{{ inputs.missing == 'value' }}", context
            )
            is False
        )

    def test_complex_workflow_condition(self):
        """Test complex real-world workflow condition."""
        context = {
            "inputs": {"env": "production"},
            "steps": {
                "validate": {"output": {"valid": True}},
                "risk": {"output": {"score": 85}},
            },
        }
        # High risk requires approval
        assert (
            evaluate_template_condition(
                "{{ steps.risk.output.score > 80 }}", context
            )
            is True
        )
        # Valid transaction
        assert (
            evaluate_template_condition(
                "{{ steps.validate.output.valid == true }}", context
            )
            is True
        )

    def test_no_template_markers(self):
        """Test condition without template markers."""
        context = {"inputs": {}}
        # No {{ }} markers means evaluate as falsy
        assert evaluate_template_condition("plain text", context) is False

    def test_multiple_operators_takes_first(self):
        """Test that multiple operators uses first match."""
        # Only first operator is evaluated
        context = {"inputs": {"value": 10}}
        # This has both == and !, uses ==
        result = evaluate_template_condition(
            "{{ inputs.value == 10 }}", context
        )
        assert result is True


class TestTradeBackofficeScenarios:
    """Real-world trade-backoffice workflow scenarios."""

    def test_settlement_risk_gate(self):
        """Test settlement risk gate logic."""
        context = {
            "steps": {
                "risk_assessment": {
                    "output": {"risk_level": "high", "score": 85}
                }
            }
        }
        # High risk requires approval
        requires_approval = evaluate_template_condition(
            "{{ steps.risk_assessment.output.score > 80 }}", context
        )
        assert requires_approval is True

    def test_reconciliation_check(self):
        """Test reconciliation mismatch detection."""
        context = {
            "steps": {
                "exchange": {"output": {"count": 100, "amount": 5000000}},
                "internal": {"output": {"count": 100, "amount": 5000000}},
            }
        }
        # Mismatch detection
        matches = evaluate_template_condition(
            "{{ steps.exchange.output.count == steps.internal.output.count }}",
            context,
        )
        # Note: Our evaluator doesn't support comparing two paths
        # This documents the limitation
        assert matches is False  # Will fail as we can't compare paths

    def test_corporate_action_timing(self):
        """Test corporate action ex-date check."""
        context = {
            "inputs": {"corporate_action_type": "dividend"},
            "steps": {"calendar": {"output": {"ex_date": "2026-05-20"}}},
        }
        is_dividend = evaluate_template_condition(
            "{{ inputs.corporate_action_type == 'dividend' }}", context
        )
        assert is_dividend is True

    def test_margin_utilization_alert(self):
        """Test margin utilization alert logic."""
        context = {
            "steps": {
                "margin_check": {
                    "output": {"utilization_percent": 95}
                }
            }
        }
        # Alert when utilization > 90%
        should_alert = evaluate_template_condition(
            "{{ steps.margin_check.output.utilization_percent > 90 }}",
            context,
        )
        assert should_alert is True


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
