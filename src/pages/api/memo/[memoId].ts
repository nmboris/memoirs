import type { APIRoute } from "astro";
import type { APIMemoResponse, Memo, MemosHost } from "@lib/types";
import { getMemoServerCfg } from "@lib/apiHelper";

type CacheItem = {
	data: Promise<Memo>;
	sourceUrl: string;
	cachedAt: number;
};

// Global cache for memo pages with timeout after a configured time
const _globalCache = new Map<string, CacheItem>();

const PAGE_CACHE_TIMEOUT =
	parseInt(import.meta.env.PAGE_CACHE_TIMEOUT_MILLIS) || 1000 * 60 * 5; // 5 minutes

export const GET: APIRoute = async ({ request, params, cookies }) => {
	const memoHostData = cookies.get("memoirs.memos.host")!.json() as MemosHost; // Set in middleware
	const myUrl = new URL(request.url);
	const { MemosSourceUrl, MemosApiUrl } = getMemoServerCfg(
		myUrl.origin,
		memoHostData
	);

	const { searchParams } = new URL(request.url);
	const refresh = searchParams.has("refresh");

	const { memoId } = params;
	if (!memoId) return new Response("Memo ID is required", { status: 400 });

	const url = `${MemosApiUrl}/memo/${memoId}`;

	// If refresh param was set, delete the cache for this memo
	if (refresh) {
		console.log(`:: Deleting cache for ${url}`);
		_globalCache.delete(url);
	}

	try {
		// Check, if cache timed out
		if (_globalCache.has(url)) {
			const cacheItem = _globalCache.get(url)!;
			const cacheTimeout = PAGE_CACHE_TIMEOUT;

			if (cacheItem.cachedAt + cacheTimeout < Date.now()) {
				// console.info(`:: Cache item timed out: Deleting cache for ${url}`);
				_globalCache.delete(url);
			}
		}

		let record: CacheItem;
		let cached = false;

		if (_globalCache.has(url)) {
			record = _globalCache.get(url)!;
			cached = true;
		} else {
			const res = await fetch(url);
			const data = res.json() as Promise<Memo>;

			// Check for errors in response
			if (res.status !== 200 || data.hasOwnProperty("message")) {
				throw new Error(`Memo with ID ${memoId} ${res.statusText}`);
			}

			record = {
				data,
				cachedAt: Date.now(),
				sourceUrl: `${MemosSourceUrl}/${memoId}`,
			};
			_globalCache.set(url, record);
		}

		const memo = await record.data;
		const responseData: APIMemoResponse = {
			cached,
			data: memo,
			sourceUrl: record.sourceUrl,
		};

		return new Response(JSON.stringify(responseData), {
			status: 200,
		});
	} catch (e) {
		const err = e as Error;
		const errorMsg = "error getting memo from server: " + err.message;

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

export const DELETE: APIRoute = ({ request, params, cookies }) => {
	const memoHostData = cookies.get("memoirs.memos.host")!.json() as MemosHost; // Set in middleware
	const myUrl = new URL(request.url);
	const { MemosApiUrl } = getMemoServerCfg(myUrl.origin, memoHostData);

	const { memoId } = params;
	if (!memoId) return new Response("Memo ID is required", { status: 400 });

	const url = `${MemosApiUrl}/memo/${memoId}`;

	// Delete cache for this memo
	const isCached = _globalCache.has(url);
	isCached && _globalCache.delete(url);

	return new Response(
		JSON.stringify({
			message: isCached ? "Cache entry deleted" : "No cache entry found",
		})
	);
};
