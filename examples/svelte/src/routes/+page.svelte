<script lang="ts">
	import { subscription } from '$lib/web/service-worker/push-notifications/subscription';
</script>

{#if $subscription.settled}
	{$subscription.subscription?.toJSON() ?? 'no subscription'}
{:else}
	please wait...
{/if}
