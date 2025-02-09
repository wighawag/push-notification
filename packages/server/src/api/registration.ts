import {Hono} from 'hono';
import {ServerOptions, Subscription} from '../types.js';
import {setup} from '../setup.js';
import {Env} from '../env.js';
import {typiaValidator} from '@hono/typia-validator';
import {createValidate} from 'typia';

export type SubscriptionRegistration = {
	address: string;
	domain: string;
	subscription: Subscription;
};

export function getRegistrationAPI(options: ServerOptions) {
	const app = new Hono<{Bindings: Env}>()
		.use(setup({serverOptions: options}))
		.post('/register', typiaValidator('json', createValidate<SubscriptionRegistration>()), async (c) => {
			const config = c.get('config');
			const storage = config.storage;

			const registration = await c.req.json();

			// TODO authentication of address
			await storage.recordSubscription(registration.address, registration.domain, registration.subscription);
			return c.json({succes: true, registered: true});
		})
		.get('/registered/:address/:domain/:subscriptionID', async (c) => {
			const config = c.get('config');
			const storage = config.storage;

			const address = c.req.param('address');
			const domain = c.req.param('domain');
			const subscriptionID = c.req.param('subscriptionID');

			const subscription = await storage.getSubscription(address, domain, subscriptionID);
			if (subscription) {
				return c.json({succes: true, registered: true});
			} else {
				return c.json({succes: true, registered: false});
			}
		});

	return app;
}
