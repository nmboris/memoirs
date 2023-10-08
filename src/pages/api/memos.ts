import type { APIContext, APIRoute } from "astro";
import type { APIMemoQueryResponse, Memo, MemosHost } from "@lib/types";
import { getMemoServerCfg } from "@lib/apiHelper";

const QUERY_LIMIT = import.meta.env.QUERY_LIMIT || "20";

export const GET: APIRoute = async (context: APIContext) => {
	const memoHostData = context.cookies
		.get("memoirs.memos.host")!
		.json() as MemosHost; // Set in middleware

	const myUrl = new URL(context.request.url);
	const myOrigin = myUrl.origin;
	const { user, MemosApiUrl } = getMemoServerCfg(myOrigin, memoHostData);

	const { searchParams } = new URL(context.request.url);

	const offsetStr = searchParams.get("offset") ?? "0";
	const offset = parseInt(offsetStr);

	const limitStr =
		context.props.limit ?? searchParams.get("limit") ?? QUERY_LIMIT;
	const limit = parseInt(limitStr);

	const limitPlus = limit + 1;

	const queryForTag = searchParams.has("tag")
		? `tag=${searchParams.get("tag")}`
		: null;
	const queryForContent = searchParams.has("content")
		? `content=${searchParams.get("content")}`
		: null;

	// Query params ca come from the url or via the Astro props (e.g. index page)
	const query =
		queryForTag ?? queryForContent ?? context.props.content
			? `content=${context.props.content}`
			: context.props.tag
			? `tag=${context.props.tag}`
			: null;

	const rowStat = searchParams.get("rowStatus") ?? "NORMAL";

	const url = `${MemosApiUrl}/memo?rowStatus=${rowStat}&creatorUsername=${user}${
		query ? `&${query}` : ""
	}&limit=${limitPlus}${offset > 0 ? `&offset=${offset}` : ""}`;

	let json: Promise<Memo[]>;
	let cached = false;

	try {
		const res = await fetch(url);
		json = res.json() as Promise<Memo[]>;

		// Check for errors in response
		if (res.status !== 200 || json.hasOwnProperty("message")) {
			const errMsg = json as never as { error: string; message: string };
			throw new Error(
				`Error while fetching memos: ${res.statusText} ${errMsg.message}`
			);
		}

		let memos = await json; // Time to get the data

		return new Response(JSON.stringify(memos), {
			status: 200,
		});
	} catch (e) {
		const err = e as Error;
		const errorMsg = "error getting memos from server: " + err.message;

		console.error(`${errorMsg} for url '${url}'`, err);

		throw new Error(`Error getting memo list: ${errorMsg}`);
	}
};
