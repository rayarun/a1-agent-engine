package test

import (
	"testing"

	"github.com/agent-platform/api-gateway/pkg/utils"
	"github.com/stretchr/testify/assert"
)

func TestFormatAgentID(t *testing.T) {
	input := "123"
	expected := "agent_123"
	actual := utils.FormatAgentID(input)
	assert.Equal(t, expected, actual)
}
