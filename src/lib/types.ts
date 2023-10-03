export interface BaseLayoutProps {
	title: string;
	description: string;
	image?: string;
}

export interface MemosHost {
	host: string;
	user: string;
	MemosSourceUrl: string;
	MemosApiUrl: string;
	MemosAssetUrl: string;
	LocalSingleMemoApiUrl: string;
	LocalSearchMemosApiUrl: string;
}

export interface APIMemoResponse {
	cached: boolean;
	data: Memo;
	sourceUrl: string;
}

export interface APIMemoQueryResponse {
	cached: boolean;
	data: Memo[];
	lastPage?: string;
	nextPage?: string;
}

// MEMOS Types
export interface ResourceItem {
	id: number;
	creatorId: number;
	createdTs: number;
	updatedTs: number;
	filename: string;
	externalLink: string;
	type: string;
	size: number;
}

export type RelationType = "REFERENCE" | "OTHER";

export interface Relation {
	memoId: number;
	relatedMemoId: number;
	type: RelationType;
}

export interface ResolvedRelation extends Relation {
	title: string;
}

export interface Memo {
	id: number;
	rowStatus: string;
	creatorId: number;
	createdTs: number;
	updatedTs: number;
	displayTs: number;
	content: string;
	visibility: string;
	pinned: boolean;
	creatorName: string;
	creatorUsername: string;
	resourceList: ResourceItem[];
	relationList: Relation[];
}

export interface MemoWithMeta extends Memo {
	title: string;
	abstract: string;
	patchedContent: string;
	imageUrl: string;
	frontmatter: Record<string, string | string[]>;
}
