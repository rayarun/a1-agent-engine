package test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/agent-platform/api-gateway/pkg/service"
	"github.com/stretchr/testify/assert"
)

func TestHealthCheck(t *testing.T) {
	h := &service.GatewayHandler{InitiatorURL: "http://unused"}

	req, err := http.NewRequest(http.MethodGet, "/health", nil)
	if err != nil {
		t.Fatal(err)
	}

	rr := httptest.NewRecorder()
	http.HandlerFunc(h.HandleHealth).ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, "API Gateway is healthy\n", rr.Body.String())
}
