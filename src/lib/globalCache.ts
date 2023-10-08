// A singleton class that holds the global cache for the application
// This is used to store the global state of the application

import type { APIContext } from "astro";
import type {
	CookieData,
	GlobalCacheMemoResult,
	Memo,
	MemoWithMeta,
	MemosHost,
	ResolvedRelation,
} from "./types";
import { parseMarkdoc } from "./markdocHelpers";
import { getMemoServerCfg } from "./apiHelper";

import { GET as GET_MEMO } from "@api/memo/[memoId].ts";

// const PAGE_CACHE_TIMEOUT =
// 	parseInt(import.meta.env.PAGE_CACHE_TIMEOUT_MILLIS) || 1000 * 60 * 5; // 5 minutes

type PageCacheItem = {
	memo: MemoWithMeta;
	relations: ResolvedRelation[];
	timeout: number;
};

/**
 * A singleton class that holds the global cache for the application
 */
export class GlobalCache {
	private static instance: GlobalCache;
	private _memoCache: Map<string, PageCacheItem>;

	private constructor() {
		this._memoCache = new Map<string, PageCacheItem>();
	}

	get stats() {
		const allSites = [...this._memoCache.keys()].map((k) => k.split("§")[0]);
		const uniquSites = [...new Set(allSites)];

		return `:: Stats For Nerds: ${this._memoCache.size} items in cache, ${uniquSites.length} unique sites`;
	}

	/**
	 * Get the cookie data from the Astro context
	 * @returns The cookie data from the Astro context
	 */
	private _getCookieData(
		astroContext: APIContext<Record<string, any>>
	): CookieData | null {
		return astroContext.cookies.get("memoirs.memos.host")!.json() as CookieData; // Set in middleware
	}

	/**
	 * Get the system wide used URLs based on the Astro context
	 * @returns The system URLs from the Astro context
	 */
	getSystemURLs(
		astroContext: APIContext<Record<string, any>>
	): MemosHost | null {
		const cdata = this._getCookieData(astroContext);

		if (!cdata) return null;

		// this._Astro can't be null here, because we got cdata
		return getMemoServerCfg(astroContext.url.origin, cdata);
	}

	/**
	 * Get a memo from the global cache or from the API
	 * @param id The id of the memo to get
	 * @returns A promise that resolves to a GlobalCacheMemoResult
	 */
	async getMemo(
		astroContext: APIContext<
			Record<string, any>,
			Record<string, string | undefined>
		>,
		id: string | undefined
	): Promise<GlobalCacheMemoResult> {
		let isCached = false;

		if (!id || !astroContext || !this.getSystemURLs(astroContext))
			return Promise.resolve({
				cacheHit: false,
				memo: null,
				relations: [],
				error: new Error("No id or systemURLs"),
			});

		// Handle cache
		const cookieConfig = this._getCookieData(astroContext);
		const cacheKey = `${cookieConfig?.host}§${cookieConfig?.user}§${id}`;

		if (this._memoCache.has(cacheKey)) {
			const cacheItem = this._memoCache.get(cacheKey)!;
			const cacheTimeout = cacheItem.timeout;

			console.log(":: CACHED ITEM FOUND ::", new Date(cacheTimeout), cacheKey);

			if (cacheItem.memo && Date.now() < cacheTimeout) {
				isCached = true;

				return {
					cacheHit: isCached,
					memo: cacheItem.memo,
					relations: cacheItem.relations,
					error: null,
				};
			} else {
				console.log(":: CACHE ITEM REMOVED ::", cacheKey);
				this._memoCache.delete(cacheKey);
			}
		}

		let markdocMemo: MemoWithMeta | null = null;
		let relations: ResolvedRelation[] = [];
		let error: Error | null = null;

		try {
			astroContext.params.memoId = id;

			// TODO: The following GET error is an Astro specific probleme,
			// see https://github.com/withastro/astro/issues/8514
			// @ts-ignore
			const memoResp = (await GET_MEMO(astroContext)) as Response;
			const memoResult = (await memoResp.json()) as Memo;

			markdocMemo = parseMarkdoc(
				this.getSystemURLs(astroContext)!.MemosAssetUrl,
				memoResult
			);

			relations = await Promise.all(
				// TODO: try catch
				markdocMemo.relationList.map(async (relation) => {
					const memo = this.getMemo(astroContext, "" + relation.relatedMemoId);
					const result: ResolvedRelation = {
						...relation,
						title: (await memo).memo?.title || "Untitled",
					};

					return result;
				})
			);

			const timeout = Date.now() + 1000 * 60 * 1; // 5 minutes

			console.log(":: CACHE ITEM ADDED ::", new Date(timeout), cacheKey);

			this._memoCache.set(cacheKey, {
				memo: markdocMemo,
				relations,
				timeout,
			});
		} catch (e) {
			console.error(e);
			error = e as Error;
		} finally {
			return {
				cacheHit: isCached,
				memo: markdocMemo,
				relations,
				error,
			};
		}
	}

	/**
	 * Gets the singleton instance of the GlobalCache
	 * @returns A singleton instance of the GlobalCache
	 */
	public static getInstance(): GlobalCache {
		if (!GlobalCache.instance) {
			GlobalCache.instance = new GlobalCache();
		}

		return GlobalCache.instance;
	}
}

// Export a singleton instance of the GlobalCache
export const globalCache = GlobalCache.getInstance();