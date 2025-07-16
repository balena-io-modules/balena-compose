import { spawn } from 'node:child_process';
import * as path from 'node:path';

// Binary path defaults to ./balena-compose-go but may be overridden by env var
const composeGo = path.resolve(process.env.COMPOSE_GO_BINARY || './compose-go');

interface ComposeGoArgs {
    composeFilePath: string;
}

interface StructuredLog {
    time: string;
    level: string;
    levelRank: number;
    msg: string;
}

// See: https://github.com/sirupsen/logrus/blob/master/level_test.go#L40
const logLevels: Record<string, number> = {
    panic: 0,
    fatal: 1,
    error: 2,
    warning: 3,
    info: 4,
    debug: 5,
    trace: 6,
}

// Extract a StructuredLog from a log line in github.com/sirupsen/logrus format
const toStructuredLog = (output: string): StructuredLog => {
    // Time section starts with `time=`, is surrounded by double quotes, and ends before `level=`
    const timeMatch = output.match(/time="([^"]+)"/);
    // Level section starts with `level=` and its value is limited to the keys in logLevels
    const levelMatch = output.match(/level=([a-z]+)/);
    // Msg section starts with `msg=` and goes until end of log line
    const msgMatch = output.match(/msg="([^"]+)"/);

    if (!timeMatch || !levelMatch || !msgMatch) {
        console.error({ output, timeMatch, levelMatch, msgMatch });
        throw new Error(`Failed to parse log line: ${output}`);
    }

    return {
        time: timeMatch[1],
        level: levelMatch[1],
        levelRank: logLevels[levelMatch[1]],
        msg: msgMatch[1],
    };
}

const parseRaw = async (args: ComposeGoArgs): Promise<any> => {
    return new Promise((resolve, reject) => {
        const child = spawn(composeGo, [args.composeFilePath]);
        let output = '';

        child.stdout.on('data', (data) => {
            output += data.toString();
        });

        child.stderr.on('data', (data) => {
            try {
                const structuredLog = toStructuredLog(data.toString());
                // Only log if <= log rank 3 (warning)
                if (structuredLog.levelRank <= 3) {
                    console.log(`[${structuredLog.level}] ${structuredLog.msg}`);
                } else {
                    reject(new Error(`Received error from balena-compose-go: level=${structuredLog.level}, msg=${structuredLog.msg}`));
                }
            } catch (err: unknown) {
                reject(new Error(`NOT A LOG LINE: ${err}`));
            }
        });

        child.on('close', (code) => {
            if (code === 0) {
                const result = JSON.parse(output);
                resolve(result);
            } else {
                reject(new Error(`balena-compose-go exited with code ${code}`));
            }
        });

        child.on('error', (err) => {
            reject(new Error(`balena-compose-go failed with error: ${err.message}`));
        });
    });
}

// Transform the raw composition into a valid Composition
const transformCompose = (compose: any) => {
    // Remove project name as it's not relevant to balena
    const projectName = compose.name;
    console.log({ projectName });
    delete compose.name;

    Object.keys(compose.networks || {}).forEach((networkName) => {
        // Delete name as it's set by the Supervisor
        delete compose.networks![networkName].name;
    });
    Object.keys(compose.volumes || {}).forEach((volumeName) => {
        // Delete name as it's set by the Supervisor
        delete compose.volumes![volumeName].name;
    });
    Object.keys(compose.services || {}).forEach((serviceName) => {
        const serviceDefinition = compose.services![serviceName];
        // Delete container_name as it's set by the Supervisor
        delete serviceDefinition.container_name;
        // Remove null entrypoint (compose-go parses entrypoint to [null] if none exists)
        if (serviceDefinition.entrypoint && serviceDefinition.entrypoint[0] === null) {
            delete serviceDefinition.entrypoint;
        }
        // Remove null default network (compose-go parses default network to [null] if none exists)
        Object.keys(serviceDefinition.networks || {}).forEach((networkName) => {
            const serviceNetworkDefinition = serviceDefinition.networks[networkName];
        });
    });

    return compose;
}

export const parse = async (args: ComposeGoArgs) => {
    console.log({ args });
    const rawCompose = await parseRaw(args);
    return transformCompose(rawCompose);
}
