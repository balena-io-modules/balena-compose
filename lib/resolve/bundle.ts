const emptyHook = (_contents: string): Promise<void> => {
	return Promise.resolve();
};

export class Bundle {
	public tarStream: NodeJS.ReadableStream;

	/**
	 * deviceType: The slug of the device type that this bundle has been created
	 * for
	 */
	public deviceType: string;

	/**
	 * architecture: The architecture that this resin bundle is targeting
	 */
	public architecture: string;

	/**
	 * dockerfileHook: A function to be called with the
	 * resolved dockerfile. If the hook returns a
	 * string (or something which resolve to a string) we
	 * replace the Dockerfile in place. Use this function for
	 * further processing of the Dockerfile, after resolution
	 * has determined the correct Dockerfile to use.
	 *
	 * NB: rather than null | string, we keep void | string to
	 * avoid a breaking change
	 */
	private dockerfileHook: (
		content: string,
	) => void | undefined | string | PromiseLike<undefined | void | string>;

	/**
	 * constructor: Initialise a resin-bundle with a tar archive stream
	 *
	 * @param tarStream
	 *  A readable stream which when consumed will produce a tar archive containing
	 *  a resin bundle
	 * @param deviceType
	 *  The machine name of the device that this resin bundle is currently targeting
	 * @param architecture
	 *  The architecture that this resin bundle is currently targeting
	 */
	public constructor(
		tarStream: NodeJS.ReadableStream,
		deviceType: string,
		architecture: string,
		hook: Bundle['dockerfileHook'] = emptyHook,
	) {
		this.tarStream = tarStream;
		this.deviceType = deviceType;
		this.architecture = architecture;
		this.dockerfileHook = hook;
	}

	public async callDockerfileHook(
		contents: string,
	): Promise<ReturnType<Bundle['dockerfileHook']>> {
		return await this.dockerfileHook(contents);
	}
}

export default Bundle;
