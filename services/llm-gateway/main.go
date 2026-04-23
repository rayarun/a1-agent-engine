package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/sashabaranov/go-openai"
)

type modelInfo struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type modelsResponse struct {
	Models []modelInfo `json:"models"`
}

var (
	openaiClient *openai.Client
	anthropicKey string
	anthropicURL string
)

func init() {
	apiKey := os.Getenv("OPENAI_API_KEY")
	if apiKey != "" {
		openaiClient = openai.NewClient(apiKey)
		log.Println("LLM Gateway: OpenAI client initialized")
	}

	anthropicKey = os.Getenv("ANTHROPIC_API_KEY")
	anthropicURL = os.Getenv("ANTHROPIC_BASE_URL")
	if anthropicURL == "" {
		anthropicURL = "https://api.anthropic.com/v1/messages"
	} else {
		log.Printf("LLM Gateway: Using custom Anthropic URL: %s", anthropicURL)
	}

	if anthropicKey != "" {
		log.Println("LLM Gateway: Anthropic raw-HTTP configured")
	}

	if openaiClient == nil && anthropicKey == "" {
		log.Println("LLM Gateway: Running in Mock only mode (no API keys)")
	}
}

func main() {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", handleHealth)
	mux.HandleFunc("GET /v1/models", handleModels)
	mux.HandleFunc("POST /v1/chat/completions", handleChatCompletions)
	mux.HandleFunc("POST /v1/embeddings", handleEmbeddings)

	log.Println("Starting LLM Gateway on :8083")
	if err := http.ListenAndServe(":8083", withCORS(mux)); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
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

	if openaiClient != nil {
		resp, err := openaiClient.CreateEmbeddings(r.Context(), req)
		if err != nil {
			http.Error(w, fmt.Sprintf("OpenAI error: %v", err), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
		return
	}

	// Mock Embeddings Logic
	log.Printf("Mock Embeddings: Handling request for model %s", req.Model)
	
	// Create a deterministic mock vector of 1536 dimensions
	vector := make([]float32, 1536)
	for i := range vector {
		vector[i] = 0.1 * float32(i) / 1536.0 // Minimal deterministic noise
	}

	resp := openai.EmbeddingResponse{
		Object: "list",
		Data: []openai.Embedding{
			{
				Object:    "embedding",
				Index:     0,
				Embedding: vector,
			},
		},
		Model: "mock-embedding-v1",
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func handleChatCompletions(w http.ResponseWriter, r *http.Request) {
	var req openai.ChatCompletionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	// Routing Logic
	if strings.Contains(req.Model, "mock") {
		handleMockInference(w, req)
		return
	}

	if strings.Contains(req.Model, "claude") && anthropicKey != "" {
		handleAnthropicInference(w, req)
		return
	}

	if openaiClient == nil {
		handleMockInference(w, req)
		return
	}

	// Proxy to OpenAI
	resp, err := openaiClient.CreateChatCompletion(r.Context(), req)
	if err != nil {
		http.Error(w, fmt.Sprintf("OpenAI error: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func handleMockInference(w http.ResponseWriter, req openai.ChatCompletionRequest) {
	log.Printf("Mock Inference: Handling request for model %s", req.Model)

	// Simple heuristic: If the last message contains a math question, return a tool call.
	lastMsg := req.Messages[len(req.Messages)-1].Content
	
	var resp openai.ChatCompletionResponse
	resp.ID = "mock-resp-123"
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

// --- Anthropic Raw HTTP Implementation ---

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

func handleAnthropicInference(w http.ResponseWriter, req openai.ChatCompletionRequest) {
	log.Printf("Anthropic Inference (Raw HTTP): Handling request for model %s", req.Model)

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
	httpReq, _ := http.NewRequest("POST", anthropicURL, bytes.NewBuffer(body))
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", anthropicKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")

	client := &http.Client{}
	resp, err := client.Do(httpReq)
	if err != nil {
		http.Error(w, fmt.Sprintf("Anthropic HTTP error: %v", err), http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		http.Error(w, fmt.Sprintf("Anthropic API error (%d): %s", resp.StatusCode, string(respBody)), resp.StatusCode)
		return
	}

	var antResp anthropicResponse
	json.NewDecoder(resp.Body).Decode(&antResp)

	// Translate Back to OpenAI
	openaiResp := openai.ChatCompletionResponse{
		ID:    antResp.ID,
		Model: antResp.Model,
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

func handleModels(w http.ResponseWriter, r *http.Request) {
	var models []modelInfo

	if anthropicKey != "" {
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

	models = append(models, modelInfo{"mock-model", "Mock (testing)"})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(modelsResponse{Models: models})
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "LLM Gateway is healthy\n")
}
