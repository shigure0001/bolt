import type { ToolSession } from ".";

import { cfgEvalPy } from "../eval/settings";

export interface EvalBackendsAllowance {
	python: boolean;
}

/** Active eval backend allowance (`eval.py`; `PI_PY` overrides). */
export function resolveEvalBackends(session: ToolSession): EvalBackendsAllowance {
	return { python: cfgEvalPy.get(session.settings) };
}
