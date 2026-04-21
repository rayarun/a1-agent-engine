package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/sashabaranov/go-openai"
)

var (
	openaiClient *openai.Client
)

func init() {
	apiKey := os.Getenv("OPENAI_API_KEY")
	if apiKey != "" {
		openaiClient = openai.NewClient(apiKey)
		log.Println("LLM Gateway: OpenAI client initialized")
	} else {
		log.Println("LLM Gateway: Running in Mock only mode (no API key)")
	}
}

func main() {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", handleHealth)
	mux.HandleFunc("POST /v1/chat/completions", handleChatCompletions)
	mux.HandleFunc("POST /v1/embeddings", handleEmbeddings)

	log.Println("Starting LLM Gateway on :8083")
	if err := http.ListenAndServe(":8083", mux); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
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
	if strings.Contains(req.Model, "mock") || openaiClient == nil {
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

func handleHealth(w http.ResponseWriter, r *http.Request) {
	fmt.Fprintf(w, "LLM Gateway is healthy\n")
}
