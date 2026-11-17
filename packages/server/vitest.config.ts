import {defineConfig} from 'vitest/config';
import UnpluginTypia from '@ryoppippi/unplugin-typia/vite';

export default defineConfig({
	// the validators are typia's, generated at compile time
	plugins: [UnpluginTypia()],
	test: {
		include: ['test/**/*.test.ts'],
	},
});
