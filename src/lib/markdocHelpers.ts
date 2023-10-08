import type {
	Memo,
	MemoWithMeta,
	Relation,
	ResolvedRelation,
	ResourceItem,
} from "./types";
import matter from "gray-matter";

const tagRegexp = new RegExp(/(#([^\s#,]+))/, "g");
/**
 * Adds Markdoc memoTag to every memos original tag
 * @param content Raw content string
 * @returns Patched content
 */
const _patchContentTags = (content: string) => {
	// The tag tag
	let replaced = content.replace(
		tagRegexp,
		'{% memoTag tag="$1" %}$1{% /memoTag %}'
	);

	// The checkbox tag
	const pattern = /(.*)\[(X|\s|\_|\-|)\]\s(.*)/gim;
	replaced = replaced.replace(
		pattern,
		'{% checkbox label="$3" status="$2" /%}'
	);

	// The content links
	const contentLinkPattern = /\[\[(.+?)\]\]/gim;
	replaced = replaced.replace(
		contentLinkPattern,
		'{% contentLink label="$1" %}$1{% /contentLink %}'
	);

	return replaced;
};

const _generateTagFrontmatter = (content: string) => {
	if (!content || !content.length) return "";

	const tags = content.match(tagRegexp) || [];
	if (!tags.length) return "";

	let tagFrontmatter = "tags:\n";
	tags.forEach((tag) => {
		const tagText = tag.replace("#", "");
		tagFrontmatter += "- " + tagText + "\n";
	});

	return tagFrontmatter;
};

export const parseMarkdoc = (memoAssetUrl: string, memoRaw: Memo) => {
	const rawMatter = matter(memoRaw.content, {
		excerpt: true,
		excerpt_separator: "---",
	});

	// Add the tags to the frontmatter
	const tagFrontmatterText = _generateTagFrontmatter(memoRaw.content);
	const fakeFM = `---\n${tagFrontmatterText}\n---\n`;

	// Parse Frontmatter
	const theMatter = matter(fakeFM);
	const tagFrontmatter = theMatter.data;

	// Merge the frontmatter from the parsed frontmatter and the raw matter frontmatter
	rawMatter.data = { ...tagFrontmatter, ...rawMatter.data };

	// Prepare the content with markdoc tags
	const patchedContent = _patchContentTags(rawMatter.content);

	// Try to find the blog post header image
	const potentialImage = memoRaw.resourceList.find((resItem: ResourceItem) =>
		resItem.type.startsWith("image/")
	);
	const imageUrl = potentialImage ? `${memoAssetUrl}/${potentialImage.id}` : "";

	// Build the post object
	const postWithMeta: MemoWithMeta = {
		...memoRaw,
		title: _getMemoTitle(rawMatter.data.title, patchedContent),
		abstract: _getMemoAbstract(rawMatter.data.abstract, rawMatter.content),
		patchedContent,
		imageUrl,
		frontmatter: { ...rawMatter.data },
	};

	return postWithMeta;
};

const _fallbackTitleRegexp = new RegExp(/^[# ]+(.+?)(?: {#[\w-]+})?$/, "m");

export const _getMemoTitle = (frontmatterTitle: string, content: string) => {
	if (frontmatterTitle && frontmatterTitle.length) return frontmatterTitle;

	const fallbackTitleMatch = _fallbackTitleRegexp.exec(content);
	if (fallbackTitleMatch) return fallbackTitleMatch[1];

	return "Untitled";
};

export const _getMemoAbstract = (
	frontmatterAbstract: string,
	content: string
) => {
	if (frontmatterAbstract && frontmatterAbstract.length)
		return frontmatterAbstract;

	const firstTwoParagrah = content.split("\n\n").slice(0, 2).join(" ");

	const fallbackTitleMatch = _fallbackTitleRegexp.exec(
		firstTwoParagrah.slice(0, 150)
	);

	if (fallbackTitleMatch) return fallbackTitleMatch[1];

	return "No abstract";
};

/**
 * Filters out memos of type page
 * @param memoList The list of memos to filter
 * @returns The filtered list of memos
 */
export const filterOutPages = (memoList: MemoWithMeta[]) => {
	// TODO: This is really hacky, but is there a filter function for the query against memos?
	const filtered = memoList.filter(
		(memo) =>
			["memoirs_page", "memoirs_sidenav"].filter((s) => s in memo.frontmatter)
				.length === 0
	);

	return filtered;
};
