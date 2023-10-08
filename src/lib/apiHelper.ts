import type { CookieData, MemosHost } from "./types";

// FIXME: MemosHost type must be removed later, it's only here for compatibility
export const getMemoServerCfg = (
	myselfOrigin: string,
	memosHost: MemosHost | CookieData
) => {
	const hostRaw = memosHost.host;
	const remoteHost = hostRaw.endsWith("/") ? hostRaw.slice(0, -1) : hostRaw;
	const remoteUser = memosHost.user;

	const MemosApiUrl = `${remoteHost}/api/v1`;
	const MemosSourceUrl = `${remoteHost}/m`;
	const MemosAssetUrl = `${remoteHost}/o/r`;
	const LocalSingleMemoApiUrl = `${myselfOrigin}/api/memo`;
	const LocalSearchMemosApiUrl = `${myselfOrigin}/api/memos`;

	return {
		host: remoteHost,
		user: remoteUser,
		MemosSourceUrl,
		MemosApiUrl,
		MemosAssetUrl,
		LocalSingleMemoApiUrl,
		LocalSearchMemosApiUrl,
	} as MemosHost;
};
