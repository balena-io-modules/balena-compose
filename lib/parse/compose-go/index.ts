globalThis.require = require;
// @ts-ignore
globalThis.fs = require("fs");
// @ts-ignore
globalThis.path = require("path");
globalThis.TextEncoder = require("util").TextEncoder;
globalThis.TextDecoder = require("util").TextDecoder;
globalThis.performance ??= require("performance");
globalThis.crypto ??= require("crypto");

require("./wasm_exec");

import * as fs from "fs";

// @ts-ignore
const go = new Go();

export async function parse(composeFilePath: string, projectName: string) {
	// Set env vars for wasm process
	go.env = Object.assign({}, process.env);
	go.env['COMPOSE_FILE'] = composeFilePath;
	go.env['PROJECT_NAME'] = projectName;
	delete go.env.GOROOT;

	let stdout = '';
	let stderr = '';

	// The wasm runtime calls this function to write to file descriptors.
	// We override it here to capture stdout and stderr.
	// We use a `function` to ensure `this` is bound to the `go` instance.
	go.importObject.gojs['runtime.wasmWrite'] = function (sp: number) {
		sp >>>= 0;

		// This function needs access to the go instance's memory, but the
		// properties are not on the public type, so we cast to any.
		const goInstance = this as any;

		// A helper to read 64-bit integers from the wasm memory.
		const getInt64 = (addr: number) => {
			const low = goInstance.mem.getUint32(addr + 0, true);
			const high = goInstance.mem.getInt32(addr + 4, true);
			// There is no native 64-bit integer support in JS, so this
			// is a simplification that works for memory addresses.
			return low + high * 4294967296;
		};

		const fd = getInt64(sp + 8);
		const p = getInt64(sp + 16);
		const n = goInstance.mem.getInt32(sp + 24, true);

		const buffer = new Uint8Array(goInstance._inst.exports.mem.buffer, p, n);
		const text = new TextDecoder('utf-8').decode(buffer);

		if (fd === 1) {
			stdout += text;
		} else if (fd === 2) {
			stderr += text;
		}
	};

	try {
		const wasmPath = require.resolve('../../../dist/parse/compose-go.wasm');
		const buf = fs.readFileSync(wasmPath);

		const { instance } = await WebAssembly.instantiate(buf, go.importObject);
		await go.run(instance);

		if (stderr) {
			console.error(`Go WASM stderr: ${stderr}`);
		}

		return stdout;
	} catch (e) {
		console.error(`Error during Wasm execution: ${e}`);
		if (stderr) {
			console.error(`Go WASM stderr content on error: ${stderr}`);
		}
		throw e;
	}
}