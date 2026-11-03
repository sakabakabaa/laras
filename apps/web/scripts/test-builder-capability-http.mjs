import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

const portServer = createServer();
await new Promise((resolve, reject) => {
	portServer.once('error', reject);
	portServer.listen(0, '127.0.0.1', resolve);
});
const { port } = portServer.address();
await new Promise((resolve, reject) => portServer.close((error) => error ? reject(error) : resolve()));

const server = spawn(process.execPath, ['node_modules/@react-router/serve/bin.cjs', 'dist/apps/web/server/index.js'], {
	cwd: process.cwd(),
	env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), NODE_ENV: 'production' },
	stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
server.stdout.on('data', (chunk) => { output = `${output}${chunk}`.slice(-8000); });
server.stderr.on('data', (chunk) => { output = `${output}${chunk}`.slice(-8000); });

const baseUrl = `http://127.0.0.1:${port}/api/builder-capability`;
try {
	let ready = false;
	for (let attempt = 0; attempt < 100 && !ready; attempt += 1) {
		if (server.exitCode !== null) throw new Error(`Built server exited early.\n${output}`);
		try {
			await fetch(baseUrl, { method: 'GET', signal: AbortSignal.timeout(500) });
			ready = true;
		} catch {
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
	}
	assert.ok(ready, `Built server did not become ready.\n${output}`);

	for (const method of ['GET', 'HEAD']) {
		const response = await fetch(baseUrl, { method });
		assert.equal(response.status, 405, `${method} should be rejected by the route loader`);
		assert.equal(response.headers.get('allow'), 'POST', `${method} should advertise POST`);
	}

	const postResponse = await fetch(baseUrl, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: '{}',
	});
	assert.equal(postResponse.status, 401, 'unauthenticated POST should preserve the auth check');
	const postBody = await postResponse.json();
	assert.equal(typeof postBody.error, 'string', 'unauthenticated POST should return the API auth error JSON');
	console.log('Built-server HTTP contract passed: GET 405 Allow: POST; HEAD 405 Allow: POST; unauthenticated POST 401 JSON auth error.');
} finally {
	server.kill('SIGTERM');
	await new Promise((resolve) => {
		if (server.exitCode !== null) return resolve();
		server.once('exit', resolve);
		setTimeout(() => {
			server.kill('SIGKILL');
			resolve();
		}, 5000).unref();
	});
}
