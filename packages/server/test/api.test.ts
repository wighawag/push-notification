import {createServer, type Env} from '../src/index.js';
import {describeAPI} from './api-suite.js';

describeAPI('the server package', async ({db, env, sender}) => {
	const app = createServer({
		getDB: () => db,
		getEnv: () => env as Env,
		getPushSender: () => sender,
	});
	return {request: async (path, init) => app.request(path, init)};
});
