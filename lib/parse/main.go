package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"

	"github.com/compose-spec/compose-go/v2/cli"
)

// Response represents the structured output from the parser
type Response struct {
	Success bool            `json:"success"`
	Data    json.RawMessage `json:"data,omitempty"`
	Error   *ErrorInfo      `json:"error,omitempty"`
}

// ErrorInfo contains structured error information
type ErrorInfo struct {
	Name    string `json:"name"`
	Message string `json:"message"`
}

// Usage message
const usage = `
Usage: balena-compose-go <compose-file> <project-name>

Parses a docker-compose file and outputs a structured response.

Arguments:
  <compose-file>  Path to the docker-compose file to parse
  <project-name>  Name of the project to use for the parsed output. It is recommended to use a UUID, as any fields which include
                  the project name need to be removed for normalization into a compose acceptable by balena.

Example:
  balena-compose-go /my/path/to/docker-compose.yml my-project-name
`

func main() {
	if len(os.Args) < 2 {
		outputError("ArgumentError", usage)
		os.Exit(1)
	}

	composeFilePath := os.Args[1]
	projectName := os.Args[2]

	ctx := context.Background()

	options, err := cli.NewProjectOptions(
		[]string{composeFilePath},
		cli.WithOsEnv,
		cli.WithDotEnv,
		cli.WithName(projectName),
	)
	if err != nil {
		outputError("ConfigError", fmt.Sprintf("Failed to create compose project options: %v", err))
		os.Exit(1)
	}

	project, err := options.LoadProject(ctx)
	if err != nil {
		outputError("ParseError", fmt.Sprintf("Failed to parse compose file: %v", err))
		os.Exit(1)
	}

	// Get JSON representation using project's MarshalJSON method
	projectJSON, err := project.MarshalJSON()
	if err != nil {
		outputError("ParseError", fmt.Sprintf("Failed to marshal compose project to JSON: %v", err))
		os.Exit(1)
	}

	// Output successful response with the parsed project
	// using json.RawMessage to avoid base64 encoding
	response := Response{
		Success: true,
		Data:    json.RawMessage(projectJSON),
	}

	if err := json.NewEncoder(os.Stdout).Encode(response); err != nil {
		// This is unlikely but we should handle it
		outputError("EncodeError", fmt.Sprintf("Failed to encode response: %v", err))
		os.Exit(1)
	}
}

// Write a structured error response to stderr
func outputError(errorName, message string) {
	response := Response{
		Success: false,
		Error: &ErrorInfo{
			Name:    errorName,
			Message: message,
		},
	}

	// Output to stdout for consistent handling in TypeScript
	json.NewEncoder(os.Stderr).Encode(response)
}
