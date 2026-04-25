<!-- Written by Aaron Meche -->
<script>
	import favicon from '$lib/assets/favicon.png';

	let { children } = $props();
</script>

<!--  -->

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="page">
	{@render children()}
</div>

<!--  -->