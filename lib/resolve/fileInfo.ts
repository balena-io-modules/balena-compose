export interface FileInfo {
	/**
	 * name: The filename
	 */
	name: string;

	/**
	 * size: The filesize in bytes
	 */
	size: number;

	/**
	 * contents: The contents of the file
	 */
	contents: Buffer;
}
