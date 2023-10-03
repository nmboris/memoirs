import type { APIRoute } from "astro";

const MEMO_HOME_BASE_URL = import.meta.env.MEMO_HOME_BASE_URL as string;
const MEMO_HOME_USER = import.meta.env.MEMO_HOME_USER as string;

export const POST: APIRoute = async ({ redirect, cookies, request }) => {
	const data = await request.formData();
	const host = data.get("host") || MEMO_HOME_BASE_URL;
	const user = data.get("user") || MEMO_HOME_USER;

	cookies.set(
		"memoirs.memos.host",
		JSON.stringify({
			host,
			user,
		}),
		{
			path: "/",
		}
	);

	return redirect("/");
};
