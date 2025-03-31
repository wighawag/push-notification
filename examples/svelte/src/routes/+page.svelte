<script lang="ts">
	import {
		fakeOwnerAccount,
		privateAccount,
		storage,
		pushNotifications,
		serviceWorker
	} from '$lib/state';

	function subscribe() {
		pushNotifications.subscribeToPush();
	}

	function registerOnServer() {
		pushNotifications.registerOnServer();
	}

	function push() {
		pushNotifications.testPush({
			web_push: 8030,
			notification: {
				navigate: '/',
				title: message
			}
		});
	}

	let message = 'hello';
</script>

{$fakeOwnerAccount?.address} / {$privateAccount?.signer?.address}
<button class="btn" onclick={() => fakeOwnerAccount.switchAccount()}>switch</button>
<button class="btn" onclick={() => fakeOwnerAccount.disableAccount()}>disable</button>
<hr />
<h3>ownerAccount</h3>
{JSON.stringify($fakeOwnerAccount, (k, v) => (k === 'privateKey' ? !!v : v), 2)}
<hr />
<h3>privateAccount</h3>
{JSON.stringify($privateAccount, (k, v) => (k === 'privateKey' ? !!v : v), 2)}
<hr />
<h3>data</h3>
{JSON.stringify($storage, null, 2)}
<hr />
<h3>serviceWorker</h3>
{JSON.stringify($serviceWorker, (k, v) => (k === 'subscription' ? !!v : v), 2)}
<hr />
<h3>pushNotifications</h3>
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
