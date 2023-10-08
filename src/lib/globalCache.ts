// A singleton class that holds the global cache for the application
// This is used to store the global state of the application

import type { APIContext } from "astro";
import type {
	CookieData,
	GlobalCacheMemoResult,
	GlobalCacheMemoResultList,
	Memo,
	MemoWithMeta,
	MemosHost,
	ResolvedRelation,
} from "./types";
import { filterOutPages, parseMarkdoc } from "./markdocHelpers";
import { getMemoServerCfg } from "./apiHelper";

import { GET as GET_MEMO } from "@api/memo/[memoId].ts";
import { GET as GET_MEMO_LIST } from "@api/memos.ts";

// const PAGE_CACHE_TIMEOUT =
// 	parseInt(import.meta.env.PAGE_CACHE_TIMEOUT_MILLIS) || 1000 * 60 * 5; // 5 minutes

type PageCacheItem = {
	memo: MemoWithMeta;
	relations: ResolvedRelation[];
	timeout: number;
};

type PageCacheItemList = {
	memoList: MemoWithMeta[];
	timeout: number;
};

/**
 * A singleton class that holds the global cache for the application
 */
export class GlobalCache {
	private static instance: GlobalCache;
	private _memoCache: Map<string, PageCacheItem | PageCacheItemList>;

	private constructor() {
		this._memoCache = new Map();

		const debugOn = import.meta.env.MODE === "development";
		if (debugOn) {
			console.log(":: GlobalCache Debugging started ::");

			setInterval(() => {
				console.log(this.stats);
			}, 1000 * 10 * 1); // Every 10 seconds
		}
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
		>
	): Promise<GlobalCacheMemoResult> {
		const { id, content } = astroContext.props as {
			id: string | null;
			content: string | null;
		};

		let isCached = false;

		if (
			(!id && !content) ||
			!astroContext ||
			!this.getSystemURLs(astroContext)
		) {
			return Promise.resolve({
				cacheHit: false,
				memo: null,
				relations: [],
				error: new Error("No id or content parameter or no systemURLs."),
			});
		}

		// Handle cache
		const cookieConfig = this._getCookieData(astroContext);
		const cacheKey = `${cookieConfig?.host}§${cookieConfig?.user}§${id}_${content}}`;

		if (this._memoCache.has(cacheKey)) {
			const cacheItem = this._memoCache.get(cacheKey)! as PageCacheItem;
			const cacheTimeout = cacheItem.timeout;

			// console.log(
			// 	":: CACHED MEMO ITEM FOUND ::",
			// 	new Date(cacheTimeout),
			// 	cacheKey
			// );

			if (cacheItem.memo && Date.now() < cacheTimeout) {
				isCached = true;

				return {
					cacheHit: isCached,
					memo: cacheItem.memo,
					relations: cacheItem.relations,
					error: null,
				};
			} else {
				// console.log(":: CACHED MEMO ITEM REMOVED ::", cacheKey);
				this._memoCache.delete(cacheKey);
			}
		}

		let markdocMemo: MemoWithMeta | null = null;
		let relations: ResolvedRelation[] = [];
		let error: Error | null = null;

		try {
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
					astroContext.props.id = "" + relation.relatedMemoId;
					const memo = this.getMemo(astroContext);
					const result: ResolvedRelation = {
						...relation,
						title: (await memo).memo?.title || "Untitled",
					};

					return result;
				})
			);

			const timeout = Date.now() + 1000 * 60 * 1; // 5 minutes

			// console.log(":: CACHE MEMO ITEM ADDED ::", new Date(timeout), cacheKey);

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
			} as GlobalCacheMemoResult;
		}
	}

	async getMemoList(
		astroContext: APIContext<
			Record<string, any>,
			Record<string, string | undefined>
		>
	) {
		const { tag, content, filterPages = true } = astroContext.props;
		let isCached = false;

		if (!astroContext || !this.getSystemURLs(astroContext))
			return Promise.resolve({
				cacheHit: false,
				memos: null,
				error: new Error("No id or systemURLs"),
			} as GlobalCacheMemoResultList);

		// Handle cache
		const cookieConfig = this._getCookieData(astroContext);
		const cacheKey = `${cookieConfig?.host}§${cookieConfig?.user}§L_${
			tag ?? "-"
		}_${content ?? "-"}`;

		if (this._memoCache.has(cacheKey)) {
			const cacheItems = this._memoCache.get(cacheKey)! as PageCacheItemList;
			const cacheTimeout = cacheItems.timeout;

			// console.log(
			// 	":: CACHED ITEM LIST FOUND ::",
			// 	new Date(cacheTimeout),
			// 	cacheKey,
			// 	cacheItems.memoList.length
			// );

			if (cacheItems.memoList && Date.now() < cacheTimeout) {
				isCached = true;

				return {
					cacheHit: isCached,
					memos: cacheItems.memoList,
					error: null,
				} as GlobalCacheMemoResultList;
			} else {
				// console.log(":: CACHED ITEM LIST REMOVED ::", cacheKey);
				this._memoCache.delete(cacheKey);
			}
		}

		let markdocMemos: MemoWithMeta[] | null = null;
		let error: Error | null = null;

		try {
			// TODO: The following GET error is an Astro specific probleme,
			// see https://github.com/withastro/astro/issues/8514
			// @ts-ignore
			const memoResp = (await GET_MEMO_LIST(astroContext)) as Response;
			const memoResult = (await memoResp.json()) as Memo[];

			const allMarkdocMemos = memoResult.map((memo) =>
				parseMarkdoc(this.getSystemURLs(astroContext)!.MemosAssetUrl, memo)
			);

			markdocMemos = filterPages
				? filterOutPages(allMarkdocMemos)
				: allMarkdocMemos;

			const timeout = Date.now() + 1000 * 60 * 1; // 5 minutes

			// console.log(":: CACHE ITEM LIST ADDED ::", new Date(timeout), cacheKey);

			const newItem: PageCacheItemList = {
				memoList: markdocMemos,
				timeout,
			};

			this._memoCache.set(cacheKey, newItem);
		} catch (e) {
			console.error(e);
			error = e as Error;
		} finally {
			return {
				cacheHit: isCached,
				memos: markdocMemos,
				error,
			} as GlobalCacheMemoResultList;
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
