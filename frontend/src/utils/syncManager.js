// frontend/src/utils/syncManager.js
import { assessmentsDB, progressDB, projectsDB, submissionsDB, syncQueueDB, templatesDB } from "../db";

const API_BASE_URL = (import.meta.env.VITE_API_URL || "").replace(/\/$/, '') + "/api";

// Tracks the last onboarding_state payload actually pushed to Postgres, so
// syncDataWithServer() can skip the POST when nothing changed (see step 5
// below). Module-level by design: it should persist across sync cycles for
// the lifetime of the tab, not reset per-call.
let lastPushedOnboardingState = null;

const getAuthHeaders = () => {
    const token = localStorage.getItem("token") || sessionStorage.getItem("token");
    if (!token) return null;
    return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
    };
};

const FETCH_TIMEOUT_MS = 20000;

// A request with no timeout can hang forever on a cold serverless backend or a
// flaky connection, which left the Force Sync spinner (and the whole sync pass)
// "going on and on". Every request here now gives up after 20s and is retried
// on a later pass.
const fetchWithTimeout = async (url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
};

const isLocalId = (id) => String(id ?? "").startsWith("local_");
const recordKey = (p) => (p ? p.projectId || p.templateId || p._id : null);

// Projects and templates share the exact same local->cloud lifecycle (temporary
// "local_..." key -> server id), so they share one push and one pull
// implementation, parameterised by this table.
const ITEM_KINDS = {
    project: {
        db: projectsDB, idField: "projectId", endpoint: "/projects", listKey: "projects",
        deleteAction: "DELETE_PROJECT", limitMessage: "A locally saved project could not be synced: project limit reached.",
        dropOnForbidden: false,
    },
    template: {
        db: templatesDB, idField: "templateId", endpoint: "/templates", listKey: "templates",
        deleteAction: "DELETE_TEMPLATE", limitMessage: "A locally saved template could not be synced: template limit reached.",
        // A non-limit 403 on a template means "not yours / doesn't exist": permanent.
        dropOnForbidden: true,
    },
};
// Version fingerprint of a local record, used to detect "edited again while the
// upload was in flight" so that newer edit is not wrongly marked as synced.
const versionOf = (p) => `${p?.updatedAt ?? ""}|${p?.timestamp ?? ""}`;

// ------------------------------------------------------------------
// Concurrency control
// ------------------------------------------------------------------
// Root cause of the duplicate projects: syncDataWithServer() could run several
// times at once (Force Sync click + the 30s timer + the "online" event + the
// visibilitychange handler + MainApp's own save, and again after every browser
// refresh because startBackgroundSync() fires an immediate pass). Each overlapping
// pass read the same "unsynced" snapshot and POSTed the same local project, and the
// backend inserted a new row every time. Fixes:
//   1. one pass at a time per tab (single-flight + serialized with pulls),
//   2. one pass at a time across tabs (Web Locks),
//   3. every push re-reads the record right before sending,
//   4. a stable `clientId` makes the server treat re-sends as the same project.
let opChain = Promise.resolve();
const serialize = (fn) => {
    const run = opChain.then(fn, fn);
    opChain = run.catch(() => {});
    return run;
};

let syncInFlight = null;
let pendingRerun = false;
let pendingForce = false;
const pullInFlight = { project: null, template: null };
let rateLimitedUntil = 0;

const withCrossTabLock = async (fn, wait) => {
    if (typeof navigator !== "undefined" && navigator.locks?.request) {
        return navigator.locks.request("algoblocks-sync", { ifAvailable: !wait }, async (lock) => {
            if (!lock) return undefined; // another tab is already pushing everything
            return fn();
        });
    }
    return fn();
};

const nextRetryDelay = (failures) => Math.min(30000 * 2 ** Math.max(0, failures - 1), 10 * 60 * 1000);

export const SyncManager = {
    /**
     * Executes the main batch sync sequence pushing local changes to Postgres Neon
     */
    async syncDataWithServer(opts = {}) {
        if (syncInFlight) {
            // Never start a second overlapping pass. Remember to run one more
            // right after, so anything saved meanwhile is not left waiting.
            pendingRerun = true;
            if (opts.force) pendingForce = true;
            return syncInFlight;
        }
        const run = serialize(async () => {
            let passes = 0;
            do {
                const force = !!(opts.force || pendingForce);
                pendingRerun = false;
                pendingForce = false;
                await withCrossTabLock(() => SyncManager._syncPass(force), force);
                passes++;
            } while (pendingRerun && passes < 3);
        });
        syncInFlight = run.finally(() => { syncInFlight = null; });
        return syncInFlight;
    },

    async _syncPass(force = false) {
        if (!navigator.onLine) {
            console.log("Offline: Skipping background sync.");
            return;
        }

        const headers = getAuthHeaders();
        if (!headers) return; // User not logged in, ignore sync

        // Progress records in IndexedDB are stored WITHOUT an `email` field
        // (see db.js: the `progress` store is keyed only by `lesson_id`, not
        // namespaced per user at all). `/api/update-progress` requires the
        // payload's `email` to match the authenticated account and 403s
        // otherwise. Resolving the current account's email here lets us
        // stamp it onto every progress payload before it goes out, instead
        // of forwarding the raw (email-less) IndexedDB record as-is.
        let currentUserEmail = null;
        try {
            const storedUserRaw = localStorage.getItem("user") || sessionStorage.getItem("user");
            if (storedUserRaw && storedUserRaw !== "null" && storedUserRaw !== "undefined") {
                currentUserEmail = JSON.parse(storedUserRaw)?.email || null;
            }
        } catch (e) {
            // Best-effort only; if this fails the progress POST below will
            // just 403 same as before and get cleaned up there.
        }

        let announced = false;
        try {

            // 1. Gather all unsynced data from IndexedDB
            const allProgress = await progressDB.getAll();
            const unsyncedProgress = allProgress.filter(p => !p.isSynced);

            const allAssessments = await assessmentsDB.getAll();
            const unsyncedAssessments = allAssessments.filter(a => !a.isSynced);

            const allSubmissions = await submissionsDB.getAll();
            const unsyncedSubmissions = allSubmissions.filter(s => !s.isSynced);

            const allProjects = await projectsDB.getAll();
            const unsyncedProjects = allProjects.filter(p => !p.isSynced);

            const allTemplates = await templatesDB.getAll();
            const unsyncedTemplates = allTemplates.filter(t => !t.isSynced);

            // Tell listeners (Projects page, header, dashboard) a push is really
            // happening -- only when there is work, so the 30s idle tick never
            // flashes a spinner.
            const queuedAtStart = await syncQueueDB.getAll();
            if (unsyncedProgress.length || unsyncedAssessments.length || unsyncedSubmissions.length ||
                unsyncedProjects.length || unsyncedTemplates.length || queuedAtStart.length) {
                announced = true;
                window.dispatchEvent(new Event("sync-start"));
            }

            // 2. Batch Sync Core Metrics (Progress, Assessments, Submissions) to Postgres JSONB
            // The API endpoints are tailored for standard single-item updates, so we sync them individually here
            for (const p of unsyncedProgress) {
                try {
                    const res = await fetchWithTimeout(`${API_BASE_URL}/update-progress`, {
                        method: "POST",
                        headers,
                        // Stamp the current account's email onto the payload --
                        // see the currentUserEmail comment above. Falls back to
                        // whatever (if anything) was already on the record.
                        body: JSON.stringify({ ...p, email: p.email || currentUserEmail })
                    });
                    if (res.ok) {
                        await progressDB.save({ ...p, isSynced: true });
                    } else if (res.status === 403) {
                        // A 403 here means the backend rejected the email/account
                        // match outright -- not a connectivity blip, and retrying
                        // on the next 30s tick with the exact same payload would
                        // just 403 forever (this was previously spamming
                        // update-progress every cycle and eventually tripping the
                        // endpoint's own rate limit). There's no fixable local
                        // state to retry with, so drop this record rather than
                        // let it loop indefinitely.
                        console.error("Progress sync rejected (403), dropping stale local record:", p.lesson_id);
                        await progressDB.delete(p.lesson_id);
                    }
                } catch (e) {
                    console.error("Failed to sync progress", e);
                }
            }

            for (const a of unsyncedAssessments) {
                try {
                    const res = await fetchWithTimeout(`${API_BASE_URL}/update-assessment`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify(a)
                    });
                    if (res.ok) await assessmentsDB.save({ ...a, isSynced: true });
                } catch (e) {
                    console.error("Failed to sync assessment", e);
                }
            }

            for (const s of unsyncedSubmissions) {
                try {
                    const res = await fetchWithTimeout(`${API_BASE_URL}/sync-submission`, {
                        method: "POST",
                        headers,
                        body: JSON.stringify(s)
                    });
                    if (res.ok) await submissionsDB.save({ ...s, isSynced: true });
                } catch (e) {
                    console.error("Failed to sync submission", e);
                }
            }

            // 3. Sync Individual Projects
            // One at a time, each re-read from IndexedDB immediately before it is
            // sent (the snapshot above can be stale by now), and each tagged with a
            // stable clientId so the server can recognise a re-send of the same
            // local project instead of inserting a duplicate.
            const rateLimited = !force && Date.now() < rateLimitedUntil;
            if (!rateLimited) {
                for (const snapshot of unsyncedProjects) {
                    const outcome = await SyncManager._pushItem("project", recordKey(snapshot), headers, force);
                    if (outcome === "rate_limited") break; // stop hammering; the rest wait for the next pass
                }
            }

            // 4. Sync Individual Templates (same safe, idempotent push as projects)
            if (!rateLimited) {
                for (const snapshot of unsyncedTemplates) {
                    const outcome = await SyncManager._pushItem("template", recordKey(snapshot), headers, force);
                    if (outcome === "rate_limited") break;
                }
            }

            // 5. Push onboarding tour completion state (guards against the
            // OnboardingContext's own POST never firing in this tab/session,
            // e.g. a stale tab that never re-mounted the provider).
            //
            // COST NOTE: this used to fire an unconditional POST every single
            // sync cycle (every 30s, for every open authenticated tab) even
            // when onboarding_state hadn't changed since the last push --
            // pure ambient cost with zero benefit. Compare against what was
            // last successfully pushed and skip the request when nothing
            // changed; the "stale tab" guard this exists for is still
            // covered the moment onboarding_state actually differs.
            try {
                const storedUser = localStorage.getItem("user") || sessionStorage.getItem("user");
                if (storedUser && storedUser !== "null" && storedUser !== "undefined") {
                    const parsedUser = JSON.parse(storedUser);
                    if (parsedUser?.onboarding_state) {
                        const serializedOnboarding = JSON.stringify(parsedUser.onboarding_state);
                        if (serializedOnboarding !== lastPushedOnboardingState) {
                            await fetchWithTimeout(`${API_BASE_URL}/update-onboarding`, {
                                method: "POST",
                                headers,
                                body: JSON.stringify({ onboarding_state: parsedUser.onboarding_state })
                            });
                            lastPushedOnboardingState = serializedOnboarding;
                        }
                    }
                }
            } catch (e) {
                console.error("Failed to sync onboarding state", e);
            }

            // 6. Process Offline Action Queue (e.g. Project or Template Deletions)
            const queue = await syncQueueDB.getAll();
            for (const task of queue) {
                try {
                    if (task.action === "DELETE_PROJECT") {
                        // Defensive cleanup: a "local_"-prefixed id was never
                        // pushed to Postgres, so the backend will never
                        // recognize it -- this DELETE would fail forever and
                        // keep the queue (and the "Local Pending" count)
                        // stuck. Drop it locally instead of retrying it.
                        if (String(task.payload.projectId).startsWith("local_")) {
                            await syncQueueDB.remove(task.id);
                            continue;
                        }
                        const res = await fetchWithTimeout(`${API_BASE_URL}/projects/${task.payload.projectId}`, {
                            method: "DELETE",
                            headers
                        });
                        if (res.ok || res.status === 404) {
                            await syncQueueDB.remove(task.id);
                        }
                    } else if (task.action === "DELETE_TEMPLATE") {
                        if (String(task.payload.templateId).startsWith("local_")) {
                            await syncQueueDB.remove(task.id);
                            continue;
                        }
                        const res = await fetchWithTimeout(`${API_BASE_URL}/templates/${task.payload.templateId}`, {
                            method: "DELETE",
                            headers
                        });
                        if (res.ok || res.status === 404) {
                            await syncQueueDB.remove(task.id);
                        }
                    } else if (task.action === "RETRY_REQUEST") {
                        // Generic queued HTTP retry (e.g. assessment/progress
                        // updates queued by AssessmentPage.jsx via
                        // syncQueueDB.setItem when the direct submit failed
                        // or the user was offline). Replays the exact
                        // request and clears it from the queue once it
                        // succeeds.
                        const { url, method, payload: reqPayload } = task.payload || {};
                        if (!url) { await syncQueueDB.remove(task.id); continue; }
                        const res = await fetchWithTimeout(url, {
                            method: method || "POST",
                            headers,
                            body: reqPayload !== undefined ? JSON.stringify(reqPayload) : undefined
                        });
                        if (res.ok) {
                            await syncQueueDB.remove(task.id);
                        }
                    }
                } catch (e) {
                    console.error(`Failed to execute queued action: ${task.action}`, e);
                }
            }

        } catch (error) {
            console.error("Critical error during sync manager execution:", error);
        } finally {
            if (announced) window.dispatchEvent(new Event("sync-end"));
        }
    },

    /**
     * Pushes ONE local project or template to the cloud, safely.
     * Returns "ok" | "skipped" | "failed" | "rate_limited" | "dropped".
     */
    async _pushItem(kind, key, headers, force = false) {
        const cfg = ITEM_KINDS[kind];
        if (key === null || key === undefined) return "skipped";

        for (let attempt = 0; attempt < 2; attempt++) {
            // Fresh read: another pass/tab may have synced, edited or deleted it.
            const project = await cfg.db.get(key);
            if (!project || project.isSynced) return "skipped";
            if (!force && project.nextRetryAt && project.nextRetryAt > Date.now()) return "skipped";

            // Stable idempotency key. A project created offline is born as
            // "local_proj_..."; that value becomes its clientId and is kept on the
            // record forever (even after the server id replaces the key), so every
            // retry of the same project carries the same clientId.
            const clientId = project.clientId || (isLocalId(key) ? String(key) : null);
            const serverId = isLocalId(key) ? null : String(project[cfg.idField] || project._id);
            // attempt 1 only happens after a 404 on update (the cloud copy no
            // longer exists): recreate it from the local copy instead of looping.
            const sendId = attempt === 0 ? serverId : null;
            const sentVersion = versionOf(project);

            let res;
            try {
                res = await fetchWithTimeout(`${API_BASE_URL}${cfg.endpoint}`, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({ ...project, [cfg.idField]: sendId, clientId })
                });
            } catch (e) {
                // Network error / timeout. The server may or may not have received it --
                // which is exactly why clientId matters: the retry cannot duplicate.
                console.error(`Failed to sync ${kind} ${key}`, e);
                await SyncManager._markFailed(kind, key);
                return "failed";
            }

            if (res.ok) {
                const data = await res.json().catch(() => ({}));
                const canonicalId = String(data[cfg.idField] || serverId || key);
                const rowId = data._id ? String(data._id) : canonicalId;

                const latest = await cfg.db.get(key);
                if (!latest) {
                    // Deleted locally while the upload was in flight: make sure the
                    // cloud copy we just created does not live on as a ghost.
                    if (!isLocalId(canonicalId)) await syncQueueDB.add(cfg.deleteAction, { [cfg.idField]: canonicalId });
                    return "ok";
                }

                // Edited again during the upload? Then the newest edit still needs a push.
                const editedMeanwhile = versionOf(latest) !== sentVersion;
                const { nextRetryAt, syncFailures, ...clean } = latest;
                await cfg.db.save({
                    ...clean,
                    [cfg.idField]: canonicalId,
                    _id: rowId,
                    clientId: clientId || clean.clientId,
                    isSynced: !editedMeanwhile,
                    synced: !editedMeanwhile,
                });
                // Save under the canonical key FIRST, then drop the temporary one, so a
                // crash in between can only leave a harmless extra copy, never lose data.
                if (String(canonicalId) !== String(key)) await cfg.db.delete(key);
                return "ok";
            }

            if (res.status === 404 && attempt === 0 && serverId) continue; // cloud copy gone -> recreate once

            if (res.status === 429) {
                const retryAfter = parseInt(res.headers.get("Retry-After") || "", 10);
                rateLimitedUntil = Date.now() + (Number.isFinite(retryAfter) ? retryAfter * 1000 : 60000);
                return "rate_limited";
            }

            if (res.status === 403) {
                let detail = "";
                try { detail = (await res.json())?.detail || ""; } catch (e) {}
                const isLimit = /limit reached/i.test(detail);
                if (isLimit || !serverId || cfg.dropOnForbidden) {
                    // Permanent rejection (account at its cap, or not the owner), not a
                    // connectivity problem -- retrying would 403 forever. Drop the local
                    // copy; only the cap case is worth telling the person about.
                    await cfg.db.delete(key);
                    if (isLimit || !serverId) {
                        window.dispatchEvent(new CustomEvent("syncLimitReached", {
                            detail: { kind, message: detail || cfg.limitMessage }
                        }));
                    }
                    return "dropped";
                }
            }

            // Any other failure (5xx, validation error...): keep the local copy and
            // back off instead of retrying every 30s forever.
            await SyncManager._markFailed(kind, key);
            return "failed";
        }
        return "failed";
    },

    async _markFailed(kind, key) {
        const cfg = ITEM_KINDS[kind];
        try {
            const rec = await cfg.db.get(key);
            if (!rec || rec.isSynced) return;
            const failures = (rec.syncFailures || 0) + 1;
            await cfg.db.save({ ...rec, syncFailures: failures, nextRetryAt: Date.now() + nextRetryDelay(failures) });
        } catch (e) { /* best effort */ }
    },

    /**
     * Queues a project deletion to ensure it reaches Postgres when online
     */
    async queueProjectDeletion(projectId) {
        await projectsDB.delete(projectId);

        // A "local_"-prefixed id belongs to a project that was created (and,
        // in this case, deleted) before it was ever pushed to Postgres --
        // the backend has never heard of it, so there is nothing remote to
        // delete. Queuing a retry for it would keep failing against the
        // backend forever (it can't recognize the id) and leave a
        // permanently-stuck "Local Pending" entry that not even Force Sync
        // could ever resolve. Deleting the local copy above is the entire
        // operation in that case.
        if (String(projectId).startsWith("local_")) return;

        if (!navigator.onLine) {
            await syncQueueDB.add("DELETE_PROJECT", { projectId });
            return;
        }

        const headers = getAuthHeaders();
        if (!headers) return;

        try {
            const res = await fetchWithTimeout(`${API_BASE_URL}/projects/${projectId}`, {
                method: "DELETE",
                headers
            });
            if (!res.ok) throw new Error("Failed to delete remotely");
        } catch (e) {
            await syncQueueDB.add("DELETE_PROJECT", { projectId });
        }
    },

    /**
     * Queues a template deletion to ensure it reaches Postgres when online
     */
    async queueTemplateDeletion(templateId) {
        if(templatesDB.delete) {
            await templatesDB.delete(templateId);
        }

        // See queueProjectDeletion above -- a "local_"-prefixed id was never
        // pushed to Postgres, so there is nothing remote to delete and
        // nothing worth queuing (it would just fail and get stuck forever).
        if (String(templateId).startsWith("local_")) return;

        if (!navigator.onLine) {
            await syncQueueDB.add("DELETE_TEMPLATE", { templateId });
            return;
        }

        const headers = getAuthHeaders();
        if (!headers) return;

        try {
            const res = await fetchWithTimeout(`${API_BASE_URL}/templates/${templateId}`, {
                method: "DELETE",
                headers
            });
            if (!res.ok) throw new Error("Failed to delete remotely");
        } catch (e) {
            await syncQueueDB.add("DELETE_TEMPLATE", { templateId });
        }
    },

    /**
     * Pulls the user's projects (or templates) from the cloud and merges them into IndexedDB
     * WITHOUT creating duplicates.
     *
     * Local records can be keyed three different ways for the same project: the
     * temporary "local_proj_..." key, the server's numeric row id (written by older
     * builds) and the server's canonical projectId. The old merge only looked the
     * remote project up by projectId, so a project that had just been pushed under
     * another key was inserted a second time on the next pull -- which is why
     * synced projects showed up twice. Match on all three (plus clientId) instead.
     */
    async pullProjects(headersArg) { return SyncManager._pullItems("project", headersArg); },

    async pullTemplates(headersArg) { return SyncManager._pullItems("template", headersArg); },

    async _pullItems(kind, headersArg) {
        const cfg = ITEM_KINDS[kind];
        if (!navigator.onLine) return false;
        const headers = headersArg || getAuthHeaders();
        if (!headers) return false;
        if (pullInFlight[kind] && !headersArg) return pullInFlight[kind];

        const run = async () => {
            const res = await fetchWithTimeout(`${API_BASE_URL}${cfg.endpoint}`, { headers });
            if (!res.ok) return false;
            const body = await res.json().catch(() => ({}));
            const items = Array.isArray(body) ? body : body[cfg.listKey] || [];

            let currentEmail = null;
            try {
                const raw = localStorage.getItem("user") || sessionStorage.getItem("user");
                currentEmail = raw && raw !== "null" ? JSON.parse(raw)?.email || null : null;
            } catch (e) {}
            const locals = await cfg.db.getAll();
            const byKey = new Map();
            const byClient = new Map();
            for (const l of locals) {
                const k = String(recordKey(l));
                byKey.set(k, l);
                const cid = l.clientId || (isLocalId(k) ? k : null);
                if (cid) byClient.set(String(cid), l);
            }

            for (const remote of items) {
                try {
                    const canonical = String(remote[cfg.idField] || remote._id || "");
                    if (!canonical) continue;

                    const local =
                        byKey.get(canonical) ||
                        (owned && remote._id !== undefined ? byKey.get(String(remote._id)) : undefined) ||
                        (owned && remote.clientId ? byClient.get(String(remote.clientId)) : undefined);

                    // GET /templates returns other accounts' templates too. Those are not
                    // ours to reconcile by clientId; keep the original simple merge.
                    const owned = kind === "project" || !currentEmail ||
                        remote.userId === currentEmail || remote.owner_id === currentEmail;
                    // Fresh read: a push may have finished since the snapshot above.
                    const current = local ? await cfg.db.get(recordKey(local)) : null;
                    if (current && !current.isSynced && (current.timestamp || 0) >= (remote.timestamp || 0)) {
                        continue; // unsynced local edits win; they go up on the next push
                    }

                    await cfg.db.save({
                        ...remote,
                        [cfg.idField]: canonical,
                        clientId: remote.clientId || current?.clientId || undefined,
                        isSynced: true,
                        synced: true,
                    });
                    // Same project stored under a different key -> remove the stale twin.
                    if (current && String(recordKey(current)) !== canonical) {
                        await cfg.db.delete(recordKey(current));
                    }
                } catch (e) {
                    console.error(`Failed to merge pulled ${kind} ${canonical}`, e);
                }
            }

            // Heal twins left behind by older builds: a synced record keyed by the
            // numeric row id that also exists under its canonical projectId.
            const after = await cfg.db.getAll();
            const byRowId = new Set(after.filter(p => !/^\d+$/.test(String(recordKey(p)))).map(p => String(p._id)));
            for (const p of after) {
                const k = String(recordKey(p));
                if (/^\d+$/.test(k) && p.isSynced && byRowId.has(k)) await cfg.db.delete(recordKey(p));
            }
            return true;
        };

        if (headersArg) return run(); // already inside a serialized pull
        pullInFlight[kind] = serialize(run).finally(() => { pullInFlight[kind] = null; });
        return pullInFlight[kind];
    },

    /**
     * Forces an immediate pull of the latest relational state from Postgres 
     * and updates the local IndexedDB stores.
     */
    async pullRemoteState() {
        // Serialized with push passes so a pull can never interleave with a push
        // that is in the middle of re-keying a project.
        return serialize(() => SyncManager._pullRemoteStateImpl());
    },

    async _pullRemoteStateImpl() {
        if (!navigator.onLine) return;
        const headers = getAuthHeaders();
        if (!headers) return;

        try {
            // Pull Progress
            const userRes = await fetchWithTimeout(`${API_BASE_URL}/get-progress`, { headers });
            if (userRes.ok) {
                const data = await userRes.json();
                if (data.progress) {
                    for (const [lesson_id, score] of Object.entries(data.progress)) {
                        await progressDB.save({ lesson_id, score, isSynced: true });
                    }
                }
            }

            // Pull Assessments
            const assessmentRes = await fetchWithTimeout(`${API_BASE_URL}/get-assessments`, { headers });
            if (assessmentRes.ok) {
                const data = await assessmentRes.json();
                if (data.assessments) {
                    for (const [assessmentId, details] of Object.entries(data.assessments)) {
                        await assessmentsDB.save({ assessmentId, ...details, isSynced: true });
                    }
                }
            }

            // Pull Submissions
            const submissionsRes = await fetchWithTimeout(`${API_BASE_URL}/get-all-submissions`, { headers });
            if (submissionsRes.ok) {
                const subData = await submissionsRes.json();
                if (subData.submissions) {
                    for (const sub of subData.submissions) {
                        // BUG FIX: this used to look up `sub.activityId` (e.g. "m0_l1_a1"),
                        // but submissions are keyed locally by the composite string
                        // "${userId}_${moduleId}_${activityId}" -- that lookup could
                        // never match, so every pulled submission was treated as "not
                        // present locally" and re-saved via submissionsDB.save(sub).
                        // Older submissions synced before the id fix above won't have
                        // `sub.id` either, so reconstruct the same composite key as a
                        // fallback instead of skipping them.
                        const subId = sub.id || (sub.userId && sub.moduleId && sub.activityId
                            ? `${sub.userId}_${sub.moduleId}_${sub.activityId}`
                            : null);
                        if (!subId) continue;

                        try {
                            const localSub = await submissionsDB.get(subId);
                            if (!localSub || localSub.isSynced || (localSub.timestamp || 0) < (sub.timestamp || 0)) {
                                // submissionsDB's store requires an "id" key -- without
                                // it, save() throws and (previously) aborted this whole
                                // for-loop, silently skipping every submission after it
                                // AND the Projects/Templates/Onboarding pulls below.
                                await submissionsDB.save({ ...sub, id: subId, isSynced: true });
                            }
                        } catch (e) {
                            // Isolated to this one record -- one bad/legacy row can no
                            // longer take down the rest of the sync cycle.
                            console.error(`Failed to merge pulled submission ${subId}`, e);
                        }
                    }
                }
            }

            // Pull Projects (identity-aware merge; see pullProjects)
            await SyncManager.pullProjects(headers);
            
            // Pull Templates (identity-aware merge, same as projects)
            await SyncManager.pullTemplates(headers);
            // Pull Onboarding Tour Progress
            const onboardingRes = await fetchWithTimeout(`${API_BASE_URL}/get-onboarding`, { headers });
            if (onboardingRes.ok) {
                const onboardingData = await onboardingRes.json();
                if (onboardingData.onboarding_state) {
                    const activeStorage = localStorage.getItem("user") ? localStorage : sessionStorage;
                    const storedUser = activeStorage.getItem("user");
                    if (storedUser && storedUser !== "null" && storedUser !== "undefined") {
                        try {
                            const parsedUser = JSON.parse(storedUser);
                            activeStorage.setItem("user", JSON.stringify({
                                ...parsedUser,
                                onboarding_state: onboardingData.onboarding_state,
                            }));
                            // OnboardingContext listens for this event and re-merges
                            // the freshly pulled server state with its local cache,
                            // which is what actually suppresses a tour on this
                            // device once another device has completed it.
                            window.dispatchEvent(new Event("localDataSynced"));
                        } catch (e) {
                            console.error("Failed to apply pulled onboarding state", e);
                        }
                    }
                }
            }

            // BUG FIX: "localDataSynced" used to only be dispatched from inside
            // the onboarding-state branch above, so it only fired when the
            // account actually had a server-side onboarding_state to apply.
            // Progress/assessments/submissions/projects/templates were still
            // pulled and written to IndexedDB just fine on every cycle -- but
            // LearningPath.jsx, Dashboard.jsx, and Projects.jsx all listen for
            // this exact event to know when to re-read local DB state into
            // React state, and never got told anything had changed. Net
            // effect: a freshly-synced "passed" submission (e.g. finishing an
            // activity on another device, or the periodic background pull
            // catching up) would sit correctly in IndexedDB while the
            // Learning Path's "Activities Done" counts and unlock state kept
            // showing whatever was loaded on the last full page mount, until
            // the user hard-refreshed. Fire it once here, unconditionally,
            // after every successful pull cycle so all of that local state
            // actually gets refreshed.
            window.dispatchEvent(new Event("localDataSynced"));
        } catch (error) {
            console.error("Failed to pull remote Postgres state:", error);
        }
    }
};

// ==========================================
// Periodic Background Syncing Exports
// ==========================================

let syncIntervalId = null;
let lastPullTimestamp = 0;

// Minimum time between pullRemoteState() calls, independent of the push
// interval. pullRemoteState() always fires 6 GET requests (progress,
// assessments, submissions, projects, templates, onboarding) no matter
// whether anything actually changed remotely -- it exists to catch
// cross-device edits, which are comparatively rare. syncDataWithServer()
// (the push side) is already cheap on its own: it loops over locally
// unsynced records, so it makes zero network calls when there's nothing
// to push. Throttling the pull side separately, on a longer cadence,
// keeps cross-device sync working while cutting the dominant source of
// ambient serverless invocations (and Neon compute wake-ups) per open tab.
const PULL_MIN_INTERVAL_MS = 120000; // 2 minutes

const maybePullRemoteState = (force = false) => {
    const now = Date.now();
    if (!force && now - lastPullTimestamp < PULL_MIN_INTERVAL_MS) return;
    lastPullTimestamp = now;
    SyncManager.pullRemoteState();
};

export const startBackgroundSync = (intervalMs = 30000) => {
    if (syncIntervalId) clearInterval(syncIntervalId);

    // Initial sync + pull on start, always forced so the user sees fresh
    // state right after login/reload rather than waiting for the throttle.
    SyncManager.syncDataWithServer();
    maybePullRemoteState(true);

    // Set interval for periodic syncing
    syncIntervalId = setInterval(() => {
        // Skip the whole cycle while the tab is in the background. Students
        // routinely leave AlgoBlocks open in an inactive tab; there's
        // nothing to push/pull that anyone is looking at, so there's no
        // reason to keep hitting the API (and keeping Neon's compute
        // awake) for it. Sync resumes automatically via the
        // visibilitychange listener below the moment the tab is focused
        // again.
        if (document.hidden) return;

        SyncManager.syncDataWithServer(); // no-op network-wise when nothing's unsynced
        maybePullRemoteState();           // throttled independently, see above
    }, intervalMs);
};

export const stopBackgroundSync = () => {
    if (syncIntervalId) {
        clearInterval(syncIntervalId);
        syncIntervalId = null;
    }
};

// Catch up immediately when a backgrounded tab regains focus, instead of
// waiting out the rest of the poll interval -- keeps the UX snappy while
// still respecting PULL_MIN_INTERVAL_MS so rapid tab-switching can't be
// used to bypass the throttle.
document.addEventListener("visibilitychange", () => {
    if (!document.hidden && syncIntervalId) {
        SyncManager.syncDataWithServer();
        maybePullRemoteState();
    }
});

// ==========================================
// Compatibility exports
// ==========================================
// Several pages (DashboardHeader, Projects, MainApp, LearningPath) import a
// lower-cased `syncManager` object with a `processSyncQueue()` method, and a
// standalone `syncDownFromServer()` function. These names were used across
// the app but never actually defined here after the Postgres migration,
// which broke the module graph (any page importing them failed to load,
// producing a blank screen). Re-export the real implementation under those
// names so every caller resolves correctly.
export const syncManager = {
    ...SyncManager,
    // Pushes any unsynced local data (including the offline action queue)
    // up to the Postgres backend.
    processSyncQueue: (opts) => SyncManager.syncDataWithServer(opts),
};

// Pulls the latest server-side state down into local IndexedDB.
export const syncDownFromServer = () => SyncManager.pullRemoteState();

// Automatically sync when coming back online
window.addEventListener('online', () => {
    SyncManager.syncDataWithServer();
    SyncManager.pullRemoteState();
});