<script lang="ts">
	import { dummyAccount, pushNotifications } from '$lib/state';

	function subscribe() {
		pushNotifications.subscribeToPush();
	}

	function registerOnServer() {
		pushNotifications.registerOnServer();
	}
</script>

{$dummyAccount?.address}
<button class="btn" onclick={() => dummyAccount.switchAccount()}>switch</button>
<button class="btn" onclick={() => dummyAccount.disableAccount()}>disable</button>
<hr />
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

		{#if $pushNotifications.subscription && !$pushNotifications.registeredOnServer}
			<button class="btn" onclick={registerOnServer}>link account</button>
		{/if}
	{/if}
{:else if $pushNotifications.loading}
	please wait...
{:else}
	No account
{/if}
