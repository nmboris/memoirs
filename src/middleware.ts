import type { MemosHost } from "@lib/types";
import { defineMiddleware } from "astro:middleware";

// `context` and `next` are automatically typed
export const onRequest = defineMiddleware((context, next) => {
	const memoHostData = context.cookies
		.get("memoirs.memos.host")
		?.json() as MemosHost;

	if (!memoHostData) {
		context.cookies.set(
			"memoirs.memos.host",
			JSON.stringify({
				host: import.meta.env.MEMO_HOME_BASE_URL,
				user: import.meta.env.MEMO_HOME_USER,
			}),
			{
				path: "/",
			}
		);
	}

	return next();
});
