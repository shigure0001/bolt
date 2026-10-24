/** Source of one enabled prelude snippet installed into a retained eval runtime. */
export interface EvalPreludeSource {
	name: string;
	exports: string[];
	source: string;
}

/**
 * Structured status payload emitted by helpers (`read`, `write`, `env`, etc.) and the
 * tool-call bridge. Surfaces to the model as part of `displays` so it has machine-readable
 * context about what side effects happened.
 */
export interface JsStatusEvent {
	op: string;
	[key: string]: unknown;
}
