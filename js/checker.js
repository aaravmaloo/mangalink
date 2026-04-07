/*
Just checks whether the chapter url actually EXISTS or not...
Currently proxy hosted on localhost. We could use some 3rd party proxy like:

https://corsproxy.io/?url=<url>			<= THIS is the BEST... It has CACHING!!!
https://proxy.corsfix.com/?<url>
https://corsproxy.org/?<url>
https://cors-proxy.htmldriven.com/?url=<url>

Buttt these hit rate limits FAST

⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣤⢤⣄⠀⠀⠀
⠀⠀⢀⡤⠖⠒⠒⢤⡀⠀⠀⢫⢸⡡⡏⡇⠀⠀
⠀⢀⡾⣤⣄⡀⠀⢀⠷⣄⢀⡼⠀⠑⠁⡇⠀⠀
⠀⠸⣷⣾⣿⡇⠀⣿⣾⡟⣼⡧⠖⠒⠒⠓⠒⡆
⠀⠀⠫⣉⠉⠀⠀⣉⣟⣸⠸⡀⠀⣀⣀⠀⠤⡇
⠀⢀⡤⠚⠓⠒⠋⠁⡤⢍⡆⡏⠁⠀⠀⠀⠀⡇
⠠⣏⠔⡆⠀⣀⡀⠀⡇⠀⠣⣽⡉⠁⠀⠉⠉⢹
⠀⠀⠀⡇⡸⠁⠙⢄⠃⠀⠀⠈⠯⠭⠥⠤⠎⠉
⠀⠀⠀⠉⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀


*/

const Checker = (
	() => {
		// TESTED (2026-04-07):
		// - node --check passed for this file.
		// - Verified progressive updates with bounded concurrency + cache logic at runtime paths.
		// - End-to-end UI behavior still requires browser/manual QA.
		
		const PROXY =
			window.location.hostname === "localhost"
				? "http://localhost:3000"
				: "https://mangalink.onrender.com";
		const CACHE_TTL_MS = 30 * 60 * 1000;
		const local_cache = new Map();

		function cache_key(url_array) {
			return JSON.stringify((url_array || []).slice().sort());
		}

		function read_cache(key) {
			const hit = local_cache.get(key);
			if (!hit) return null;
			if ((Date.now() - hit.ts) > CACHE_TTL_MS) {
				local_cache.delete(key);
				return null;
			}
			return hit.value;
		}

		function write_cache(key, value) {
			local_cache.set(key, { ts: Date.now(), value });
		}

		async function check_url(url_array)
		{
			const key = cache_key(url_array);
			const cached = read_cache(key);
			if (cached) return { ...cached, from_cache: true };

			try {
				const deduped = Array.from(new Set(url_array || []));
				const queryString = `?urls=${encodeURIComponent(JSON.stringify(deduped))}`;

				const res = await fetch(`${PROXY}/check${queryString}`, {
					signal: AbortSignal.timeout(20000) // Timeout of 20s
				});

				if (!res.ok) return { availability: "not_found", url: null };

				const data = await res.json();
				const out = data.exists
					? { availability: "found", url: data.url || null }
					: { availability: "not_found", url: null };
				write_cache(key, out);
				return out;
			}
			catch (err)
			{
				console.error("Checker Error:", err);
				return { availability: "unknown", url: null };
			}
		}

		async function check_all(source_url_map)
		{
			const entries = Object.entries(source_url_map);
			const results = await Promise.all(entries.map(([, urls]) => check_url(urls)));

			const out = {};
			entries.forEach(([name], i) => { out[name] = results[i].availability; });
			return out;
		}

		async function check_progressive(source_url_map, options = {})
		{
			const entries = Object.entries(source_url_map);
			const concurrency = Math.max(1, Number(options.concurrency) || 4);
			const on_update = typeof options.on_update === "function" ? options.on_update : () => {};
			const out = {};

			let idx = 0;
			async function worker() {
				while (idx < entries.length) {
					const current = idx++;
					const [name, urls] = entries[current];
					const result = await check_url(urls);
					out[name] = result;
					on_update(name, result);
				}
			}

			await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, () => worker()));
			return out;
		}

		return { check_url, check_all, check_progressive };
	}
)();
