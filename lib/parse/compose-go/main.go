package main

import (
	"context"
	"fmt"
	"log"
	"os"

	"github.com/compose-spec/compose-go/v2/cli"
)

func parse_compose() int32 {
	ctx := context.Background()

	// All Node process.env variables are automatically available via os.Environ()
	envVars := os.Environ()

	// Get COMPOSE_FILE and PROJECT_NAME from envVars
	composeFilePath := os.Getenv("COMPOSE_FILE")
	projectName := os.Getenv("PROJECT_NAME")

	options, err := cli.NewProjectOptions(
		[]string{composeFilePath},
		cli.WithName(projectName),
		cli.WithEnv(envVars),
	)
	if err != nil {
		log.Fatal(err)
	}

	project, err := options.LoadProject(ctx)
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
