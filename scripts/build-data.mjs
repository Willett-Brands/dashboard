import { writeFileSync, mkdirSync } from 'node:fs';

const TOKEN = process.env.DASHBOARD_TOKEN;
const REPOS = ['brian-willettbrands/kaydence', 'brian-willettbrands/engagement-hub'];

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

    if (!res.ok) {
        throw new Error(`${path} -> ${res.status} ${await res.text()}`);
    }

    return res.json();
}

async function repoCommits(repo) {
    const commits = await ghFetch(`/repos/${repo}/commits?per_page=30`);

    return commits.map((c) => ({
        repo: repo.split('/')[1],
        sha: c.sha.slice(0, 7),
        message: c.commit.message.split('\n')[0],
        author: c.commit.author?.name ?? 'unknown',
        date: c.commit.author?.date,
        url: c.html_url,
    }));
}

async function repoIssues(repo) {
    const issues = await ghFetch(`/repos/${repo}/issues?state=all&per_page=50`);

    return issues
        .filter((i) => !i.pull_request)
        .map((i) => ({
            repo: repo.split('/')[1],
            number: i.number,
            title: i.title,
            state: i.state,
            labels: i.labels.map((l) => (typeof l === 'string' ? l : l.name)),
            assignees: i.assignees.map((a) => a.login),
            createdAt: i.created_at,
            updatedAt: i.updated_at,
            url: i.html_url,
        }));
}

async function repoPulls(repo) {
    const pulls = await ghFetch(`/repos/${repo}/pulls?state=all&per_page=30`);

    return pulls.map((p) => ({
        repo: repo.split('/')[1],
        number: p.number,
        title: p.title,
        status: p.merged_at ? 'merged' : p.state === 'closed' ? 'closed' : p.draft ? 'draft' : 'open',
        author: p.user?.login ?? 'unknown',
        createdAt: p.created_at,
        updatedAt: p.updated_at,
        url: p.html_url,
    }));
}

const [commitLists, issueLists, pullLists] = await Promise.all([
    Promise.all(REPOS.map(repoCommits)),
    Promise.all(REPOS.map(repoIssues)),
    Promise.all(REPOS.map(repoPulls)),
]);

const commits = commitLists.flat().sort((a, b) => new Date(b.date) - new Date(a.date));
const issues = issueLists.flat().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
const pulls = pullLists.flat().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

mkdirSync('_site', { recursive: true });
writeFileSync(
    '_site/data.json',
    JSON.stringify({ generatedAt: new Date().toISOString(), commits, issues, pulls }, null, 2)
);

console.log(`Wrote ${commits.length} commits, ${issues.length} issues, ${pulls.length} pull requests.`);
