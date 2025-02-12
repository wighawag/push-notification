<script lang="ts">
	import { dummyAccount, pushNotifications, serviceWorker } from '$lib/state';

	function subscribe() {
		pushNotifications.subscribeToPush();
	}

	function registerOnServer() {
		pushNotifications.registerOnServer();
	}

	function push() {
		pushNotifications.testPush(message);
	}

	let message = 'hello';
</script>

{$dummyAccount?.address}
<button class="btn" onclick={() => dummyAccount.switchAccount()}>switch</button>
<button class="btn" onclick={() => dummyAccount.disableAccount()}>disable</button>
<hr />
{JSON.stringify($serviceWorker, (k, v) => (k === 'subscription' ? !!v : v), 2)}
<hr />
{JSON.stringify($pushNotifications, (k, v) => (k === 'subscription' ? !!v : v), 2)}
<hr />

{#if $pushNotifications.settled}
	{#if $pushNotifications.error}
		{$pushNotifications.error}
		<button class="btn" onclick={() => pushNotifications.acknowledgeError()}>ok</button>
	{:else if 'subscription' in $pushNotifications}
		<button
			class="btn"
			disabled={!!$pushNotifications.subscription || $pushNotifications.subscribing}
			onclick={subscribe}>subscribe</button
		>

		{#if $pushNotifications.subscription && !$pushNotifications.registeredOnServer}
			<button class="btn" onclick={registerOnServer}>link account</button>
		{/if}
	{:else if $pushNotifications.denied}
		Push notifications were denied.
	{/if}
{:else if $pushNotifications.loading}
	please wait...
{:else}
	No account
{/if}

<hr />

<input type="text" bind:value={message} />
<button class="btn" onclick={push}>push</button>
