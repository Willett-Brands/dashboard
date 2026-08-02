import { writeFileSync, mkdirSync } from 'node:fs';

const TOKEN = process.env.DASHBOARD_TOKEN;
const REPOS = ['brian-willettbrands/kaydence', 'brian-willettbrands/engagement-hub'];
const DOCS_PATH = 'docs/specs';

if (!TOKEN) {
    console.error('DASHBOARD_TOKEN is not set');
    process.exit(1);
}

async function ghFetch(path) {
    const res = await fetch(`https://api.github.com${path}`, {
        headers: {
            Authorization: `Bearer ${TOKEN}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
        },
    });

    if (res.status === 404) return null;

    if (!res.ok) {
        throw new Error(`${path} -> ${res.status} ${await res.text()}`);
    }

    return res.json();
}

function titleFromContent(content, fallbackName) {
    const heading = content.match(/^#\s+(.+)$/m);
    if (heading) return heading[1].trim();

    return fallbackName
        .replace(/\.md$/i, '')
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function repoDocs(repo) {
    const entries = await ghFetch(`/repos/${repo}/contents/${DOCS_PATH}`);

    // No docs/specs directory yet for this repo (e.g. kaydence, for now) -
    // not an error, just nothing to show until it's added later.
    if (!entries) return [];

    const files = entries.filter((e) => e.type === 'file' && e.name.endsWith('.md'));

    return Promise.all(
        files.map(async (f) => {
            const [file, commits] = await Promise.all([
                ghFetch(`/repos/${repo}/contents/${f.path}`),
                ghFetch(`/repos/${repo}/commits?path=${encodeURIComponent(f.path)}&per_page=1`),
            ]);
            const content = Buffer.from(file.content, 'base64').toString('utf-8');

            return {
                repo: repo.split('/')[1],
                name: f.name,
                path: f.path,
                title: titleFromContent(content, f.name),
                content,
                updatedAt: commits?.[0]?.commit?.author?.date ?? null,
                updatedBy: commits?.[0]?.author?.login ?? commits?.[0]?.commit?.author?.name ?? null,
                url: `https://github.com/${repo}/blob/main/${f.path}`,
            };
        })
    );
}

const docLists = await Promise.all(REPOS.map(repoDocs));
const docs = docLists.flat().sort((a, b) => a.title.localeCompare(b.title));

mkdirSync('_site', { recursive: true });
writeFileSync(
    '_site/docs.json',
    JSON.stringify({ generatedAt: new Date().toISOString(), docs }, null, 2)
);

console.log(`Wrote ${docs.length} doc(s) across ${REPOS.length} repos.`);
