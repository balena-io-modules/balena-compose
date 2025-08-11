const fs = require('fs');
require("./wasm_exec.js");

// This variable will hold the captured output from the WASM module.
let capturedOutput = '';

// Override console.log to capture output
const originalConsoleLog = console.log;
console.log = function(...args) {
  capturedOutput += args.join(' ') + '\n';
  // Uncomment this line if you want to see output in real-time
  // originalConsoleLog(...args);
};


export async function parse(composeFilePath: string, projectName: string) {
    // Ensure Go is available from the global scope as set by wasm_exec.js
    // @ts-ignore
    const go = new (globalThis.Go || Go)();
    go.env = Object.assign({}, process.env);
    
    // Read the file content in JavaScript and pass it to Go
    const composeContent = fs.readFileSync(composeFilePath, 'utf8');
    go.env['COMPOSE_CONTENT'] = composeContent;
    go.env['PROJECT_NAME'] = projectName;

    try {
        // Read the WASM file
        const wasmBuffer = fs.readFileSync('./dist/parse/compose-go.wasm');

        // Instantiate the WASM module with Go's import object
        const { instance } = await WebAssembly.instantiate(wasmBuffer, go.importObject);

        // Run the Go program
        await go.run(instance);

        // Restore console.log
        console.log = originalConsoleLog;

        return capturedOutput.trim();

    } catch (error) {
        console.log = originalConsoleLog;
        console.error('Error running WASM:', error);
    }
}