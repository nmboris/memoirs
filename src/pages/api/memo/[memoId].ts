import type { APIRoute } from "astro";
import type { APIMemoResponse, Memo, MemosHost } from "@lib/types";
import { getMemoServerCfg } from "@lib/apiHelper";

export const GET: APIRoute = async ({ request, params, cookies }) => {
	const memoHostData = cookies.get("memoirs.memos.host")!.json() as MemosHost; // Set in middleware
	const myUrl = new URL(request.url);
	const { MemosApiUrl } = getMemoServerCfg(myUrl.origin, memoHostData);

	const { memoId } = params;
	if (!memoId) return new Response("Memo ID is required", { status: 400 });

	const url = `${MemosApiUrl}/memo/${memoId}`;
	let memoData: Memo | null = null;

	try {
		const res = await fetch(url);
		memoData = (await res.json()) as Memo;

		// Check for errors in response
		if (res.status !== 200 || memoData.hasOwnProperty("message")) {
			throw new Error(`Memo with ID ${memoId} ${res.statusText}`);
		}

		return new Response(JSON.stringify(memoData), {
			status: 200,
		});
	} catch (e) {
		const err = e as Error;
		const errorMsg = "error getting memo from server: " + err.message;

		console.error(`${errorMsg} for url '${url}'`, err);

		throw new Error(`Memo with ID ${memoId} ${errorMsg}`);
	}
};
