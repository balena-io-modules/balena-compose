// wasm_exec.js needs a crypto global. In some environments it's read-only,
// so we only set it if it's not already defined.
if (typeof globalThis.crypto === 'undefined') {
	globalThis.crypto = require('crypto');
}

const fs = require('fs');
require('./wasm_exec.js');

// @ts-ignore
const go = new Go();

export async function parse(composeFilePath: string, projectName: string) {
	// Set env vars for wasm process
	go.env = Object.assign({}, process.env);
	go.env['COMPOSE_FILE'] = composeFilePath;
	go.env['PROJECT_NAME'] = projectName;
	delete go.env.GOROOT;

	// Capture stdout from wasm process
	let stdout = '';
	const originalWrite = process.stdout.write;
	process.stdout.write = (chunk: any) => {
		stdout += chunk.toString();
		return true;
	};

	try {
		const wasmPath = require.resolve('../../../dist/parse/compose-go.wasm');
		const buf = fs.readFileSync(wasmPath);

		const { instance } = await WebAssembly.instantiate(buf, go.importObject);

		await go.run(instance);

		console.log({ stdout });

		return stdout;
	} catch (e) {
		console.error('Error during Wasm execution:', e);
		throw e;
	} finally {
		// Restore stdout
		process.stdout.write = originalWrite;
	}
}