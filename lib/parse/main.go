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
Usage: balena-compose-go -f <compose-file> [-f <compose-file>...] <project-name>

Parses one or more docker-compose files and outputs a structured response.

Arguments:
  -f <compose-file>  Path to a docker-compose file to parse (can be specified multiple times with later files overriding earlier ones)
  <project-name>     Name of the project to use for the parsed output. It is recommended to use a UUID, as any fields which include
                     the project name need to be removed for normalization into a compose acceptable by balena.

Example:
  balena-compose-go -f docker-compose.yml -f docker-compose.override.yml my-project-name
`

func main() {
	if len(os.Args) < 4 {
		outputError("ArgumentError", usage)
		os.Exit(1)
	}

	var composeFiles []string
	var projectName string

	// Parse command line arguments
	i := 1
	for i < len(os.Args) {
		if os.Args[i] == "-f" {
			if i+1 >= len(os.Args) {
				outputError("ArgumentError", "Missing file path after -f flag\n"+usage)
				os.Exit(1)
			}
			composeFiles = append(composeFiles, os.Args[i+1])
			i += 2
		} else {
			// The last non-flag argument should be the project name
			projectName = os.Args[i]
			i++
			break
		}
	}

	// Validate we have at least one compose file and a project name
	if len(composeFiles) == 0 {
		outputError("ArgumentError", "At least one compose file must be specified with -f\n"+usage)
		os.Exit(1)
	}

	if projectName == "" {
		outputError("ArgumentError", "Project name is required\n"+usage)
		os.Exit(1)
	}

	ctx := context.Background()

	options, err := cli.NewProjectOptions(
		composeFiles,
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
