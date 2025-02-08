<script lang="ts">
	import VersionAndInstallNotfications from '$lib/web/service-worker/VersionAndInstallNotfications.svelte';
	import '../app.css';
	let { children } = $props();
</script>

{@render children()}

<VersionAndInstallNotfications src="" alt="" />
