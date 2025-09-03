#!/bin/bash

# Build balena-compose-go binary using Docker if Go is not available locally

DEST_DIR="dist/bin"
DEST_PATH="${DEST_DIR}/balena-compose-go"

# Create destination directory
mkdir -p "$DEST_DIR"

# Check if Go is available to build locally
if command -v go >/dev/null 2>&1; then
    echo "Building Go binary locally..."
    if go build -C lib/parse -ldflags="-s -w" -o "../../${DEST_PATH}"; then
        chmod +x "$DEST_PATH"
        echo "✓ Successfully built balena-compose-go"
        exit 0
    else
        echo "✗ Failed to build Go binary"
        exit 1
    fi
else
    echo "Go not available locally - checking for Docker..."
    
    # Check if Docker is available
    if command -v docker >/dev/null 2>&1; then
        echo "Building Go binary using Docker..."
        
        # Detect platform
        case "$(uname -s)" in
            Linux)
                GOOS="linux"
                case "$(uname -m)" in
                    x86_64) GOARCH="amd64" ;;
                    aarch64|arm64) GOARCH="arm64" ;;
                    *) GOARCH="amd64" ;;
                esac
                ;;
            Darwin)
                GOOS="darwin"
                case "$(uname -m)" in
                    x86_64) GOARCH="amd64" ;;
                    arm64) GOARCH="arm64" ;;
                    *) GOARCH="amd64" ;;
                esac
                ;;
            MINGW*|MSYS*|CYGWIN*|Windows_NT)
                GOOS="windows"
                GOARCH="amd64"
                ;;
            *)
                GOOS="linux"
                GOARCH="amd64"
                ;;
        esac
        
        # Build using Docker
        if docker run --rm \
            -v "$(pwd)/lib/parse:/src" \
            -v "$(pwd)/${DEST_DIR}:/output" \
            -e GOOS="${GOOS}" \
            -e GOARCH="${GOARCH}" \
            -w /src \
            golang:1.25-alpine \
            sh -c "go build -ldflags='-s -w' -o /output/balena-compose-go ."; then
            chmod +x "$DEST_PATH"
            echo "✓ Successfully built balena-compose-go using Docker for ${GOOS}/${GOARCH}"
            exit 0
        else
            echo "✗ Failed to build with Docker"
            exit 1
        fi
    else
        echo "✗ Neither Go nor Docker available - cannot build binary"
        echo "Please install Go or Docker to build from source"
        exit 1
    fi
fi