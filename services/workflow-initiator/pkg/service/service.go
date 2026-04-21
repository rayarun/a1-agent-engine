package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"

	"github.com/agent-platform/go-shared/pkg/models"
	"go.temporal.io/sdk/client"
)

// TemporalClient defines the subset of temporal client methods we use.
type TemporalClient interface {
	ExecuteWorkflow(ctx context.Context, options client.StartWorkflowOptions, workflow interface{}, args ...interface{}) (client.WorkflowRun, error)
	GetWorkflow(ctx context.Context, workflowID string, runID string) client.WorkflowRun
}

var temporalClient TemporalClient

// InitTemporalClient initializes the shared Temporal client.
func InitTemporalClient() error {
	hostPort := os.Getenv("TEMPORAL_HOSTPORT")
	if hostPort == "" {
		hostPort = "localhost:7233"
	}

	c, err := client.Dial(client.Options{
		HostPort: hostPort,
	})
	if err != nil {
		return fmt.Errorf("unable to create temporal client: %w", err)
	}
	temporalClient = c
	log.Printf("Connected to Temporal at %s", hostPort)
	return nil
}

// SetTemporalClient allows mocking the client in tests.
func SetTemporalClient(c TemporalClient) {
	temporalClient = c
}

// HandleStartSession handles the creation of a new agent session.
func HandleStartSession(w http.ResponseWriter, r *http.Request) {
	var req models.StartSessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.AgentID == "" {
		http.Error(w, "agent_id is required", http.StatusBadRequest)
		return
	}

	// 1. Prepare Workflow Options
	workflowOptions := client.StartWorkflowOptions{
		ID:        fmt.Sprintf("agent-wf-%s-%s", req.AgentID, req.SessionID),
		TaskQueue: "agent-task-queue",
	}

	// 2. Dispatch Workflow via Temporal
	if temporalClient == nil {
		log.Println("Temporal client is not initialized")
		http.Error(w, "Temporal client not connected", http.StatusServiceUnavailable)
		return
	}

	// We use a string "AgentWorkflow" to match the Python worker's registration
	we, err := temporalClient.ExecuteWorkflow(context.Background(), workflowOptions, "AgentWorkflow", req)
	if err != nil {
		log.Printf("Failed to dispatch workflow: %v", err)
		http.Error(w, fmt.Sprintf("Failed to dispatch workflow: %v", err), http.StatusInternalServerError)
		return
	}

	log.Printf("Started workflow: ID=%s, RunID=%s", we.GetID(), we.GetRunID())

	resp := models.SessionStatus{
		WorkflowID: we.GetID(),
		RunID:      we.GetRunID(),
		Status:     "RUNNING",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(resp)
}

// HandleGetSessionStatus fetches the status/result of a workflow from Temporal.
func HandleGetSessionStatus(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, "workflow id is required", http.StatusBadRequest)
		return
	}

	if temporalClient == nil {
		http.Error(w, "Temporal client not connected", http.StatusServiceUnavailable)
		return
	}

	// Fetch the workflow handle
	we := temporalClient.GetWorkflow(context.Background(), id, "")
	
	var result string
	err := we.Get(context.Background(), &result)
	
	status := "COMPLETED"
	if err != nil {
		// If the workflow is still running, Get() might block or return specific errors.
		// For simplicity in this demo, we assume failure to Get() means it's still active or failed.
		status = "RUNNING"
		result = ""
	}

	resp := models.SessionStatus{
		WorkflowID: id,
		Status:     status,
		Result:     result,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// HandleHealth returns the health status of the service.
func HandleHealth(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "Workflow Initiator is healthy\n")
}
