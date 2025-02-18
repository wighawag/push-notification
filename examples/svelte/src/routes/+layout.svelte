<script lang="ts">
	import Notifications from '$lib/notifications/Notifications.svelte';
	import VersionAndInstallNotfications from '$lib/web/service-worker/VersionAndInstallNotfications.svelte';
	import '../app.css';
	let { children } = $props();
</script>

{@render children()}

<Notifications />

<VersionAndInstallNotfications src="" alt="" />
