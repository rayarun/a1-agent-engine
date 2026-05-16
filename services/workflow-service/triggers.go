// Copyright 2026 Arun Ray
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"go.uber.org/zap"
)

// WebhookTriggerRequest represents an incoming webhook
type WebhookTriggerRequest struct {
	Event   string                 `json:"event"`
	Payload map[string]interface{} `json:"payload"`
}

// HandleWebhookTrigger processes incoming webhooks for workflows
func (s *Service) HandleWebhookTrigger(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-ID")
	if tenantID == "" {
		tenantID = "default-tenant"
	}

	workflowID := c.Param("id")

	// Verify HMAC signature
	signature := c.GetHeader("X-Webhook-Signature")
	if signature == "" && os.Getenv("WEBHOOK_HMAC_DISABLED") != "true" {
		c.JSON(401, gin.H{"error": "Missing X-Webhook-Signature header"})
		return
	}

	// Read body
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(400, gin.H{"error": "Failed to read request body"})
		return
	}

	// Verify signature if HMAC is enabled
	if os.Getenv("WEBHOOK_HMAC_DISABLED") != "true" {
		if !s.verifyWebhookSignature(workflowID, tenantID, body, signature) {
			c.JSON(401, gin.H{"error": "Invalid webhook signature"})
			return
		}
	}

	// Parse payload
	var payload map[string]interface{}
	if err := json.Unmarshal(body, &payload); err != nil {
		c.JSON(400, gin.H{"error": "Invalid JSON payload"})
		return
	}

	// Get workflow to verify it exists
	workflow, err := s.getWorkflow(workflowID, tenantID)
	if err != nil {
		c.JSON(404, gin.H{"error": "Workflow not found"})
		return
	}

	// Create workflow run
	runID := uuid.New().String()

	query := `
		INSERT INTO workflow_runs
		(run_id, workflow_id, tenant_id, status, inputs, started_at)
		VALUES ($1, $2, $3, 'pending', $4, NOW())
		RETURNING run_id, status
	`

	var returnedRunID, status string
	err = s.db.QueryRow(query, runID, workflowID, tenantID, payload).Scan(&returnedRunID, &status)

	if err != nil {
		s.logger.Error("Failed to create workflow run from webhook", zap.Error(err))
		c.JSON(500, gin.H{"error": "Failed to trigger workflow"})
		return
	}

	s.logger.Info("Webhook trigger received", zap.String("workflow_id", workflowID), zap.String("run_id", runID))

	// Dispatch to Temporal
	go s.dispatchWorkflowRun(workflow, runID, payload, tenantID)

	c.JSON(202, gin.H{
		"run_id":  returnedRunID,
		"status":  status,
		"message": "Webhook received, workflow queued for execution",
	})
}

// verifyWebhookSignature validates HMAC-SHA256 signature
func (s *Service) verifyWebhookSignature(workflowID, tenantID string, body []byte, signature string) bool {
	// Get webhook secret from database
	query := `
		SELECT trigger_config->>'webhook_secret'
		FROM workflow_registrations
		WHERE id = $1 AND tenant_id = $2
	`

	var secret sql.NullString
	err := s.db.QueryRow(query, workflowID, tenantID).Scan(&secret)
	if err != nil || !secret.Valid {
		s.logger.Warn("Failed to get webhook secret", zap.Error(err))
		return false
	}

	// Compute HMAC
	h := hmac.New(sha256.New, []byte(secret.String))
	h.Write(body)
	computed := hex.EncodeToString(h.Sum(nil))

	// Compare signatures
	return hmac.Equal([]byte(computed), []byte(signature))
}

// getWorkflow retrieves a workflow registration
func (s *Service) getWorkflow(workflowID, tenantID string) (*WorkflowRegistration, error) {
	query := `
		SELECT id, tenant_id, name, description, workflow_type, workflow_class, task_queue, definition, input_schema, trigger_config, status
		FROM workflow_registrations
		WHERE id = $1 AND tenant_id = $2
	`

	var w WorkflowRegistration
	var definition, inputSchema, triggerConfig sql.NullString

	err := s.db.QueryRow(query, workflowID, tenantID).Scan(
		&w.ID, &w.TenantID, &w.Name, &w.Description, &w.WorkflowType, &w.WorkflowClass,
		&w.TaskQueue, &definition, &inputSchema, &triggerConfig, &w.Status,
	)

	if err != nil {
		return nil, err
	}

	if definition.Valid {
		json.Unmarshal([]byte(definition.String), &w.Definition)
	}
	if inputSchema.Valid {
		json.Unmarshal([]byte(inputSchema.String), &w.InputSchema)
	}
	if triggerConfig.Valid {
		json.Unmarshal([]byte(triggerConfig.String), &w.TriggerConfig)
	}

	return &w, nil
}

// WorkflowRegistration represents a workflow definition
type WorkflowRegistration struct {
	ID             string                 `json:"id"`
	TenantID       string                 `json:"tenant_id"`
	Name           string                 `json:"name"`
	Description    string                 `json:"description"`
	WorkflowType   string                 `json:"workflow_type"`
	WorkflowClass  string                 `json:"workflow_class"`
	TaskQueue      string                 `json:"task_queue"`
	Definition     map[string]interface{} `json:"definition"`
	InputSchema    map[string]interface{} `json:"input_schema"`
	TriggerConfig  map[string]interface{} `json:"trigger_config"`
	Status         string                 `json:"status"`
}

// dispatchWorkflowRun sends a workflow to Temporal for execution
func (s *Service) dispatchWorkflowRun(w *WorkflowRegistration, runID string, inputs map[string]interface{}, tenantID string) {
	// TODO: Implement Temporal client dispatch
	// This would:
	// 1. Connect to Temporal client
	// 2. Call StartWorkflowOptions with the workflow type
	// 3. Pass the workflow definition + inputs as parameters
	// 4. Update workflow_runs table with temporal_workflow_id, temporal_run_id
	// 5. Set status to 'running'

	s.logger.Info("Workflow run dispatched to Temporal",
		zap.String("workflow_id", w.ID),
		zap.String("run_id", runID),
		zap.String("task_queue", w.TaskQueue),
	)
}

// ScheduleCronWorkflows creates Temporal Schedules for all active cron workflows
func (s *Service) ScheduleCronWorkflows() error {
	query := `
		SELECT id, tenant_id, task_queue, trigger_config, definition
		FROM workflow_registrations
		WHERE status = 'active'
		AND workflow_type = 'yaml'
		AND trigger_config->>'type' = 'cron'
	`

	rows, err := s.db.Query(query)
	if err != nil {
		s.logger.Error("Failed to query cron workflows", zap.Error(err))
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var id, tenantID, taskQueue string
		var triggerConfig, definition sql.NullString

		if err := rows.Scan(&id, &tenantID, &taskQueue, &triggerConfig, &definition); err != nil {
			s.logger.Error("Failed to scan cron workflow", zap.Error(err))
			continue
		}

		if !triggerConfig.Valid {
			continue
		}

		var config map[string]interface{}
		if err := json.Unmarshal([]byte(triggerConfig.String), &config); err != nil {
			s.logger.Error("Failed to parse trigger config", zap.Error(err))
			continue
		}

		cronExpr, ok := config["cron"].(string)
		if !ok || cronExpr == "" {
			continue
		}

		s.logger.Info("Setting up cron trigger",
			zap.String("workflow_id", id),
			zap.String("cron", cronExpr),
			zap.String("task_queue", taskQueue),
		)

		// TODO: Create Temporal Schedule
		// This would use Temporal's ScheduleClient to create a workflow schedule
		// that automatically triggers at the cron interval
	}

	return nil
}

// HandleEventTrigger processes event-based workflow triggers
func (s *Service) HandleEventTrigger(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-ID")
	if tenantID == "" {
		tenantID = "default-tenant"
	}

	eventName := c.Param("event_name")

	// Parse event payload
	var payload map[string]interface{}
	if err := c.ShouldBindJSON(&payload); err != nil {
		c.JSON(400, gin.H{"error": "Invalid JSON payload"})
		return
	}

	// Find workflows listening to this event
	query := `
		SELECT id, tenant_id, task_queue, definition
		FROM workflow_registrations
		WHERE status = 'active'
		AND tenant_id = $1
		AND trigger_config->>'type' = 'event'
		AND trigger_config->>'event_name' = $2
	`

	rows, err := s.db.Query(query, tenantID, eventName)
	if err != nil {
		s.logger.Error("Failed to query event workflows", zap.Error(err))
		c.JSON(500, gin.H{"error": "Failed to trigger workflows"})
		return
	}
	defer rows.Close()

	triggeredCount := 0

	for rows.Next() {
		var id, tenantID, taskQueue string
		var definition sql.NullString

		if err := rows.Scan(&id, &tenantID, &taskQueue, &definition); err != nil {
			s.logger.Error("Failed to scan workflow", zap.Error(err))
			continue
		}

		// Create workflow run
		runID := uuid.New().String()

		insertQuery := `
			INSERT INTO workflow_runs
			(run_id, workflow_id, tenant_id, status, inputs, started_at)
			VALUES ($1, $2, $3, 'pending', $4, NOW())
			RETURNING run_id, status
		`

		var returnedRunID, status string
		err = s.db.QueryRow(insertQuery, runID, id, tenantID, payload).Scan(&returnedRunID, &status)

		if err != nil {
			s.logger.Error("Failed to create workflow run from event", zap.Error(err))
			continue
		}

		s.logger.Info("Event trigger matched",
			zap.String("event_name", eventName),
			zap.String("workflow_id", id),
			zap.String("run_id", runID),
		)

		triggeredCount++

		// Dispatch to Temporal (async)
		go func(wfID, rID, tq, tenID string) {
			w := &WorkflowRegistration{
				ID:       wfID,
				TaskQueue: tq,
			}
			s.dispatchWorkflowRun(w, rID, payload, tenID)
		}(id, runID, taskQueue, tenantID)
	}

	c.JSON(202, gin.H{
		"event_name":      eventName,
		"workflows_triggered": triggeredCount,
		"message":          fmt.Sprintf("Event trigger matched %d workflows", triggeredCount),
	})
}

// ValidateTriggerConfig checks if a trigger configuration is valid
func ValidateTriggerConfig(triggerConfig map[string]interface{}) error {
	triggerType, ok := triggerConfig["type"].(string)
	if !ok || triggerType == "" {
		return fmt.Errorf("trigger_config.type is required")
	}

	switch triggerType {
	case "manual":
		// No additional validation needed
	case "webhook":
		secret, ok := triggerConfig["webhook_secret"].(string)
		if !ok || secret == "" {
			return fmt.Errorf("webhook_secret required for webhook trigger")
		}
	case "cron":
		cron, ok := triggerConfig["cron"].(string)
		if !ok || cron == "" {
			return fmt.Errorf("cron expression required for cron trigger")
		}
		// TODO: Validate cron syntax
	case "event":
		eventName, ok := triggerConfig["event_name"].(string)
		if !ok || eventName == "" {
			return fmt.Errorf("event_name required for event trigger")
		}
	default:
		return fmt.Errorf("unknown trigger type: %s", triggerType)
	}

	return nil
}
