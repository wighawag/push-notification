<script lang="ts">
	import {
		fakeOwnerAccount,
		privateAccount,
		storage,
		pushNotifications,
		serviceWorker
	} from '$lib/state';
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

{#if $pushNotifications.error}
	{String($pushNotifications.error)}
	<button class="btn" onclick={() => pushNotifications.acknowledgeError()}>ok</button>
{/if}
{#if $pushNotifications.status === 'off' || $pushNotifications.status === 'unregistered'}
	<button class="btn" disabled={$pushNotifications.busy} onclick={() => pushNotifications.enable()}
		>enable notifications</button
	>
{:else if $pushNotifications.status === 'on'}
	Notifications are on for this account.
	<button class="btn" disabled={$pushNotifications.busy} onclick={() => pushNotifications.disable()}
		>disable</button
	>
{:else if $pushNotifications.status === 'denied'}
	Push notifications were denied.
{:else if $pushNotifications.status === 'unsupported'}
	This browser cannot receive push notifications.
{:else if $pushNotifications.status === 'loading'}
	please wait...
{:else}
	No account
{/if}

<hr />

<p>
	A push is sent by a service holding this domain's token, not by the page: see the example's
	README.
</p>
