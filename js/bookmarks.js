/*
Bookmarks + read-tracking.
Saves to localStorage. Planning to save all this in something like supabase or sm.
*/

const Bookmarks = (
	() => {
		// TESTED (2026-04-07):
		// - node --check passed for this file.
		// - Continue-reading next chapter now derived from read_log (max visited + 1).
		// - Clear-all / clear-series read history logic validated at state-update level.

		let bookmarks = {};
		let read_log = {};

		function load()
		{
			bookmarks = Storage.get_bookmarks();
			read_log = Storage.get_read_log();
		}

		function is_bookmarked(manga_id)
		{
			return !!bookmarks[manga_id];
		}

		function toggle(manga, total_chapters=0)
		{
			if (bookmarks[manga.id])
			{
				delete bookmarks[manga.id];
			}
			else
			{
				bookmarks[manga.id] = {
					id: manga.id,
					title: manga.title,
					cover: manga.cover,
					status: manga.status,
					added_at: Date.now(),
					read_count: count_read(manga.id),
					total_chapters,
				};
			}
			Storage.save_bookmarks(bookmarks);
			return is_bookmarked(manga.id);
		}

		function remove(manga_id)
		{
			delete bookmarks[manga_id];
			Storage.save_bookmarks(bookmarks);
		}

		function clear_all_bookmarks()
		{
			bookmarks = {};
			Storage.clear_bookmarks();
		}

		function update_total(manga_id, total)
		{
			if (bookmarks[manga_id])
			{
				bookmarks[manga_id].total_chapters = total;
				Storage.save_bookmarks(bookmarks);
			}
		}

		function get_all()
		{
			return Object.values(bookmarks).sort((a, b) => b.added_at - a.added_at);
		}

		function is_chapter_read(manga_id, ch_num)
		{
			return Object.keys(read_log).some(
				k =>
				k.startsWith(`${manga_id}:${ch_num}:`)
			);
		}

		function was_visited(manga_id, ch_num, site)
		{
			return !!read_log[`${manga_id}:${ch_num}:${site}`]; // Converts to booleann
		}

		function count_read(manga_id)
		{
			const unique = new Set(
				Object.keys(read_log)
					.filter(k => k.startsWith(manga_id + ":"))
					.map(k => k.split(":")[1])
			);
			return unique.size;
		}

		function next_chapter_to_read(manga_id)
		{
			let max = 0;
			Object.keys(read_log)
				.filter(k => k.startsWith(manga_id + ":"))
				.forEach(k => {
					const raw = k.split(":")[1];
					const num = Number(raw);
					if (Number.isFinite(num) && num > max) max = num;
				});
			return String(max + 1);
		}

		function mark_visited(manga_id, ch_num, site)
		{
			read_log[`${manga_id}:${ch_num}:${site}`] = Date.now();
			Storage.save_read_log(read_log);
			if (bookmarks[manga_id]) {
				bookmarks[manga_id].read_count = count_read(manga_id);
				Storage.save_bookmarks(bookmarks);
			}
		}

		function clear_read_history(manga_id = null)
		{
			if (!manga_id)
			{
				read_log = {};
				Storage.clear_read_log();
				Object.values(bookmarks).forEach(bm => { bm.read_count = 0; });
				Storage.save_bookmarks(bookmarks);
				return;
			}

			const next_log = {};
			for (const [key, value] of Object.entries(read_log))
			{
				if (!key.startsWith(`${manga_id}:`)) next_log[key] = value;
			}
			read_log = next_log;
			Storage.save_read_log(read_log);
			if (bookmarks[manga_id])
			{
				bookmarks[manga_id].read_count = 0;
				Storage.save_bookmarks(bookmarks);
			}
		}

		function render_list(container_id, { on_open, on_remove, on_continue, on_clear_series_read })
		{
			const el = document.getElementById(container_id);
			const list = get_all();

			if (!list.length)
			{
				el.innerHTML = `<div class="empty_state"><div class="big_icon">🔖</div><p>No bookmarks yet.<br>Search a title and tap the ★ icon.</p></div>`;
				return;
			}

			el.innerHTML = list.map(bm => {
				const pct = bm.total_chapters ? Math.round((bm.read_count / bm.total_chapters) * 100) : 0;
				const sc = { ongoing: "status_ongoing", completed: "status_completed", hiatus: "status_hiatus" }[bm.status] || "";
				const next_ch = next_chapter_to_read(bm.id);
				const cover = bm.cover
					? `<img class="manga_cover" src="${bm.cover}" loading="lazy" onerror="this.style.display='none'" />`
					: `<div class="cover_placeholder">📕</div>`;
				return `
			<div class="bm_item">
			${cover}
			<div class="bm_info">
				<div class="bm_title">${bm.title}</div>
				<div style="display:flex;align-items:center;gap:8px;margin-top:3px;">
				<span class="manga_status ${sc}">${bm.status || "unknown"}</span>
				<span class="bm_meta">${bm.read_count} / ${bm.total_chapters || "?"} read</span>
				</div>
				<div class="progress_bar"><div class="progress_fill" style="width:${pct}%"></div></div>
			</div>
			<div class="bm_actions">
				<button class="bm_remove" data-id="${bm.id}">✕</button>
				<button class="bm_clear_read" data-id="${bm.id}">Clear Read</button>
				<button class="bm_continue" data-id="${bm.id}" data-next="${next_ch}">Continue Ch ${next_ch}</button>
				<button class="bm_open"   data-id="${bm.id}">Open →</button>
			</div>
			</div>`;
			}).join("");

			el.querySelectorAll(".bm_open").forEach(btn => btn.addEventListener("click", () => on_open(bookmarks[btn.dataset.id])));
			el.querySelectorAll(".bm_continue").forEach(btn => btn.addEventListener("click", () => {
				const bm = bookmarks[btn.dataset.id];
				if (!bm) return;
				const next = btn.dataset.next;
				on_continue(bm, next);
			}));
			el.querySelectorAll(".bm_clear_read").forEach(btn => btn.addEventListener("click", () => {
				on_clear_series_read(btn.dataset.id);
				render_list(container_id, { on_open, on_remove, on_continue, on_clear_series_read });
			}));
			el.querySelectorAll(".bm_remove").forEach(btn => btn.addEventListener("click", () => {
				on_remove(btn.dataset.id);
				render_list(container_id, { on_open, on_remove, on_continue, on_clear_series_read });
			}));
		}

		return {
			load, is_bookmarked, toggle, remove, clear_all_bookmarks,
			update_total, get_all, is_chapter_read, was_visited, mark_visited,
			clear_read_history, render_list, next_chapter_to_read
		};

	}
)();
