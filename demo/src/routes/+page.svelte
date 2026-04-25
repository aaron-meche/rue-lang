<script lang="ts">
	import { compileRue } from '$lib/rueDemoCompiler';

	const sampleMarkup = `
<main class="demo-card">
    <p class="eyebrow">Rue Live Preview</p>
    <h1>Nested CSS with JS integration.</h1>
    <p class="caption">Edit the "Rue Source" and watch this live preview update instantly.</p>
    <div class="actions">
        <a href="https://github.com/aaron-meche/rue-lang#readme">Read Docs</a>
        <a href="https://www.npmjs.com/package/rue-lang" class="ghost">View NPM</a>
    </div>
    <section class="feature-grid">
        <article class="feature">
            <strong>Compile-time variables</strong>
            <span>Rue swaps _tokens_ before CSS is emitted.</span>
        </article>
        <article class="feature">
            <strong>Nested styles</strong>
            <span>Selectors can live where their components live.</span>
        </article>
    </section>
</main>`;

	let rue = $state(`_accent-hue_: 175
	
func getAccentDeriv(sat, light, a = 1) {
    let hueStr     = _accent-hue_ + " "
    let satStr     = sat + "% "
    let lightStr   = light + "% / " + a
    let fullStr    = "hsl(" + hueStr + satStr + lightStr + ")"
    return fullStr
}

func rem(value) {
    return value + "rem"
}

_l0_:     getAccentDeriv( 8,  8)  // layer 0 (bg)
_l1_:     getAccentDeriv(12, 12)  // layer 1 (panel)
_accent_: getAccentDeriv(75, 50)  // accent color

body{
    margin: 0
    height: 100vh
    display: grid
    place-items: center
    background: _l0_
    color: white
    font-family: Inter, ui-sans-serif, system-ui
}

.demo-card{
    width: calc(100vw - rem(6))
    padding: rem(2)
    background: var(--panelBg)
    border: 1px solid _accent_
    border-radius: 18px
    box-shadow: inset 0 0 rem(6) getAccentDeriv(75, 50, 0.1)

    .eyebrow{
        color: _accent_
        text-transform: uppercase
        font-size: rem(0.8)
        letter-spacing: rem(0.1)
        font-weight: 800
    }

    h1{
        all: unset;
        font-size: rem(3)
		font-weight: 700;
        line-height: 0.9
    }

    .caption{
        color: getAccentDeriv(12, 60)
        line-height: 1.8
    }
}

.actions { 
	display: flex
	gap: rem(0.8)
	margin-block: rem(1.2)

	a { 
		all: unset
		border-radius: 100vh
		padding: rem(0.8) rem(1.6)
		background: _accent_
		color: black
		font-weight: 800
		cursor: pointer
		outline: 1px solid _accent_

		:hover{ text-decoration: underline }
	} 

	.ghost { 
		background: transparent
		color: _accent_
	} 
}

.feature-grid{
    display: grid
    grid-template-columns: 1fr 1fr
    gap: rem(1)

    .feature{
		display: grid;
		gap: rem(0.25)
        padding: 1rem
        background: getAccentDeriv(10, 30, 0.2)
        border-radius: 14px

        strong{ display: block }
        span{ color: getAccentDeriv(8, 70); line-height: 1.5 }
    }
}`);

	let compiled = $derived(compileRue(rue));
	let previewDoc = $derived(`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<base target="_blank" />
<style>${compiled.css}</style>
</head>
<body>${sampleMarkup}</body>
</html>`);

	function handleEditorKeydown(event: KeyboardEvent) {
		if (event.key !== 'Tab') return;

		event.preventDefault();

		const textarea = event.currentTarget as HTMLTextAreaElement;
		const start = textarea.selectionStart;
		const end = textarea.selectionEnd;
		const nextValue = textarea.value.slice(0, start) + '    ' + textarea.value.slice(end);
		const nextCursor = start + 4;

		textarea.value = nextValue;
		rue = nextValue;

		requestAnimationFrame(() => {
			textarea.selectionStart = nextCursor;
			textarea.selectionEnd = nextCursor;
		});
	}
</script>

<svelte:head>
	<title>Rue Language</title>
	<meta
		name="description"
		content="A live Rue stylesheet language playground showing nested CSS, variables, functions, and inline nested styles."
	/>
</svelte:head>

<main class="page-shell">
	<header class="site-header">
		<div>
			<p class="kicker">Stylesheet compiler</p>
			<h1>Rue Language</h1>
			<p>written by Aaron Meche</p>
		</div>
		<a class="repo-link" href="https://github.com/aaron-meche/rue-lang">GitHub</a>
	</header>

	<section class="workspace" aria-label="Rue live compiler demo">
		<div class="editor-panel">
			<div class="panel-bar">
				<div>
					<h2>Rue source</h2>
					<span>Edit nested styles, functions, and variables.</span>
				</div>
				<span class="pill">{rue.split('\n').length} lines</span>
			</div>
			<textarea
				bind:value={rue}
				spellcheck="false"
				aria-label="Rue source editor"
				onkeydown={handleEditorKeydown}
			></textarea>
		</div>

		<div class="preview-column">
			<div class="preview-panel">
				<div class="panel-bar">
					<div>
						<h2>Live HTML viewer</h2>
						<span>Compiled CSS is injected into this preview.</span>
					</div>
					<span class:error={compiled.errors.length > 0} class="pill">
						{compiled.errors.length ? `${compiled.errors.length} errors` : 'clean'}
					</span>
				</div>
				<iframe
					title="Rue compiled preview"
					srcdoc={previewDoc}
					sandbox="allow-popups allow-popups-to-escape-sandbox"
				></iframe>
			</div>
		</div>
		<div class="css-panel">
			<div class="panel-bar compact">
				<h2>Generated CSS</h2>
				<span>{compiled.css.length} chars</span>
			</div>
			{#if compiled.errors.length}
				<ul class="errors">
					{#each compiled.errors as error}
						<li>{error}</li>
					{/each}
				</ul>
			{/if}
			<pre>{compiled.css}</pre>
		</div>
	</section>
</main>

<style>
	:global(*) {
		box-sizing: border-box;
	}

	:global(body) {
		margin: 0;
		min-width: 320px;
		background:
			linear-gradient(135deg, rgba(124, 247, 200, 0.08), transparent 34rem),
			#080b10;
		color: #f8fafc;
		font-family:
			Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
	}

	:global(button),
	:global(textarea) {
		font: inherit;
	}

	.page-shell {
		min-height: 100vh;
		padding: 28px;
	}

	.site-header {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 24px;
		margin: 0 auto 24px;
		max-width: 1480px;
	}

	.kicker {
		margin: 0 0 8px;
		color: #7cf7c8;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.76rem;
		font-weight: 800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
	}

	h1,
	h2,
	p {
		margin-top: 0;
	}

	h1 {
		margin-bottom: 6px;
		font-size: clamp(2.2rem, 6vw, 5.6rem);
		line-height: 0.9;
		letter-spacing: 0;
	}

	.site-header p:last-child {
		margin: 0;
		color: #94a3b8;
		font-size: 1.02rem;
	}

	.repo-link {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 42px;
		padding: 0 16px;
		border: 1px solid rgba(148, 163, 184, 0.3);
		border-radius: 999px;
		color: #f8fafc;
		text-decoration: none;
		transition:
			border-color 160ms ease,
			background 160ms ease;
	}

	.repo-link:hover {
		border-color: rgba(124, 247, 200, 0.75);
		background: rgba(124, 247, 200, 0.08);
	}

	.workspace {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		grid-template-rows: minmax(560px, calc(80vh - 176px)) auto;
		gap: 18px;
		max-width: 1480px;
		margin: 0 auto;
	}

	.editor-panel,
	.preview-panel,
	.css-panel {
		border: 1px solid rgba(148, 163, 184, 0.18);
		border-radius: 8px;
		background: rgba(15, 23, 42, 0.72);
		box-shadow: 0 20px 80px rgba(0, 0, 0, 0.24);
		overflow: hidden;
	}

	.editor-panel,
	.preview-column {
		height: 100%;
		min-height: 0;
	}

	.editor-panel {
		display: flex;
		flex-direction: column;
	}

	.preview-column {
		display: flex;
		flex-direction: column;
	}

	.preview-panel {
		flex: 1;
	}

	.panel-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		min-height: 72px;
		padding: 16px 18px;
		border-bottom: 1px solid rgba(148, 163, 184, 0.16);
		background: rgba(2, 6, 23, 0.42);
	}

	.panel-bar.compact {
		min-height: 54px;
	}

	.panel-bar h2 {
		margin: 0 0 4px;
		font-size: 0.98rem;
	}

	.panel-bar span {
		color: #94a3b8;
		font-size: 0.82rem;
	}

	.pill {
		flex: 0 0 auto;
		border: 1px solid rgba(124, 247, 200, 0.3);
		border-radius: 999px;
		padding: 6px 10px;
		color: #7cf7c8 !important;
		background: rgba(124, 247, 200, 0.08);
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
	}

	.pill.error {
		border-color: rgba(251, 113, 133, 0.45);
		color: #fb7185 !important;
		background: rgba(251, 113, 133, 0.09);
	}

	textarea {
		flex: 1;
		width: 100%;
		min-height: 0;
		resize: none;
		border: 0;
		outline: 0;
		padding: 20px;
		background: #070b12;
		color: #dbeafe;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.92rem;
		line-height: 1.62;
		tab-size: 4;
	}

	iframe {
		display: block;
		width: 100%;
		height: calc(100% - 72px);
		min-height: 360px;
		border: 0;
		background: #020617;
	}

	.css-panel {
		grid-column: 1 / -1;
		min-height: 0;
	}

	pre {
		max-height: min(44vh, 460px);
		margin: 0;
		padding: 16px 18px 20px;
		overflow: auto;
		color: #bfdbfe;
		background: #070b12;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.78rem;
		line-height: 1.55;
	}

	.errors {
		margin: 0;
		padding: 12px 18px;
		border-bottom: 1px solid rgba(251, 113, 133, 0.22);
		color: #fecdd3;
		background: rgba(251, 113, 133, 0.08);
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 0.78rem;
	}

	@media (max-width: 980px) {
		.page-shell {
			padding: 18px;
		}

		.site-header {
			align-items: start;
			flex-direction: column;
		}

		.workspace {
			grid-template-columns: 1fr;
			grid-template-rows: auto auto auto;
			min-height: 0;
		}

		.editor-panel,
		.preview-column {
			height: auto;
		}

		textarea,
		iframe {
			min-height: 430px;
		}
	}
</style>
