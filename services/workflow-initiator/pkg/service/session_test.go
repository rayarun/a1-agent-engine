package service

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/agent-platform/go-shared/pkg/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"go.temporal.io/sdk/client"
)

// MockTemporalClient is a mock of the Temporal client.
type MockTemporalClient struct {
	mock.Mock
}

func (m *MockTemporalClient) ExecuteWorkflow(ctx context.Context, options client.StartWorkflowOptions, workflow interface{}, args ...interface{}) (client.WorkflowRun, error) {
	// Variadic args in mock.Called should match the expectation's arg count.
	// Since we expect 4 args in total (ctx, opts, wf, req), and req is in args[0].
	var arg interface{}
	if len(args) > 0 {
		arg = args[0]
	}
	callArgs := m.Called(ctx, options, workflow, arg)
	
	if run := callArgs.Get(0); run != nil {
		return run.(client.WorkflowRun), callArgs.Error(1)
	}
	return nil, callArgs.Error(1)
}

// MockWorkflowRun mocks the result of ExecuteWorkflow.
type MockWorkflowRun struct {
	mock.Mock
}

func (m *MockWorkflowRun) GetID() string                      { return m.Called().String(0) }
func (m *MockWorkflowRun) GetRunID() string                   { return m.Called().String(0) }
func (m *MockWorkflowRun) Get(ctx context.Context, valuePtr interface{}) error { return m.Called(ctx, valuePtr).Error(0) }

func TestStartSession(t *testing.T) {
	// 1. Setup Mock
	mockClient := new(MockTemporalClient)
	mockRun := new(MockWorkflowRun)

	mockRun.On("GetID").Return("agent-wf-123")
	mockRun.On("GetRunID").Return("run-123")

	mockClient.On("ExecuteWorkflow", mock.Anything, mock.Anything, "AgentWorkflow", mock.Anything).Return(mockRun, nil)

	SetTemporalClient(mockClient)

	// 2. Create Request
	reqBody := models.StartSessionRequest{
		AgentID:   "agent-123",
		SessionID: "session-abc",
	}
	body, _ := json.Marshal(reqBody)

	req, _ := http.NewRequest("POST", "/api/v1/sessions", bytes.NewBuffer(body))
	rr := httptest.NewRecorder()

	// 3. Execute
	http.HandlerFunc(HandleStartSession).ServeHTTP(rr, req)
	
	// 4. Verify
	assert.Equal(t, http.StatusCreated, rr.Code)

	var resp models.SessionStatus
	json.NewDecoder(rr.Body).Decode(&resp)
	assert.Equal(t, "RUNNING", resp.Status)
	assert.Equal(t, "agent-wf-123", resp.WorkflowID)
	
	mockClient.AssertExpectations(t)
}
