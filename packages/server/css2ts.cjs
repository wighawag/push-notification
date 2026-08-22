const fs = require('fs');
const args = process.argv.slice(2);
for (const arg of args) {
	const CSSFilePath = `./src/dashboard/styles/css/${arg}.css`;
	const TSFilePath = `./src/dashboard/styles/ts/${arg}.css.ts`;
	const cssText = fs.readFileSync(CSSFilePath);
	fs.mkdirSync('./src/dashboard/styles/ts', {recursive: true});
	// Emit a JSON string literal rather than interpolating into a template literal.
	// JSON string syntax is a subset of JS expression syntax, so no input file can
	// produce output that fails to parse: backticks, ${ and backslashes in the .css
	// are escaped for us, and CRLF survives verbatim (a template literal would
	// normalise \r\n to \n and silently change the exported string).
	fs.writeFileSync(TSFilePath, `export default ${JSON.stringify(String(cssText))};\n`);
}
