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
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sashabaranov/go-openai"
)

type modelInfo struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type modelsResponse struct {
	Models []modelInfo `json:"models"`
}

type remoteModelsResponse struct {
	Data []struct {
		ID string `json:"id"`
	} `json:"data"`
}

type configResponse struct {
	AnthropicBaseURL string `json:"anthropic_base_url"`
	AnthropicKeySet  bool   `json:"anthropic_key_set"`
	OpenAIKeySet     bool   `json:"openai_key_set"`
	GoogleKeySet     bool   `json:"google_key_set"`
	Mode             string `json:"mode"`
}

type configRequest struct {
	AnthropicAPIKey  string `json:"anthropic_api_key"`
	AnthropicBaseURL string `json:"anthropic_base_url"`
	OpenAIAPIKey     string `json:"openai_api_key"`
	GoogleAPIKey     string `json:"google_api_key"`
}

// Anthropic API types
type anthropicRequest struct {
	Model     string             `json:"model"`
	Messages  []anthropicMessage `json:"messages"`
	System    string             `json:"system,omitempty"`
	MaxTokens int                `json:"max_tokens"`
	Tools     []anthropicTool    `json:"tools,omitempty"`
}

type anthropicMessage struct {
	Role    string             `json:"role"`
	Content []anthropicContent `json:"content"`
}

type anthropicContent struct {
	Type      string                `json:"type"`
	Text      string                `json:"text,omitempty"`
	ID        string                `json:"id,omitempty"`
	Name      string                `json:"name,omitempty"`
	Input     interface{}           `json:"input,omitempty"`
	ToolUseID string                `json:"tool_use_id,omitempty"`
	Content   []anthropicResultPart `json:"content,omitempty"`
}

type anthropicResultPart struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type anthropicTool struct {
	Name        string      `json:"name"`
	Description string      `json:"description,omitempty"`
	InputSchema interface{} `json:"input_schema"`
}

type anthropicResponse struct {
	ID      string             `json:"id"`
	Model   string             `json:"model"`
	Content []anthropicContent `json:"content"`
	Usage   struct {
		InputTokens  int `json:"input_tokens"`
		OutputTokens int `json:"output_tokens"`
	} `json:"usage"`
}

var (
	mu           sync.RWMutex
	dbPool       *pgxpool.Pool
	openaiClient *openai.Client
	anthropicKey string
	anthropicURL string
	openaiKey    string
	googleKey    string
	liteLLMURL   string
)

func init() {
	// Initialize liteLLM URL (configurable for corporate proxies)
	if url := os.Getenv("LITELLM_PROXY_URL"); url != "" {
		liteLLMURL = url
		log.Printf("LLM Gateway: Using custom liteLLM proxy: %s", url)
	} else {
		liteLLMURL = "http://litellm:8000"
		log.Println("LLM Gateway: Using default liteLLM sidecar URL")
	}

	// Initialize database
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:postgres@localhost:5433/agentplatform"
	}

	var err error
	dbPool, err = pgxpool.New(context.Background(), dbURL)
	if err != nil {
		log.Printf("LLM Gateway: Warning - could not connect to database: %v (running in memory-only mode)", err)
		dbPool = nil
	} else {
		log.Println("LLM Gateway: Database connected")
	}

	// Load initial config from env or DB
	loadConfig()

	mu.RLock()
	log.Printf("LLM Gateway: Config loaded - anthropicURL=%s, anthropicKey_set=%v", anthropicURL, anthropicKey != "")
	mu.RUnlock()

	if openaiClient == nil && anthropicKey == "" {
		log.Println("LLM Gateway: Running in Mock only mode (no API keys)")
	}
}

func loadConfig() {
	// Try to load from DB first
	if dbPool != nil {
		if err := loadConfigFromDB(); err != nil {
			log.Printf("LLM Gateway: Failed to load config from DB: %v, falling back to env vars", err)
			loadConfigFromEnv()
		} else {
			// DB load succeeded, but fill in missing values from env vars
			fillMissingFromEnv()
		}
	} else {
		loadConfigFromEnv()
	}
}

func fillMissingFromEnv() {
	// Prefer env vars for API keys and URLs
	if envKey := os.Getenv("ANTHROPIC_API_KEY"); envKey != "" {
		anthropicKey = envKey
		keyPreview := envKey[:10] + "..." + envKey[len(envKey)-10:]
		log.Printf("LLM Gateway: Anthropic API Key loaded from env (preview: %s)", keyPreview)
	}
	if envURL := os.Getenv("ANTHROPIC_BASE_URL"); envURL != "" {
		anthropicURL = envURL
		log.Printf("LLM Gateway: Using custom Anthropic URL from env: %s", anthropicURL)
	} else if anthropicURL == "" {
		anthropicURL = "https://api.anthropic.com/v1/messages"
		log.Println("LLM Gateway: Using default Anthropic URL")
	}

	// Update liteLLM URL to match anthropic URL (for corporate proxy support)
	if anthropicURL != "https://api.anthropic.com/v1/messages" && anthropicURL != "" {
		liteLLMURL = anthropicURL
		log.Printf("LLM Gateway: Updated liteLLM proxy URL to corporate proxy: %s", liteLLMURL)
	}

	if envKey := os.Getenv("OPENAI_API_KEY"); envKey != "" {
		openaiKey = envKey
		openaiClient = openai.NewClient(openaiKey)
		log.Println("LLM Gateway: OpenAI client initialized from env")
	}
	if envKey := os.Getenv("GOOGLE_API_KEY"); envKey != "" {
		googleKey = envKey
		log.Println("LLM Gateway: Google API Key loaded from env")
	}
}

func loadConfigFromEnv() {
	anthropicKey = os.Getenv("ANTHROPIC_API_KEY")
	anthropicURL = os.Getenv("ANTHROPIC_BASE_URL")
	openaiKey = os.Getenv("OPENAI_API_KEY")
	googleKey = os.Getenv("GOOGLE_API_KEY")

	if anthropicKey != "" {
		keyPreview := anthropicKey[:10] + "..." + anthropicKey[len(anthropicKey)-10:]
		log.Printf("LLM Gateway: Anthropic API Key loaded from env (preview: %s)", keyPreview)
	} else {
		log.Println("LLM Gateway: ANTHROPIC_API_KEY not set")
	}

	if anthropicURL == "" {
		anthropicURL = "https://api.anthropic.com/v1/messages"
		log.Println("LLM Gateway: Using default Anthropic URL")
	} else {
		log.Printf("LLM Gateway: Using custom Anthropic URL: %s", anthropicURL)
	}

	if openaiKey != "" {
		openaiClient = openai.NewClient(openaiKey)
		log.Println("LLM Gateway: OpenAI client initialized from env")
	}

	if googleKey != "" {
		log.Println("LLM Gateway: Google API Key loaded from env")
	}
}

func loadConfigFromDB() error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	rows, err := dbPool.Query(ctx, `SELECT key, value FROM platform_config`)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err != nil {
			return err
		}

		switch key {
		case "anthropic_api_key":
			anthropicKey = value
		case "anthropic_base_url":
			anthropicURL = value
		case "openai_api_key":
			openaiKey = value
		case "google_api_key":
			googleKey = value
		}
	}

	if anthropicURL == "" {
		anthropicURL = "https://api.anthropic.com/v1/messages"
	} else {
		// Update liteLLM URL to match corporate proxy URL from DB
		liteLLMURL = anthropicURL
		log.Printf("LLM Gateway: Using corporate proxy from DB: %s", liteLLMURL)
	}

	if openaiKey != "" {
		openaiClient = openai.NewClient(openaiKey)
		log.Println("LLM Gateway: OpenAI client initialized from DB")
	}

	if googleKey != "" {
		log.Println("LLM Gateway: Google API Key loaded from DB")
	}

	log.Println("LLM Gateway: Config loaded from DB")
	return nil
}

func fetchRemoteModels() ([]string, error) {
	mu.RLock()
	key := anthropicKey
	url := anthropicURL
	mu.RUnlock()

	if key == "" || url == "" {
		return nil, fmt.Errorf("anthropic not configured")
	}

	modelsURL := strings.TrimSuffix(url, "/messages") + "/models"

	client := &http.Client{Timeout: 5 * time.Second}
	req, _ := http.NewRequest("GET", modelsURL, nil)
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", key))
	req.Header.Set("anthropic-version", "2023-06-01")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("status %d: %s", resp.StatusCode, string(body))
	}

	var remoteResp remoteModelsResponse
	if err := json.NewDecoder(resp.Body).Decode(&remoteResp); err != nil {
		return nil, fmt.Errorf("decode failed: %v", err)
	}

	var models []string
	for _, m := range remoteResp.Data {
		if m.ID != "" {
			models = append(models, m.ID)
		}
	}
	return models, nil
}

func getMode() string {
	mu.RLock()
	defer mu.RUnlock()

	if anthropicKey == "" {
		return "mock"
	}
	if anthropicURL != "https://api.anthropic.com/v1/messages" {
		return "custom"
	}
	return "anthropic"
}

func handleGetConfig(w http.ResponseWriter, r *http.Request) {
	mu.RLock()
	defer mu.RUnlock()

	resp := configResponse{
		AnthropicBaseURL: anthropicURL,
		AnthropicKeySet:  anthropicKey != "",
		OpenAIKeySet:     openaiClient != nil,
		GoogleKeySet:     googleKey != "",
		Mode:             getMode(),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func handlePutConfig(w http.ResponseWriter, r *http.Request) {
	var req configRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	mu.Lock()
	if req.AnthropicAPIKey != "" {
		anthropicKey = req.AnthropicAPIKey
		log.Println("LLM Gateway: Updated ANTHROPIC_API_KEY")
		if dbPool != nil {
			go persistConfigToDB("anthropic_api_key", anthropicKey)
		}
	}

	if req.AnthropicBaseURL != "" {
		anthropicURL = req.AnthropicBaseURL
		log.Printf("LLM Gateway: Updated ANTHROPIC_BASE_URL to %s", anthropicURL)
		if dbPool != nil {
			go persistConfigToDB("anthropic_base_url", anthropicURL)
		}
	}

	if req.OpenAIAPIKey != "" {
		openaiKey = req.OpenAIAPIKey
		openaiClient = openai.NewClient(openaiKey)
		log.Println("LLM Gateway: Updated OPENAI_API_KEY")
		if dbPool != nil {
			go persistConfigToDB("openai_api_key", openaiKey)
		}
	}

	if req.GoogleAPIKey != "" {
		googleKey = req.GoogleAPIKey
		log.Println("LLM Gateway: Updated GOOGLE_API_KEY")
		if dbPool != nil {
			go persistConfigToDB("google_api_key", googleKey)
		}
	}

	baseURL := anthropicURL
	keySet := anthropicKey != ""
	openaiSet := openaiClient != nil
	googleSet := googleKey != ""
	mu.Unlock()

	mode := getMode()

	resp := configResponse{
		AnthropicBaseURL: baseURL,
		AnthropicKeySet:  keySet,
		OpenAIKeySet:     openaiSet,
		GoogleKeySet:     googleSet,
		Mode:             mode,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func persistConfigToDB(key, value string) {
	if dbPool == nil {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	_, err := dbPool.Exec(ctx, `
		INSERT INTO platform_config (key, value, updated_at)
		VALUES ($1, $2, NOW())
		ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()
	`, key, value)

	if err != nil {
		log.Printf("LLM Gateway: Failed to persist config to DB: %v", err)
	} else {
		log.Printf("LLM Gateway: Persisted config %s to DB", key)
	}
}

func main() {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", handleHealth)
	mux.HandleFunc("GET /v1/models", handleModels)
	mux.HandleFunc("POST /v1/chat/completions", handleChatCompletions)
	mux.HandleFunc("POST /v1/embeddings", handleEmbeddings)
	mux.HandleFunc("GET /admin/config", handleGetConfig)
	mux.HandleFunc("PUT /admin/config", handlePutConfig)

	log.Println("Starting LLM Gateway on :8083")
	if err := http.ListenAndServe(":8083", withCORS(mux)); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, x-tenant-id")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func handleEmbeddings(w http.ResponseWriter, r *http.Request) {
	var req openai.EmbeddingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	log.Printf("-> Routing embeddings to liteLLM: model=%s", req.Model)

	body, err := json.Marshal(req)
	if err != nil {
		http.Error(w, fmt.Sprintf("Request marshaling error: %v", err), http.StatusBadRequest)
		return
	}

	// Construct endpoint URL - if already includes /messages or /embeddings, use as-is
	proxyURL := liteLLMURL
	if !strings.Contains(proxyURL, "/messages") && !strings.Contains(proxyURL, "/embeddings") {
		proxyURL = proxyURL + "/v1/embeddings"
	}

	httpReq, err := http.NewRequest("POST", proxyURL, bytes.NewBuffer(body))
	if err != nil {
		http.Error(w, fmt.Sprintf("HTTP request error: %v", err), http.StatusInternalServerError)
		return
	}

	httpReq.Header.Set("Content-Type", "application/json")

	// Add authentication for corporate proxy
	mu.RLock()
	key := anthropicKey
	mu.RUnlock()
	if key != "" {
		httpReq.Header.Set("x-api-key", key)
	}

	client := &http.Client{Timeout: 30 * time.Second}
	httpResp, err := client.Do(httpReq)
	if err != nil {
		log.Printf("liteLLM embeddings request failed: %v", err)
		http.Error(w, fmt.Sprintf("liteLLM error: %v", err), http.StatusInternalServerError)
		return
	}
	defer httpResp.Body.Close()

	if httpResp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(httpResp.Body)
		log.Printf("liteLLM embeddings error (%d): %s", httpResp.StatusCode, string(respBody))
		http.Error(w, fmt.Sprintf("liteLLM API error (%d)", httpResp.StatusCode), httpResp.StatusCode)
		return
	}

	var resp openai.EmbeddingResponse
	if err := json.NewDecoder(httpResp.Body).Decode(&resp); err != nil {
		http.Error(w, fmt.Sprintf("Response decode error: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

type liteLLMRequest struct {
	Model       string             `json:"model"`
	Messages    []openai.ChatCompletionMessage `json:"messages"`
	MaxTokens   int                `json:"max_tokens,omitempty"`
	Temperature float32            `json:"temperature,omitempty"`
	Tools       []openai.Tool      `json:"tools,omitempty"`
}

type liteLLMCostTrackingResponse struct {
	ID      string                        `json:"id"`
	Model   string                        `json:"model"`
	Choices []openai.ChatCompletionChoice `json:"choices"`
	Usage   openai.Usage                  `json:"usage"`
}

func trackLLMCost(ctx context.Context, req openai.ChatCompletionRequest, resp openai.ChatCompletionResponse) {
	if dbPool == nil {
		return
	}

	// Extract provider and determine cost (basic: 0.01 per 1k input, 0.03 per 1k output)
	provider := "unknown"
	costPerInputMill := 10    // cents per 1M input tokens
	costPerOutputMill := 30   // cents per 1M output tokens

	if strings.Contains(req.Model, "claude") {
		provider = "anthropic"
		costPerInputMill = 3     // ~$3 per 1M input
		costPerOutputMill = 15   // ~$15 per 1M output
	} else if strings.Contains(req.Model, "gpt") {
		provider = "openai"
		costPerInputMill = 5
		costPerOutputMill = 15
	} else if strings.Contains(req.Model, "gemini") {
		provider = "google"
		costPerInputMill = 0     // Google pricing varies
		costPerOutputMill = 0
	}

	costUSDCents := (resp.Usage.PromptTokens * costPerInputMill / 1000000) +
		(resp.Usage.CompletionTokens * costPerOutputMill / 1000000)

	go func() {
		execCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		_, err := dbPool.Exec(execCtx, `
			INSERT INTO llm_cost_events
			(tenant_id, provider, model, input_tokens, output_tokens, cost_usd_cents, status)
			VALUES ($1, $2, $3, $4, $5, $6, 'success')
		`, "default-tenant", provider, req.Model, resp.Usage.PromptTokens, resp.Usage.CompletionTokens, costUSDCents)

		if err != nil {
			log.Printf("Failed to track LLM cost: %v", err)
		}
	}()
}

func handleAnthropicInference(w http.ResponseWriter, req openai.ChatCompletionRequest) {
	startTime := time.Now()
	log.Printf("[TIMING] Anthropic Inference START: model=%s", req.Model)

	mu.RLock()
	key := anthropicKey
	url := anthropicURL
	mu.RUnlock()

	antReq := anthropicRequest{
		Model:     req.Model,
		MaxTokens: req.MaxTokens,
	}
	if antReq.MaxTokens == 0 {
		antReq.MaxTokens = 1024
	}

	// Translate Tools
	for _, t := range req.Tools {
		if t.Type == openai.ToolTypeFunction {
			antReq.Tools = append(antReq.Tools, anthropicTool{
				Name:        t.Function.Name,
				Description: t.Function.Description,
				InputSchema: t.Function.Parameters,
			})
		}
	}

	// Translate Messages
	for _, msg := range req.Messages {
		if msg.Role == openai.ChatMessageRoleSystem {
			antReq.System = msg.Content
			continue
		}

		role := "user"
		if msg.Role == openai.ChatMessageRoleAssistant {
			role = "assistant"
		}

		var contents []anthropicContent
		if msg.Content != "" {
			contents = append(contents, anthropicContent{Type: "text", Text: msg.Content})
		}

		// Tool Calls (Assistant -> User)
		for _, tc := range msg.ToolCalls {
			var args map[string]interface{}
			json.Unmarshal([]byte(tc.Function.Arguments), &args)
			contents = append(contents, anthropicContent{
				Type:  "tool_use",
				ID:    tc.ID,
				Name:  tc.Function.Name,
				Input: args,
			})
		}

		// Tool Results (Tool -> Assistant)
		if msg.Role == openai.ChatMessageRoleTool {
			role = "user"
			contents = append(contents, anthropicContent{
				Type:      "tool_result",
				ToolUseID: msg.ToolCallID,
				Content:   []anthropicResultPart{{Type: "text", Text: msg.Content}},
			})
		}

		antReq.Messages = append(antReq.Messages, anthropicMessage{
			Role:    role,
			Content: contents,
		})
	}

	// Execute HTTP Request
	body, _ := json.Marshal(antReq)
	httpReq, _ := http.NewRequest("POST", url, bytes.NewBuffer(body))
	httpReq.Header.Set("Content-Type", "application/json")
	keyToUse := fmt.Sprintf("Bearer %s", key)
	keyPreview := key[:10] + "..." + key[len(key)-10:]
	log.Printf("=== Anthropic Request ===")
	log.Printf("URL: %s", url)
	log.Printf("Model: %s", antReq.Model)
	log.Printf("Auth Key: %s", keyPreview)
	httpReq.Header.Set("Authorization", keyToUse)
	httpReq.Header.Set("anthropic-version", "2023-06-01")

	client := &http.Client{Timeout: 2 * time.Minute}
	reqTime := time.Now()
	resp, err := client.Do(httpReq)
	if err != nil {
		log.Printf("=== Anthropic Request FAILED ===")
		log.Printf("HTTP Error: %v", err)
		handleMockInference(w, req)
		return
	}
	httpTime := time.Since(reqTime).Milliseconds()
	defer resp.Body.Close()

	log.Printf("=== Anthropic Response ===")
	log.Printf("Status Code: %d", resp.StatusCode)
	log.Printf("[TIMING] HTTP request completed in %dms", httpTime)

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		log.Printf("Error Body: %s", string(respBody))
		handleMockInference(w, req)
		return
	}

	decodeTime := time.Now()
	var antResp anthropicResponse
	json.NewDecoder(resp.Body).Decode(&antResp)
	decodeMs := time.Since(decodeTime).Milliseconds()
	totalMs := time.Since(startTime).Milliseconds()
	log.Printf("[TIMING] Response decoded in %dms, total time: %dms", decodeMs, totalMs)

	// Translate Back to OpenAI
	openaiResp := openai.ChatCompletionResponse{
		ID:     antResp.ID,
		Object: "chat.completion",
		Model:  antResp.Model,
		Choices: []openai.ChatCompletionChoice{
			{
				Index: 0,
				Message: openai.ChatCompletionMessage{
					Role: openai.ChatMessageRoleAssistant,
				},
			},
		},
		Usage: openai.Usage{
			PromptTokens:     antResp.Usage.InputTokens,
			CompletionTokens: antResp.Usage.OutputTokens,
			TotalTokens:      antResp.Usage.InputTokens + antResp.Usage.OutputTokens,
		},
	}

	for _, c := range antResp.Content {
		if c.Type == "text" {
			openaiResp.Choices[0].Message.Content = c.Text
		}
		if c.Type == "tool_use" {
			args, _ := json.Marshal(c.Input)
			openaiResp.Choices[0].Message.ToolCalls = append(openaiResp.Choices[0].Message.ToolCalls, openai.ToolCall{
				ID:   c.ID,
				Type: openai.ToolTypeFunction,
				Function: openai.FunctionCall{
					Name:      c.Name,
					Arguments: string(args),
				},
			})
			openaiResp.Choices[0].FinishReason = openai.FinishReasonToolCalls
		}
	}

	if openaiResp.Choices[0].FinishReason == "" {
		openaiResp.Choices[0].FinishReason = openai.FinishReasonStop
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(openaiResp)
}

func handleChatCompletions(w http.ResponseWriter, r *http.Request) {
	var req openai.ChatCompletionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	log.Printf("=== handleChatCompletions START: model=%s ===", req.Model)

	// Mock mode for testing
	if strings.Contains(req.Model, "mock") {
		log.Println("-> Routing to Mock (model contains 'mock')")
		handleMockInference(w, req)
		return
	}

	mu.RLock()
	anthropicURL_ := anthropicURL
	anthropicKey_ := anthropicKey
	mu.RUnlock()

	usingCorporateProxy := anthropicKey_ != "" && anthropicURL_ != "https://api.anthropic.com/v1/messages" && anthropicURL_ != ""

	log.Printf("DEBUG: usingCorporateProxy=%v, isClaudeModel=%v, anthropicURL_=%s",
		usingCorporateProxy, strings.Contains(req.Model, "claude"), anthropicURL_)

	// When using corporate proxy, route ALL models through native handler
	// (corporate proxy expects Anthropic format, not OpenAI format)
	if usingCorporateProxy {
		if strings.Contains(req.Model, "claude") {
			log.Println("-> Routing to Anthropic via corporate proxy (native format)")
			handleAnthropicInference(w, req)
			return
		}
		// For non-Claude models with corporate proxy, we can't use OpenAI format
		// Fall back to mock since the proxy expects Anthropic format
		log.Printf("-> Corporate proxy in use but model is not Claude (%s), falling back to mock", req.Model)
		handleMockInference(w, req)
		return
	}

	// When using platform liteLLM (no corporate proxy), route via OpenAI format
	log.Printf("-> Routing to platform liteLLM: model=%s, url=%s", req.Model, liteLLMURL)
	liteLLMReq := liteLLMRequest{
		Model:       req.Model,
		Messages:    req.Messages,
		MaxTokens:   req.MaxTokens,
		Temperature: req.Temperature,
		Tools:       req.Tools,
	}

	body, err := json.Marshal(liteLLMReq)
	if err != nil {
		http.Error(w, fmt.Sprintf("Request marshaling error: %v", err), http.StatusBadRequest)
		return
	}

	// Construct endpoint URL - if already includes /messages or /chat/completions, use as-is
	proxyURL := liteLLMURL
	if !strings.Contains(proxyURL, "/messages") && !strings.Contains(proxyURL, "/chat/completions") {
		proxyURL = proxyURL + "/v1/chat/completions"
	}
	log.Printf("-> Final request URL: %s", proxyURL)

	httpReq, err := http.NewRequest("POST", proxyURL, bytes.NewBuffer(body))
	if err != nil {
		log.Printf("liteLLM request creation error: %v (falling back to mock)", err)
		handleMockInference(w, req)
		return
	}

	httpReq.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 2 * time.Minute}
	startTime := time.Now()
	httpResp, err := client.Do(httpReq)
	if err != nil {
		log.Printf("liteLLM request failed: %v (falling back to mock)", err)
		handleMockInference(w, req)
		return
	}
	httpTime := time.Since(startTime).Milliseconds()
	defer httpResp.Body.Close()

	log.Printf("[TIMING] liteLLM HTTP request completed in %dms", httpTime)

	if httpResp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(httpResp.Body)
		log.Printf("liteLLM error (%d): %s (falling back to mock)", httpResp.StatusCode, string(respBody))
		handleMockInference(w, req)
		return
	}

	decodeTime := time.Now()
	var resp openai.ChatCompletionResponse
	if err := json.NewDecoder(httpResp.Body).Decode(&resp); err != nil {
		log.Printf("liteLLM response decode error: %v (falling back to mock)", err)
		handleMockInference(w, req)
		return
	}
	decodeMs := time.Since(decodeTime).Milliseconds()
	log.Printf("[TIMING] liteLLM response decoded in %dms", decodeMs)

	// Track cost asynchronously
	trackLLMCost(r.Context(), req, resp)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func handleMockInference(w http.ResponseWriter, req openai.ChatCompletionRequest) {
	log.Printf("Mock Inference: Handling request for model %s", req.Model)

	// Simple heuristic: If the last message contains a math question, return a tool call.
	lastMsg := req.Messages[len(req.Messages)-1].Content
	
	var resp openai.ChatCompletionResponse
	resp.ID = "mock-resp-123"
	resp.Object = "chat.completion"
	resp.Model = req.Model
	resp.Choices = []openai.ChatCompletionChoice{
		{
			Index: 0,
			Message: openai.ChatCompletionMessage{
				Role: openai.ChatMessageRoleAssistant,
			},
			FinishReason: openai.FinishReasonStop,
		},
	}

	// Deterministic Mock Logic for Reasoning Traces
	if strings.Contains(lastMsg, "*") || strings.Contains(lastMsg, "calculate") {
		// Mock a Tool Call for 'execute_code'
		resp.Choices[0].Message.ToolCalls = []openai.ToolCall{
			{
				ID:   "call_abc123",
				Type: openai.ToolTypeFunction,
				Function: openai.FunctionCall{
					Name:      "execute_code",
					Arguments: `{"code": "print(1234 * 5678)"}`,
				},
			},
		}
		resp.Choices[0].FinishReason = openai.FinishReasonToolCalls
	} else {
		resp.Choices[0].Message.Content = "I am a mock LLM. I've analyzed your request and determined no tools are needed."
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}


func handleModels(w http.ResponseWriter, r *http.Request) {
	var models []modelInfo

	if remoteModels, err := fetchRemoteModels(); err == nil {
		for _, id := range remoteModels {
			models = append(models, modelInfo{ID: id, Name: id})
		}
		log.Printf("LLM Gateway: Fetched %d models from remote endpoint", len(remoteModels))
	} else {
		log.Printf("LLM Gateway: Failed to fetch remote models (%v), using fallback", err)

		mu.RLock()
		hasAnthropicKey := anthropicKey != ""
		mu.RUnlock()

		if hasAnthropicKey {
			models = append(models,
				modelInfo{"claude-opus-4-7", "Claude Opus 4.7"},
				modelInfo{"claude-sonnet-4-6", "Claude Sonnet 4.6"},
				modelInfo{"claude-haiku-4-5-20251001", "Claude Haiku 4.5"},
			)
		}

		if openaiClient != nil {
			models = append(models,
				modelInfo{"gpt-4o", "GPT-4o"},
				modelInfo{"gpt-4o-mini", "GPT-4o Mini"},
			)
		}
	}

	models = append(models, modelInfo{"mock-model", "Mock (testing)"})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(modelsResponse{Models: models})
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "LLM Gateway is healthy\n")
}
