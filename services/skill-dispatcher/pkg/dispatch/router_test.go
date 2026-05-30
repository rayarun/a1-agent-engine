package dispatch_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/agent-platform/go-shared/pkg/models"
	"github.com/agent-platform/skill-dispatcher/pkg/dispatch"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The bash tool must run in the hardened sandbox (sandbox-manager), not a bare
// bash-executor. It should POST {code, language:"bash"} to /api/v1/execute.
func TestRoute_BashGoesToSandboxManager(t *testing.T) {
	var gotPath string
	var gotBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"result":"hi\n"}`))
	}))
	defer srv.Close()

	t.Setenv("SANDBOX_MANAGER_URL", srv.URL)
	router := dispatch.NewToolExecutorRouter()

	// The model fills the bash command under "command"; accept that.
	res, err := router.Route(context.Background(), models.ToolRef{Name: "bash"},
		map[string]any{"command": "echo hi"})
	require.NoError(t, err)

	assert.Equal(t, "/api/v1/execute", gotPath, "bash must hit the sandbox execute endpoint")
	assert.Equal(t, "bash", gotBody["language"])
	assert.Equal(t, "echo hi", gotBody["code"])
	assert.NotNil(t, res)
}

// Also accept the legacy "script" arg name.
func TestRoute_BashAcceptsScriptArg(t *testing.T) {
	var gotBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		_, _ = w.Write([]byte(`{"result":"ok"}`))
	}))
	defer srv.Close()

	t.Setenv("SANDBOX_MANAGER_URL", srv.URL)
	router := dispatch.NewToolExecutorRouter()

	_, err := router.Route(context.Background(), models.ToolRef{Name: "bash"},
		map[string]any{"script": "ls -la"})
	require.NoError(t, err)
	assert.Equal(t, "ls -la", gotBody["code"])
	assert.Equal(t, "bash", gotBody["language"])
}
