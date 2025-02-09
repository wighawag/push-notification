<script lang="ts">
	import { pushNotifications } from '$lib/web/service-worker/push-notifications';

	function subscribe() {
		pushNotifications.subscribeToPush();
	}
</script>

{#if $pushNotifications.settled}
	{#if !$pushNotifications.subscription && $pushNotifications.error}
		{$pushNotifications.error}
		<button onclick={() => pushNotifications.acknowledgeError()}>ok</button>
	{:else}
		<button
			disabled={!!$pushNotifications.subscription || $pushNotifications.subscribing}
			onclick={subscribe}>subscribe</button
		>
	{/if}
{:else}
	please wait...
{/if}
