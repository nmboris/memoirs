import type { APIContext, APIRoute } from "astro";
import type { APIMemoQueryResponse, Memo, MemosHost } from "@lib/types";
import { getMemoServerCfg } from "@lib/apiHelper";

type CacheItem = {
	data: Promise<Memo[]>;
	cachedAt: number;
};

// Global cache for memo pages with timeout after a configured time
const _globalMenuCache = new Map<string, CacheItem>();

const PAGE_CACHE_TIMEOUT = Infinity;
parseInt(import.meta.env.PAGE_CACHE_TIMEOUT_MILLIS) || 1000 * 60 * 5; // 5 minutes

export const GET: APIRoute = async (context: APIContext) => {
	const memoHostData = context.cookies
		.get("memoirs.memos.host")!
		.json() as MemosHost; // Set in middleware

	const myUrl = new URL(context.request.url);
	const myOrigin = myUrl.origin;
	const { user, MemosApiUrl } = getMemoServerCfg(myOrigin, memoHostData);

	const { searchParams } = new URL(context.request.url);

	const refresh = searchParams.has("refresh") || context.props.refresh;
	const rowStat = searchParams.get("rowStatus") ?? "NORMAL";

	const url = `${MemosApiUrl}/memo?rowStatus=${rowStat}&creatorUsername=${user}&content=memoirs_menu: `;

	// If refresh param was set, delete the cache for this memo result
	if (refresh) {
		console.log(`:: Deleting cache for ${url}`);
		_globalMenuCache.delete(url);
	}

	// Check, if cache timed out
	if (_globalMenuCache.has(url)) {
		const cacheItem = _globalMenuCache.get(url)!;
		const cacheTimeout = PAGE_CACHE_TIMEOUT;

		if (cacheItem.cachedAt + cacheTimeout < Date.now()) {
			// console.info(`:: Cache item timed out: Deleting cache for ${url}`);
			_globalMenuCache.delete(url);
		}
	}

	let json: Promise<Memo[]>;
	let cached = false;

	try {
		if (_globalMenuCache.has(url)) {
			json = _globalMenuCache.get(url)!.data;
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
			_globalMenuCache.set(url, cacheItem);
		}

		const pages = await json; // Time to get the data

		const menuInfoRegex =
			/memoirs_menu:\s*(\w+)\s*\|\s*([\p{L}\s]+)\s*\|\s*(\d+)/gimu;

		const menuItems = pages.map((p) => {
			const results = p.content.matchAll(menuInfoRegex);
			const resultItems = [...results].map((r) => ({
				id: r[1],
				title: r[2],
				order: parseInt(r[3]),
			}));

			return resultItems;
		});

		// Prepare response
		const responseData: any = {
			cached,
			data: menuItems.flat(),
		};

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
