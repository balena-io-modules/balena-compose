package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/compose-spec/compose-go/v2/loader"
	"github.com/compose-spec/compose-go/v2/types"
)

func parse_compose() int32 {
	ctx := context.Background()

	// Get COMPOSE_CONTENT and PROJECT_NAME from envVars
	composeContent := os.Getenv("COMPOSE_CONTENT")
	projectName := os.Getenv("PROJECT_NAME")

	if composeContent == "" {
		log.Fatal("COMPOSE_CONTENT environment variable is required")
	}

	// Parse the compose content directly using the loader
	configFile := types.ConfigFile{
		Filename: "docker-compose.yml",
		Content:  []byte(composeContent),
	}

	configDetails := types.ConfigDetails{
		ConfigFiles: []types.ConfigFile{configFile},
		Environment: types.Mapping{},
	}

	// Add environment variables
	for _, env := range os.Environ() {
		parts := strings.SplitN(env, "=", 2)
		if len(parts) == 2 {
			configDetails.Environment[parts[0]] = parts[1]
		}
	}

	project, err := loader.LoadWithContext(ctx, configDetails, func(options *loader.Options) {
		if projectName != "" {
			options.SetProjectName(projectName, true)
		}
	})
	if err != nil {
		log.Fatal(err)
	}

	projectJSON, err := project.MarshalJSON()
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println(string(projectJSON))
	return 0
}

func main() {
	parse_compose()
}
