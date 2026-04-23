package store

import (
	"context"
	"errors"
	"sync"

	"github.com/agent-platform/go-shared/pkg/models"
)

var ErrNotFound = errors.New("sub-agent contract not found")

// ListFilter constrains the result set of List.
type ListFilter struct {
	Status   string // empty means all statuses
	TenantID string // required
}

// Store is the persistence interface for SubAgentContract records.
type Store interface {
	Create(ctx context.Context, contract *models.SubAgentContract) error
	GetByID(ctx context.Context, id, tenantID string) (*models.SubAgentContract, error)
	List(ctx context.Context, f ListFilter) ([]*models.SubAgentContract, error)
	Update(ctx context.Context, contract *models.SubAgentContract) error
	Transition(ctx context.Context, id, tenantID string, target models.ResourceStatus, actor, reason string) error
}

// InMemoryStore is a thread-safe, map-backed Store for use in tests.
type InMemoryStore struct {
	mu      sync.RWMutex
	records map[string]*models.SubAgentContract
}

func NewInMemoryStore() *InMemoryStore {
	return &InMemoryStore{records: make(map[string]*models.SubAgentContract)}
}

func (s *InMemoryStore) Create(_ context.Context, c *models.SubAgentContract) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	cp := *c
	s.records[c.ID] = &cp
	return nil
}

func (s *InMemoryStore) GetByID(_ context.Context, id, tenantID string) (*models.SubAgentContract, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	c, ok := s.records[id]
	if !ok || c.TenantID != tenantID {
		return nil, ErrNotFound
	}
	cp := *c
	return &cp, nil
}

func (s *InMemoryStore) List(_ context.Context, f ListFilter) ([]*models.SubAgentContract, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var out []*models.SubAgentContract
	for _, c := range s.records {
		if c.TenantID != f.TenantID {
			continue
		}
		if f.Status != "" && string(c.Status) != f.Status {
			continue
		}
		cp := *c
		out = append(out, &cp)
	}
	return out, nil
}

func (s *InMemoryStore) Update(_ context.Context, c *models.SubAgentContract) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	existing, ok := s.records[c.ID]
	if !ok || existing.TenantID != c.TenantID {
		return ErrNotFound
	}
	cp := *c
	s.records[c.ID] = &cp
	return nil
}

func (s *InMemoryStore) Transition(_ context.Context, id, tenantID string, target models.ResourceStatus, _, _ string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	c, ok := s.records[id]
	if !ok || c.TenantID != tenantID {
		return ErrNotFound
	}
	if err := validateTransition(c.Status, target); err != nil {
		return err
	}
	c.Status = target
	return nil
}

// validTransitions defines the allowed state machine edges for sub-agent contracts.
var validTransitions = map[models.ResourceStatus][]models.ResourceStatus{
	models.StatusDraft:    {models.StatusStaged},
	models.StatusStaged:   {models.StatusActive, models.StatusDraft},
	models.StatusActive:   {models.StatusPaused, models.StatusArchived},
	models.StatusPaused:   {models.StatusActive, models.StatusArchived},
	models.StatusArchived: {},
}

func validateTransition(from, to models.ResourceStatus) error {
	allowed, ok := validTransitions[from]
	if !ok {
		return errors.New("unknown source state: " + string(from))
	}
	for _, a := range allowed {
		if a == to {
			return nil
		}
	}
	return errors.New("invalid transition: " + string(from) + " → " + string(to))
}
