import {describeAPI} from '../../../packages/server/test/api-suite.js';
import {createNodeServer} from '../src/index.js';

describeAPI('the nodejs platform', async ({libsql, env, sender}) => {
	const app = await createNodeServer({db: libsql, env: env as never, getPushSender: () => sender});
	return {request: async (path, init) => app.request(path, init)};
});
