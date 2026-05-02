package mcpclient

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// Client implements JSON-RPC 2.0 HTTP client for MCP servers
type Client struct {
	URL        string
	HTTPClient *http.Client
}

// MCPTool represents a tool definition from an MCP server
type MCPTool struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	InputSchema map[string]interface{} `json:"inputSchema"`
}

// jsonRPCRequest is a JSON-RPC 2.0 request
type jsonRPCRequest struct {
	JSONRPC string      `json:"jsonrpc"`
	Method  string      `json:"method"`
	Params  interface{} `json:"params,omitempty"`
	ID      int         `json:"id"`
}

// jsonRPCResponse is a JSON-RPC 2.0 response
type jsonRPCResponse struct {
	JSONRPC string                 `json:"jsonrpc"`
	Result  map[string]interface{} `json:"result"`
	Error   *jsonRPCError          `json:"error"`
	ID      int                    `json:"id"`
}

// jsonRPCError is a JSON-RPC 2.0 error object
type jsonRPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// NewClient creates a new MCP client
func NewClient(url string) *Client {
	return &Client{
		URL:        url,
		HTTPClient: &http.Client{},
	}
}

// Initialize sends the initialize request to the MCP server
func (c *Client) Initialize(ctx context.Context) error {
	req := jsonRPCRequest{
		JSONRPC: "2.0",
		Method:  "initialize",
		Params: map[string]interface{}{
			"protocolVersion": "2024-11-05",
			"capabilities":    map[string]interface{}{},
			"clientInfo": map[string]string{
				"name":    "a1-agent-engine",
				"version": "1.0.0",
			},
		},
		ID: 1,
	}

	_, err := c.send(ctx, req)
	return err
}

// ListTools returns the list of available tools from the MCP server
func (c *Client) ListTools(ctx context.Context) ([]MCPTool, error) {
	req := jsonRPCRequest{
		JSONRPC: "2.0",
		Method:  "tools/list",
		ID:      2,
	}

	resp, err := c.send(ctx, req)
	if err != nil {
		return nil, err
	}

	tools := []MCPTool{}
	if toolsData, ok := resp["tools"]; ok {
		if toolsSlice, ok := toolsData.([]interface{}); ok {
			for _, t := range toolsSlice {
				if toolMap, ok := t.(map[string]interface{}); ok {
					tool := MCPTool{
						Name:        toString(toolMap["name"]),
						Description: toString(toolMap["description"]),
					}
					if schema, ok := toolMap["inputSchema"].(map[string]interface{}); ok {
						tool.InputSchema = schema
					}
					tools = append(tools, tool)
				}
			}
		}
	}

	return tools, nil
}

// CallTool invokes a tool on the MCP server
func (c *Client) CallTool(ctx context.Context, name string, args map[string]interface{}) (string, error) {
	req := jsonRPCRequest{
		JSONRPC: "2.0",
		Method:  "tools/call",
		Params: map[string]interface{}{
			"name":      name,
			"arguments": args,
		},
		ID: 3,
	}

	resp, err := c.send(ctx, req)
	if err != nil {
		return "", err
	}

	if content, ok := resp["content"]; ok {
		if contentSlice, ok := content.([]interface{}); ok && len(contentSlice) > 0 {
			if contentMap, ok := contentSlice[0].(map[string]interface{}); ok {
				return toString(contentMap["text"]), nil
			}
		}
	}

	return "", fmt.Errorf("unexpected tool call response format")
}

// send sends a JSON-RPC 2.0 request and returns the result
func (c *Client) send(ctx context.Context, req jsonRPCRequest) (map[string]interface{}, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, "POST", c.URL+"/mcp", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")

	httpResp, err := c.HTTPClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer httpResp.Body.Close()

	respBody, err := io.ReadAll(httpResp.Body)
	if err != nil {
		return nil, err
	}

	var jsonResp jsonRPCResponse
	if err := json.Unmarshal(respBody, &jsonResp); err != nil {
		return nil, err
	}

	if jsonResp.Error != nil {
		return nil, fmt.Errorf("MCP error: %s", jsonResp.Error.Message)
	}

	return jsonResp.Result, nil
}

// helper to safely convert interface{} to string
func toString(v interface{}) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}
