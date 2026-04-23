package store

// Callers must register a postgres driver before using NewPostgresStore.
// In main.go: import _ "github.com/lib/pq" or _ "github.com/jackc/pgx/v5/stdlib".

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/agent-platform/go-shared/pkg/models"
)

// PostgresStore is a PostgreSQL-backed implementation of Store.
type PostgresStore struct {
	db *sql.DB
}

func NewPostgresStore(db *sql.DB) (*PostgresStore, error) {
	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping db: %w", err)
	}
	return &PostgresStore{db: db}, nil
}

func (s *PostgresStore) Create(ctx context.Context, c *models.SubAgentContract) error {
	skills, _ := json.Marshal(c.AllowedSkills)
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO sub_agent_contracts
			(id, tenant_id, name, version, persona, allowed_skills, model, max_iterations,
			 input_schema, output_schema, status, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
		c.ID, c.TenantID, c.Name, c.Version, c.Persona, skills,
		c.Model, c.MaxIterations, nullJSON(c.InputSchema), nullJSON(c.OutputSchema),
		string(c.Status), time.Now(),
	)
	return err
}

func (s *PostgresStore) GetByID(ctx context.Context, id, tenantID string) (*models.SubAgentContract, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, tenant_id, name, version, persona, allowed_skills, model,
		       max_iterations, input_schema, output_schema, status, created_at
		FROM sub_agent_contracts
		WHERE id = $1 AND tenant_id = $2`, id, tenantID)
	return scanContract(row)
}

func (s *PostgresStore) List(ctx context.Context, f ListFilter) ([]*models.SubAgentContract, error) {
	q := `SELECT id, tenant_id, name, version, persona, allowed_skills, model,
		         max_iterations, input_schema, output_schema, status, created_at
		  FROM sub_agent_contracts WHERE tenant_id = $1`
	args := []any{f.TenantID}
	if f.Status != "" {
		q += " AND status = $2"
		args = append(args, f.Status)
	}
	rows, err := s.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []*models.SubAgentContract
	for rows.Next() {
		c, err := scanContract(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *PostgresStore) Update(ctx context.Context, c *models.SubAgentContract) error {
	skills, _ := json.Marshal(c.AllowedSkills)
	res, err := s.db.ExecContext(ctx, `
		UPDATE sub_agent_contracts
		SET name=$1, version=$2, persona=$3, allowed_skills=$4, model=$5,
		    max_iterations=$6, input_schema=$7, output_schema=$8, status=$9
		WHERE id=$10 AND tenant_id=$11`,
		c.Name, c.Version, c.Persona, skills, c.Model, c.MaxIterations,
		nullJSON(c.InputSchema), nullJSON(c.OutputSchema), string(c.Status),
		c.ID, c.TenantID,
	)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *PostgresStore) Transition(ctx context.Context, id, tenantID string, target models.ResourceStatus, actor, reason string) error {
	c, err := s.GetByID(ctx, id, tenantID)
	if err != nil {
		return err
	}
	if err := validateTransition(c.Status, target); err != nil {
		return err
	}
	res, err := s.db.ExecContext(ctx,
		`UPDATE sub_agent_contracts SET status=$1 WHERE id=$2 AND tenant_id=$3`,
		string(target), id, tenantID,
	)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return ErrNotFound
	}
	// Emit lifecycle event (best-effort; failure is non-fatal).
	s.db.ExecContext(ctx, `
		INSERT INTO lifecycle_events (resource_type, resource_id, tenant_id, from_state, to_state, actor, reason)
		VALUES ('sub_agent', $1, $2, $3, $4, $5, $6)`,
		id, tenantID, string(c.Status), string(target), actor, reason,
	)
	return nil
}

// scanner is implemented by both *sql.Row and *sql.Rows.
type scanner interface {
	Scan(dest ...any) error
}

func scanContract(s scanner) (*models.SubAgentContract, error) {
	var c models.SubAgentContract
	var skills []byte
	var inputSchema, outputSchema sql.NullString
	err := s.Scan(
		&c.ID, &c.TenantID, &c.Name, &c.Version, &c.Persona, &skills,
		&c.Model, &c.MaxIterations, &inputSchema, &outputSchema, &c.Status, &c.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	json.Unmarshal(skills, &c.AllowedSkills)
	if inputSchema.Valid {
		c.InputSchema = json.RawMessage(inputSchema.String)
	}
	if outputSchema.Valid {
		c.OutputSchema = json.RawMessage(outputSchema.String)
	}
	return &c, nil
}

func nullJSON(b json.RawMessage) sql.NullString {
	if len(b) == 0 {
		return sql.NullString{}
	}
	return sql.NullString{String: string(b), Valid: true}
}
