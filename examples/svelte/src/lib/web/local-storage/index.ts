type StorageProvider = {
	save(key: string, data: string): Promise<void>;
	load(key: string): Promise<string | undefined>;
};

export function createLocalStorageProvider(): StorageProvider {
	async function save(key: string, data: string): Promise<void> {
		localStorage.setItem(key, data);
	}

	async function load(key: string): Promise<string | undefined> {
		try {
			const fromStorage = localStorage.getItem(key);
			if (fromStorage) {
				return fromStorage;
			} else {
				return undefined;
			}
		} catch {
			return undefined;
		}
	}

	return {
		save,
		load
	};
}
