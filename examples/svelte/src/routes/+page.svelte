<script lang="ts">
	import { pushNotifications } from '$lib/state';

	function subscribe() {
		pushNotifications.subscribeToPush();
	}
</script>

{JSON.stringify($pushNotifications, (k, v) => (k === 'subscription' ? !!v : v), 2)}
<hr />

{#if $pushNotifications.settled}
	{#if !$pushNotifications.subscription && $pushNotifications.error}
		{$pushNotifications.error}
		<button class="btn" onclick={() => pushNotifications.acknowledgeError()}>ok</button>
	{:else}
		<button
			class="btn"
			disabled={!!$pushNotifications.subscription || $pushNotifications.subscribing}
			onclick={subscribe}>subscribe</button
		>
	{/if}
{:else}
	please wait...
{/if}
