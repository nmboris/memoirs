import type { APIContext, APIRoute } from "astro";
import type { APIMemoQueryResponse, Memo, MemosHost } from "@lib/types";
import { getMemoServerCfg } from "@lib/apiHelper";

type CacheItem = {
	data: Promise<Memo[]>;
	cachedAt: number;
};

// Global cache for memo pages with timeout after a configured time
const _globalCache = new Map<string, CacheItem>();

const PAGE_CACHE_TIMEOUT =
	parseInt(import.meta.env.PAGE_CACHE_TIMEOUT_MILLIS) || 1000 * 60 * 5; // 5 minutes

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

	const limitStr = searchParams.get("limit") ?? QUERY_LIMIT;
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

	const refresh = searchParams.has("refresh");

	const url = `${MemosApiUrl}/memo?creatorUsername=${user}${
		query ? `&${query}` : ""
	}&limit=${limitPlus}${offset > 0 ? `&offset=${offset}` : ""}`;

	// If refresh param was set, delete the cache for this memo result
	if (refresh) {
		// console.log(`:: Deleting cache for ${url}`);
		_globalCache.delete(url);
	}

	// Check, if cache timed out
	if (_globalCache.has(url)) {
		const cacheItem = _globalCache.get(url)!;
		const cacheTimeout = PAGE_CACHE_TIMEOUT;

		if (cacheItem.cachedAt + cacheTimeout < Date.now()) {
			// console.info(`:: Cache item timed out: Deleting cache for ${url}`);
			_globalCache.delete(url);
		}
	}

	let json: Promise<Memo[]>;
	let cached = false;

	try {
		if (_globalCache.has(url)) {
			json = _globalCache.get(url)!.data;
			cached = true;
		} else {
			const res = await fetch(url);
			json = res.json() as Promise<Memo[]>;

			// Check for errors in response
			if (res.status !== 200 || json.hasOwnProperty("message")) {
				const errMsg = json as never as { error: string; message: string };
				throw new Error(
					`Error while fetching memos: ${res.statusText} ${errMsg.message}`
				);
			}

			const cacheItem: CacheItem = {
				data: json,
				cachedAt: Date.now(),
			};
			_globalCache.set(url, cacheItem);
		}

		let records = await json; // Time to get the data

		// Check, if there are more pages
		let isLastPage = true;
		if (records.length === limitPlus) {
			isLastPage = false;
			records = records.slice(0, limit);
		}

		// Prepare response
		const responseData: APIMemoQueryResponse = {
			cached,
			data: records,
		};

		// Prepare the param string for the lastPage url
		const paramOffsetLast =
			offset - limit > 0 ? `offset=${offset - limit}` : "";
		const paramStrLast = [paramOffsetLast, query].filter(Boolean).join("&");

		// Add lastPage url to response
		const lastPageUrl =
			offset >= limit
				? `/memo${paramStrLast.length ? `?${paramStrLast}` : ""}`
				: null;
		if (lastPageUrl) {
			responseData.lastPage = lastPageUrl;
		}

		// Prepare the param string for the nextPage url
		const paramOffsetNext = isLastPage ? null : `offset=${offset + limit}`;
		const paramStrNext = [paramOffsetNext, query].filter(Boolean).join("&");

		// Add nextPage url to response
		const nextPageUrl = isLastPage
			? null
			: `/memo${paramStrNext.length ? `?${paramStrNext}` : ""}`;
		if (nextPageUrl) {
			responseData.nextPage = nextPageUrl;
		}

		return new Response(JSON.stringify(responseData), {
			status: 200,
		});
	} catch (e) {
		const err = e as Error;
		const errorMsg = "error getting memos from server: " + err.message;

		console.error(`${errorMsg} for url '${url}'`, err);

		return new Response(
			JSON.stringify({
				message: errorMsg,
			}),
			{
				status: 500,
			}
		);
	}
};

export const DELETE: APIRoute = ({ request, cookies }) => {
	const memoHostData = cookies.get("memoirs.memos.host")!.json() as MemosHost; // Set in middleware
	const myUrl = new URL(request.url);
	const { user, MemosApiUrl } = getMemoServerCfg(myUrl.origin, memoHostData);

	const { searchParams } = new URL(request.url);
	const offset = searchParams.get("offset") ?? "";
	const limit = searchParams.get("limit") ?? QUERY_LIMIT;

	const url = `${MemosApiUrl}/memo?creatorUsername=${user}&limit=${limit}${
		offset.length ? `&offset=${offset}` : ""
	}`;

	// Delete cache for this memo query
	const isCached = _globalCache.has(url);
	isCached && _globalCache.delete(url);

	return new Response(
		JSON.stringify({
			message: isCached ? "Cache entry deleted" : "No cache entry found",
		})
	);
};
