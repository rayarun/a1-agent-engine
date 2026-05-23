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
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	_ "github.com/lib/pq"
	"go.uber.org/zap"
)

func main() {
	// Initialize logger
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	// Database connection
	connStr := os.Getenv("DATABASE_URL")
	if connStr == "" {
		logger.Fatal("DATABASE_URL not set")
	}

	dbConn, err := sql.Open("postgres", connStr)
	if err != nil {
		logger.Fatal("Failed to connect to database", zap.Error(err))
	}
	defer dbConn.Close()

	// Test connection
	if err := dbConn.Ping(); err != nil {
		logger.Fatal("Database ping failed", zap.Error(err))
	}
	logger.Info("Connected to database")

	// Initialize Gin router
	router := gin.Default()

	// Health check
	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// Initialize service
	service := &Service{
		db:     dbConn,
		logger: logger,
	}

	// Workflow registration endpoints
	router.POST("/api/v1/workflows", service.RegisterWorkflow)
	router.GET("/api/v1/workflows", service.ListWorkflows)
	router.GET("/api/v1/workflows/:id", service.GetWorkflow)
	router.PUT("/api/v1/workflows/:id", service.UpdateWorkflow)
	router.DELETE("/api/v1/workflows/:id", service.DeleteWorkflow)

	// Workflow run endpoints
	router.POST("/api/v1/workflows/:id/trigger", service.TriggerWorkflow)
	router.GET("/api/v1/workflows/:id/runs", service.ListWorkflowRuns)
	router.GET("/api/v1/workflow-runs/:run_id", service.GetWorkflowRun)

	// Trigger mechanism endpoints
	router.POST("/api/v1/workflows/:id/webhooks", service.HandleWebhookTrigger)
	router.POST("/api/v1/events/:event_name", service.HandleEventTrigger)

	// Initialize cron triggers on startup
	go func() {
		time.Sleep(2 * time.Second) // Wait for DB connection to stabilize
		if err := service.ScheduleCronWorkflows(); err != nil {
			logger.Error("Failed to schedule cron workflows", zap.Error(err))
		}
	}()

	// Start server
	port := os.Getenv("PORT")
	if port == "" {
		port = "8094"
	}

	logger.Info(fmt.Sprintf("Starting workflow-service on port %s", port))
	router.Run(":" + port)
}

type Service struct {
	db     *sql.DB
	logger *zap.Logger
}

type WorkflowRegistrationRequest struct {
	ID             string                 `json:"id" binding:"required"`
	Name           string                 `json:"name"`
	Description    string                 `json:"description"`
	WorkflowType   string                 `json:"workflow_type" binding:"required"` // 'yaml' or 'code'
	WorkflowClass  string                 `json:"workflow_class"`
	TaskQueue      string                 `json:"task_queue" binding:"required"`
	Definition     map[string]interface{} `json:"definition"` // for type='yaml'
	InputSchema    map[string]interface{} `json:"input_schema"`
	TriggerConfig  map[string]interface{} `json:"trigger_config"`
}

// RegisterWorkflow creates a new workflow registration
func (s *Service) RegisterWorkflow(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-ID")
	if tenantID == "" {
		tenantID = "default-tenant"
	}

	var req WorkflowRegistrationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	// Validate trigger config if provided
	if req.TriggerConfig != nil {
		if err := ValidateTriggerConfig(req.TriggerConfig); err != nil {
			c.JSON(400, gin.H{"error": fmt.Sprintf("Invalid trigger config: %v", err)})
			return
		}
	}

	// Marshal JSON fields (convert to string for pq driver compatibility)
	var definitionStr interface{} = nil
	if req.Definition != nil {
		definitionBytes, err := json.Marshal(req.Definition)
		if err != nil {
			s.logger.Error("Failed to marshal definition", zap.Error(err))
			c.JSON(400, gin.H{"error": "Invalid definition JSON"})
			return
		}
		definitionStr = string(definitionBytes)
	}

	var inputSchemaStr interface{} = nil
	if req.InputSchema != nil {
		inputSchemaBytes, err := json.Marshal(req.InputSchema)
		if err != nil {
			s.logger.Error("Failed to marshal input schema", zap.Error(err))
			c.JSON(400, gin.H{"error": "Invalid input schema JSON"})
			return
		}
		inputSchemaStr = string(inputSchemaBytes)
	}

	var triggerConfigStr interface{} = nil
	if req.TriggerConfig != nil {
		triggerConfigBytes, err := json.Marshal(req.TriggerConfig)
		if err != nil {
			s.logger.Error("Failed to marshal trigger config", zap.Error(err))
			c.JSON(400, gin.H{"error": "Invalid trigger config JSON"})
			return
		}
		triggerConfigStr = string(triggerConfigBytes)
	}

	// Begin transaction for RLS context
	tx, err := s.db.Begin()
	if err != nil {
		s.logger.Error("Failed to begin transaction", zap.Error(err))
		c.JSON(500, gin.H{"error": "Failed to begin transaction"})
		return
	}
	defer tx.Rollback()

	// Set RLS context for tenant isolation (within transaction)
	escapedTenantID := strings.ReplaceAll(tenantID, "'", "''")
	setLocalQuery := fmt.Sprintf("SET LOCAL app.tenant_id = '%s'", escapedTenantID)
	if _, err := tx.Exec(setLocalQuery); err != nil {
		s.logger.Error("Failed to set tenant context", zap.Error(err))
		c.JSON(500, gin.H{"error": "Failed to set tenant context"})
		return
	}

	// Store in database
	query := `
		INSERT INTO workflow_registrations
		(id, tenant_id, name, description, workflow_type, workflow_class, task_queue, definition, input_schema, trigger_config, status)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active')
		RETURNING id, tenant_id, created_at
	`

	var id, returnedTenantID string
	var createdAt interface{}

	err = tx.QueryRow(query,
		req.ID, tenantID, req.Name, req.Description, req.WorkflowType, req.WorkflowClass, req.TaskQueue,
		definitionStr, inputSchemaStr, triggerConfigStr).Scan(&id, &returnedTenantID, &createdAt)

	if err != nil {
		s.logger.Error("Failed to register workflow", zap.Error(err))
		c.JSON(500, gin.H{"error": "Failed to register workflow"})
		return
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		s.logger.Error("Failed to commit transaction", zap.Error(err))
		c.JSON(500, gin.H{"error": "Failed to commit transaction"})
		return
	}

	c.JSON(201, gin.H{
		"id":         id,
		"tenant_id":  returnedTenantID,
		"created_at": createdAt,
	})
}

// ListWorkflows lists all workflows for a tenant
func (s *Service) ListWorkflows(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-ID")
	if tenantID == "" {
		tenantID = "default-tenant"
	}

	query := `
		SELECT id, name, description, workflow_type, task_queue, status, created_at
		FROM workflow_registrations
		WHERE tenant_id = $1
		ORDER BY created_at DESC
	`

	rows, err := s.db.Query(query, tenantID)
	if err != nil {
		s.logger.Error("Failed to list workflows", zap.Error(err))
		c.JSON(500, gin.H{"error": "Failed to list workflows"})
		return
	}
	defer rows.Close()

	var workflows []map[string]interface{}
	for rows.Next() {
		var id, name, description, workflowType, taskQueue, status string
		var createdAt interface{}

		if err := rows.Scan(&id, &name, &description, &workflowType, &taskQueue, &status, &createdAt); err != nil {
			s.logger.Error("Failed to scan workflow", zap.Error(err))
			continue
		}

		workflows = append(workflows, map[string]interface{}{
			"id":            id,
			"name":          name,
			"description":   description,
			"workflow_type": workflowType,
			"task_queue":    taskQueue,
			"status":        status,
			"created_at":    createdAt,
		})
	}

	c.JSON(200, gin.H{"workflows": workflows})
}

// GetWorkflow retrieves a single workflow
func (s *Service) GetWorkflow(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-ID")
	if tenantID == "" {
		tenantID = "default-tenant"
	}

	workflowID := c.Param("id")

	query := `
		SELECT id, name, description, workflow_type, workflow_class, task_queue, definition, input_schema, trigger_config, status, created_at
		FROM workflow_registrations
		WHERE id = $1 AND tenant_id = $2
	`

	var id, name, description, workflowType, taskQueue, status string
	var workflowClass, createdAt interface{}
	var definition, inputSchema, triggerConfig interface{}

	err := s.db.QueryRow(query, workflowID, tenantID).Scan(&id, &name, &description, &workflowType, &workflowClass, &taskQueue, &definition, &inputSchema, &triggerConfig, &status, &createdAt)

	if err == sql.ErrNoRows {
		c.JSON(404, gin.H{"error": "Workflow not found"})
		return
	} else if err != nil {
		s.logger.Error("Failed to get workflow", zap.Error(err))
		c.JSON(500, gin.H{"error": "Failed to get workflow"})
		return
	}

	c.JSON(200, gin.H{
		"id":              id,
		"name":            name,
		"description":     description,
		"workflow_type":   workflowType,
		"workflow_class":  workflowClass,
		"task_queue":      taskQueue,
		"definition":      definition,
		"input_schema":    inputSchema,
		"trigger_config":  triggerConfig,
		"status":          status,
		"created_at":      createdAt,
	})
}

// UpdateWorkflow updates a workflow registration
func (s *Service) UpdateWorkflow(c *gin.Context) {
	c.JSON(501, gin.H{"error": "Not implemented"})
}

// DeleteWorkflow deletes a workflow registration
func (s *Service) DeleteWorkflow(c *gin.Context) {
	c.JSON(501, gin.H{"error": "Not implemented"})
}

// TriggerWorkflow triggers a workflow run
func (s *Service) TriggerWorkflow(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-ID")
	if tenantID == "" {
		tenantID = "default-tenant"
	}

	workflowID := c.Param("id")

	var triggerReq map[string]interface{}
	if err := c.ShouldBindJSON(&triggerReq); err != nil {
		c.JSON(400, gin.H{"error": err.Error()})
		return
	}

	inputs := triggerReq["inputs"].(map[string]interface{})

	// Marshal inputs to JSON
	inputsJSON, err := json.Marshal(inputs)
	if err != nil {
		s.logger.Error("Failed to marshal inputs", zap.Error(err))
		c.JSON(400, gin.H{"error": "Invalid inputs JSON"})
		return
	}
	inputsStr := string(inputsJSON)

	// Generate run ID
	runID := uuid.New().String()

	// Begin transaction for RLS context
	tx, err := s.db.Begin()
	if err != nil {
		s.logger.Error("Failed to begin transaction", zap.Error(err))
		c.JSON(500, gin.H{"error": "Failed to begin transaction"})
		return
	}
	defer tx.Rollback()

	// Set RLS context for tenant isolation
	escapedTenantID := strings.ReplaceAll(tenantID, "'", "''")
	setLocalQuery := fmt.Sprintf("SET LOCAL app.tenant_id = '%s'", escapedTenantID)
	if _, err := tx.Exec(setLocalQuery); err != nil {
		s.logger.Error("Failed to set tenant context", zap.Error(err))
		c.JSON(500, gin.H{"error": "Failed to set tenant context"})
		return
	}

	// Create workflow run record
	query := `
		INSERT INTO workflow_runs
		(run_id, workflow_id, tenant_id, status, inputs, started_at)
		VALUES ($1, $2, $3, 'pending', $4, NOW())
		RETURNING run_id, status
	`

	var returnedRunID, status string
	err = tx.QueryRow(query, runID, workflowID, tenantID, inputsStr).Scan(&returnedRunID, &status)

	if err != nil {
		s.logger.Error("Failed to create workflow run", zap.Error(err))
		c.JSON(500, gin.H{"error": "Failed to trigger workflow"})
		return
	}

	// Commit transaction
	if err := tx.Commit(); err != nil {
		s.logger.Error("Failed to commit transaction", zap.Error(err))
		c.JSON(500, gin.H{"error": "Failed to commit transaction"})
		return
	}

	// Fetch workflow definition and dispatch to Temporal (async)
	workflow, err := s.getWorkflow(workflowID, tenantID)
	if err != nil {
		s.logger.Error("Failed to fetch workflow for dispatch", zap.Error(err))
		// Still return success since the run was created - dispatch just won't happen
	} else {
		go s.dispatchWorkflowRun(workflow, runID, inputs, tenantID)
	}

	c.JSON(201, gin.H{
		"run_id": returnedRunID,
		"status": status,
	})
}

// ListWorkflowRuns lists runs for a workflow
func (s *Service) ListWorkflowRuns(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-ID")
	if tenantID == "" {
		tenantID = "default-tenant"
	}

	workflowID := c.Param("id")

	query := `
		SELECT run_id, status, started_at, completed_at
		FROM workflow_runs
		WHERE workflow_id = $1 AND tenant_id = $2
		ORDER BY started_at DESC
		LIMIT 100
	`

	rows, err := s.db.Query(query, workflowID, tenantID)
	if err != nil {
		s.logger.Error("Failed to list runs", zap.Error(err))
		c.JSON(500, gin.H{"error": "Failed to list runs"})
		return
	}
	defer rows.Close()

	var runs []map[string]interface{}
	for rows.Next() {
		var runID, status string
		var startedAt, completedAt interface{}

		if err := rows.Scan(&runID, &status, &startedAt, &completedAt); err != nil {
			s.logger.Error("Failed to scan run", zap.Error(err))
			continue
		}

		runs = append(runs, map[string]interface{}{
			"run_id":       runID,
			"status":       status,
			"started_at":   startedAt,
			"completed_at": completedAt,
		})
	}

	c.JSON(200, gin.H{"runs": runs})
}

// GetWorkflowRun retrieves a single workflow run
func (s *Service) GetWorkflowRun(c *gin.Context) {
	tenantID := c.GetHeader("X-Tenant-ID")
	if tenantID == "" {
		tenantID = "default-tenant"
	}

	runID := c.Param("run_id")

	query := `
		SELECT run_id, workflow_id, status, step_results, output, error, started_at, completed_at
		FROM workflow_runs
		WHERE run_id = $1 AND tenant_id = $2
	`

	var returnedRunID, workflowID, status string
	var stepResults, output, error interface{}
	var startedAt, completedAt interface{}

	err := s.db.QueryRow(query, runID, tenantID).Scan(&returnedRunID, &workflowID, &status, &stepResults, &output, &error, &startedAt, &completedAt)

	if err == sql.ErrNoRows {
		c.JSON(404, gin.H{"error": "Workflow run not found"})
		return
	} else if err != nil {
		s.logger.Error("Failed to get run", zap.Error(err))
		c.JSON(500, gin.H{"error": "Failed to get run"})
		return
	}

	c.JSON(200, gin.H{
		"run_id":       returnedRunID,
		"workflow_id":  workflowID,
		"status":       status,
		"step_results": stepResults,
		"output":       output,
		"error":        error,
		"started_at":   startedAt,
		"completed_at": completedAt,
	})
}
