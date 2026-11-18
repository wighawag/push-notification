// `pnpm openapi` (after `pnpm build`): writes the OpenAPI document of the API, generated
// from the zod schemas that validate it (src/openapi.ts).
import fs from 'node:fs';
import path from 'node:path';
import {generateOpenAPIDocument} from './dist/esm/openapi.js';

const output = process.argv[2];
if (!output) {
	throw new Error(`usage: node generate-openapi.mjs <output.json>`);
}
const document = await generateOpenAPIDocument();
fs.mkdirSync(path.dirname(output), {recursive: true});
fs.writeFileSync(output, JSON.stringify(document, null, 2) + '\n');
console.log(`OpenAPI document written to ${output} (${Object.keys(document.paths).length} paths)`);
