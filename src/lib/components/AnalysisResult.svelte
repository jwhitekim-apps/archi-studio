<script lang="ts">
	// 분석 결과(design 결정 8). null이나 빈 목록은 숨기고, 저널 점수 여섯 값이 모두 null이면 찾지 못했다고 안내한다.
	import type { Analysis } from '$lib/api/types';
	import { Button } from '$lib/components/ui';
	import { A, JOURNAL_LABELS } from '$lib/messages/analyze';

	let { analysis, fallbackTitle = '' }: { analysis: Analysis; fallbackTitle?: string } = $props();

	const basic = $derived(analysis.basic);
	const title = $derived(basic.title || fallbackTitle || '제목 없음');
	const meta = $derived(
		[basic.year, basic.venue, basic.citationCount !== null ? `인용 ${basic.citationCount.toLocaleString('ko-KR')}회` : null]
			.filter((v) => v !== null && v !== '')
			.join(' · ')
	);
	const shortLines = $derived(
		[
			[A.problem, analysis.problemShort],
			[A.method, analysis.methodShort],
			[A.conclusion, analysis.conclusionShort]
		].filter((line): line is [string, string] => Boolean(line[1]))
	);
	const longLines = $derived(
		[
			[A.problem, analysis.problem],
			[A.method, analysis.method],
			[A.conclusion, analysis.conclusion]
		].filter((line): line is [string, string] => Boolean(line[1]))
	);
	const score = $derived(analysis.journalScore);
	const scoreFound = $derived(Object.values(score).some((v) => v !== null));
	const quartile = $derived(score.quartile && /^Q[1-4]$/.test(score.quartile) ? score.quartile : null);
	const scoreRows = $derived(
		(Object.keys(JOURNAL_LABELS) as (keyof typeof JOURNAL_LABELS)[])
			.map((key) => [JOURNAL_LABELS[key], score[key]] as const)
			.filter(([, value]) => value !== null && value !== '')
	);
	function authorNumbers(author: Analysis['authors'][number]): string {
		return [
			author.hIndex !== null ? `h-index ${author.hIndex}` : null,
			author.citationCount !== null ? `인용 ${author.citationCount.toLocaleString('ko-KR')}회` : null
		]
			.filter(Boolean)
			.join(' · ');
	}

	const sources = $derived(
		[analysis.sources.pdf && 'PDF', analysis.sources.semanticScholar && 'Semantic Scholar'].filter(Boolean).join(', ') || '없음'
	);
</script>

<article class="result" aria-labelledby="analysis-title">
	<header class="head">
		<h2 id="analysis-title">{title}</h2>
		{#if meta}<p class="meta">{meta}</p>{/if}
		{#if basic.doi || basic.arxivId}
			<p class="ids">
				{#if basic.doi}<a href="https://doi.org/{basic.doi}" target="_blank" rel="noopener noreferrer">DOI {basic.doi}</a>{/if}
				{#if basic.arxivId}<a href="https://arxiv.org/abs/{basic.arxivId}" target="_blank" rel="noopener noreferrer">arXiv {basic.arxivId}</a>{/if}
			</p>
		{/if}
	</header>

	<section aria-labelledby="summary-title">
		<h3 id="summary-title">{A.summaryTitle}</h3>
		{#if shortLines.length}
			<dl class="lines">
				{#each shortLines as [label, text] (label)}
					<div><dt>{label}</dt><dd>{text}</dd></div>
				{/each}
			</dl>
		{:else}
			<p class="summary">{analysis.summary}</p>
		{/if}
		{#if longLines.length}
			<details>
				<summary>{A.details}</summary>
				<dl class="lines long">
					{#each longLines as [label, text] (label)}
						<div><dt>{label}</dt><dd>{text}</dd></div>
					{/each}
				</dl>
			</details>
		{/if}
	</section>

	{#if analysis.domain || analysis.keywords.length}
		<section class="tags" aria-label="{A.domain}과 {A.keywords}">
			{#if analysis.domain}<p><span class="label">{A.domain}</span> {analysis.domain}</p>{/if}
			{#if analysis.keywords.length}
				<ul aria-label={A.keywords}>
					{#each analysis.keywords as keyword (keyword)}<li class="chip">{keyword}</li>{/each}
				</ul>
			{/if}
		</section>
	{/if}

	{#if analysis.authors.length}
		<section aria-labelledby="authors-title">
			<h3 id="authors-title">{A.authors}</h3>
			<ul class="authors">
				{#each analysis.authors as author (author.name)}
					<li>
						<span class="name">{author.name}</span>
						<span class="numbers">{authorNumbers(author)}</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<section aria-labelledby="journal-title">
		<h3 id="journal-title">{A.journalTitle}</h3>
		{#if !scoreFound}
			<p class="muted">{A.journalMissing}</p>
		{:else}
			{#if quartile}<p class="quartile" data-quartile={quartile}>{quartile}</p>{/if}
			<dl class="scores">
				{#each scoreRows as [label, value] (label)}
					<div><dt>{label}</dt><dd>{value}</dd></div>
				{/each}
			</dl>
		{/if}
	</section>

	<p class="sources"><span class="label">{A.sources}</span> {sources}</p>

	<div class="links">
		<Button href="/translate?paperId={analysis.paperId}">{A.translateLink}</Button>
		<Button href="/papers/{analysis.paperId}">{A.hubLink}</Button>
	</div>
</article>

<style>
	.result {
		display: grid;
		gap: var(--space-xl);
		padding: var(--space-xl);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		background: var(--color-surface);
		box-shadow: var(--shadow-card);
		min-width: 0;
	}

	h2 {
		margin: 0;
		font-size: var(--fs-18);
		font-weight: var(--fw-700);
		line-height: var(--lh-tight);
		overflow-wrap: anywhere;
	}

	h3 {
		margin: 0 0 var(--space-sm);
		font-size: var(--fs-15);
		font-weight: var(--fw-650);
	}

	.head {
		display: grid;
		gap: var(--space-xs);
	}

	.meta,
	.muted,
	.numbers {
		margin: 0;
		color: var(--color-text-muted);
	}

	.ids {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-md);
		margin: 0;
		font-size: var(--fs-13);
		overflow-wrap: anywhere;
	}

	.lines {
		display: grid;
		gap: var(--space-sm);
		margin: 0;
	}

	.lines div {
		display: grid;
		grid-template-columns: 3.5em minmax(0, 1fr);
		gap: var(--space-sm);
	}

	dt {
		color: var(--color-text-muted);
		font-weight: var(--fw-600);
	}

	dd {
		margin: 0;
		overflow-wrap: anywhere;
	}

	.summary {
		margin: 0;
		white-space: pre-line;
	}

	details {
		margin-top: var(--space-md);
	}

	summary {
		color: var(--color-accent-hover);
		font-weight: var(--fw-600);
		cursor: pointer;
	}

	summary:focus-visible {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	.long {
		margin-top: var(--space-sm);
		line-height: var(--lh-relaxed);
	}

	.tags {
		display: grid;
		gap: var(--space-sm);
	}

	.tags p {
		margin: 0;
	}

	.label {
		margin-right: var(--space-xs);
		color: var(--color-text-muted);
		font-weight: var(--fw-600);
	}

	.tags ul,
	.authors {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-xs);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.chip {
		padding: 2px var(--space-sm);
		border-radius: var(--radius-pill);
		background: var(--color-well);
		font-size: var(--fs-13);
	}

	.authors {
		display: grid;
		gap: var(--space-xs);
	}

	.authors li {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-xs) var(--space-md);
	}

	.name {
		font-weight: var(--fw-600);
	}

	.quartile {
		display: inline-block;
		margin: 0 0 var(--space-sm);
		padding: 2px var(--space-md);
		border: 1px solid var(--color-accent);
		border-radius: var(--radius-pill);
		background: var(--color-accent-soft);
		color: var(--color-text);
		font-weight: var(--fw-800);
	}

	.quartile[data-quartile='Q3'],
	.quartile[data-quartile='Q4'] {
		border-color: var(--color-border-strong);
		background: var(--color-well);
	}

	.scores {
		display: grid;
		gap: var(--space-xs);
		margin: 0;
	}

	.scores div {
		display: grid;
		grid-template-columns: 6em minmax(0, 1fr);
		gap: var(--space-sm);
	}

	.sources {
		margin: 0;
		font-size: var(--fs-13);
	}

	.links {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-sm);
	}
</style>
