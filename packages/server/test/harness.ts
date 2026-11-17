// What every platform's API test needs: a database with the shipped schema,
// an env with domain tokens, and a RECORDING push sender in place of Web Push.
import fs from 'node:fs';
import path from 'node:path';
import {createClient} from '@libsql/client';
import {RemoteLibSQL} from 'remote-sql-libsql';
import type {RemoteSQL} from 'remote-sql';

export const DOMAIN_A = 'game-a.example';
export const DOMAIN_B = 'game-b.example';
export const TOKEN_A = 'token-of-the-service-for-game-a';
export const TOKEN_B = 'token-of-the-service-for-game-b';

export async function sha256Hex(text: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function testEnv(): Promise<Record<string, string>> {
	return {
		VAPID_PUBLIC_KEY: 'unused-the-sender-is-recorded',
		VAPID_PRIVATE_KEY: 'unused-the-sender-is-recorded',
		PUSH_TOKENS: `${DOMAIN_A}:${await sha256Hex(TOKEN_A)}, ${DOMAIN_B}:${await sha256Hex(TOKEN_B)}`,
	};
}

const schemaFolder = path.join(import.meta.dirname, '../src/schema/sql');

/** A fresh in-memory libSQL database holding the shipped schema (every .sql but drop.sql). */
export async function freshDatabase(): Promise<RemoteSQL> {
	const db = new RemoteLibSQL(createClient({url: ':memory:'}));
	const files = fs
		.readdirSync(schemaFolder)
		.filter((f) => f.endsWith('.sql') && f !== 'drop.sql')
		.sort();
	for (const file of files) {
		const sql = fs.readFileSync(path.join(schemaFolder, file), 'utf-8');
		for (const statement of sql.split(';').map((s) => s.trim())) {
			if (statement) {
				await db.prepare(statement).all();
			}
		}
	}
	return db;
}

export type RecordedPush = {
	endpoint: string;
	payload: string;
	topic?: string;
	urgency?: string;
};

/** A push sender that records each send and answers what the test scripted per endpoint. */
export function recordingSender() {
	const sent: RecordedPush[] = [];
	const scripted = new Map<string, number[]>();
	const held = new Map<string, Promise<void>>();
	async function send(
		subscription: {endpoint: string},
		payload: string,
		options: {topic?: string; urgency?: string},
	): Promise<{ok: boolean; status: number; body?: string}> {
		const hold = held.get(subscription.endpoint);
		if (hold) {
			held.delete(subscription.endpoint);
			await hold;
		}
		const queue = scripted.get(subscription.endpoint);
		const status = queue && queue.length > 0 ? queue.shift()! : 201;
		if (status >= 200 && status < 300) {
			sent.push({endpoint: subscription.endpoint, payload, topic: options.topic, urgency: options.urgency});
		}
		return {ok: status >= 200 && status < 300, status};
	}
	return {
		send,
		sent,
		/** The next sends to this endpoint answer these statuses, in order, then 201. */
		answer(endpoint: string, ...statuses: number[]) {
			scripted.set(endpoint, [...(scripted.get(endpoint) ?? []), ...statuses]);
		},
		/** The next send to this endpoint waits until the returned function is called. */
		hold(endpoint: string): () => void {
			let release!: () => void;
			held.set(endpoint, new Promise<void>((resolve) => (release = resolve)));
			return release;
		},
		deliveredTo(endpoint: string) {
			return sent.filter((s) => s.endpoint === endpoint).length;
		},
	};
}

export type RecordingSender = ReturnType<typeof recordingSender>;

/** What a platform gives the suite: a request function over an app built on these dependencies. */
export type MakeApp = (deps: {
	db: RemoteSQL;
	env: Record<string, string>;
	sender: RecordingSender['send'];
}) => Promise<{request: (path: string, init?: RequestInit) => Promise<Response>}>;
